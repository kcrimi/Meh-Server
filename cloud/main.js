var Venue = new Parse.Object.extend("Venue");
var Meh = new Parse.Object.extend("Meh");
var AppEvent = new Parse.Object.extend("AppEvent");
var _ = require('underscore');
var foursquare_api_url = "https://api.foursquare.com/v2/";
var client_id = "3MYFOZ3MQD4OY1JFGRUZ3SJI2ILUISEPM3NK1DCZ5GBWUM0E";
var client_secret = 'VKLJ4D1LRYCY4FE4J1VB1LOY4YX2ORFEA0KZUCRCACARG3OH';
var latlong = '40.7200716,-73.995445';
var foursquare_version = '20150608';

// Explore and Caching Venue Data
Parse.Cloud.define("explore", function(request, response) {
  var jsonobj;
  var api_url = foursquare_api_url 
    + "venues/explore?" 
    + request.params.urlParams + "&"
    + "v=" + foursquare_version + "&"
    + "client_id=" + client_id + "&"
    + "client_secret=" + client_secret;

  Parse.Cloud.httpRequest({
    method: "GET",
    url: api_url
  }).then(function(httpResponse) {
    jsonobj = JSON.parse(httpResponse.text);
    return jsonobj.response.groups[0].items;
  }, function(error) {
    jsonobj = JSON.parse(httpResponse.text);
    if (jsonobj.meta.errorType != null){
      // Pass along Foursquare API error
      response.success(jsonobj);
    } else {
      response.error("Parse Cloud Code Error")
    }
  }).then(function(items) {
    var promises = []
    if (items.length > 0) {
      if (items[0].venue.hasOwnProperty('price')) {
        promises.push(cacheVenues(items));
      } else {
        promises.push(addCachedVenueData(items));
      }
      promises.push(addMehDataToItems(items, request.params.userId));
    }
    return Parse.Promise.when(promises);
  }).then(function(message) {
    response.success(jsonobj);
  }, function(error) {
    response.error("Cloud Code Error")
  })
})

function cacheVenues(items) {
  var venueIds = _.map(items, function(item) {
    return item.venue.id;
  });

  var query = new Parse.Query(Venue);
  query.containedIn("foursquare_id", venueIds);

  return query.find().then(
    function(results) {
      var promises = [];
      console.log(" results = " + results.length + " ids = "+venueIds.length);

      _.each(items, function(item) {
        var venue = _.find(results, function(result) {
          if (item.venue.id == result.get("foursquare_id")) {
            return result;
          }
        });
        venue = (venue != null) ? venue : new Venue();

        venue.set("name", item.venue.name);
        venue.set("foursquare_id", item.venue.id);
        venue.set("price", item.venue.price);
        venue.set("hours", item.venue.hours);
        promises.push(venue.save());
      });
      return Parse.Promise.when(promises);
    }
  )
}

function addCachedVenueData(items) {

  var venueIds = _.map(items, function(item) {
    return item.venue.id;
  });
  var query = new Parse.Query(Venue);
  query.containedIn("foursquare_id", venueIds);
  
  return query.find()
  .then(function(results){
    _.each(results, function(result) {
      var item = _.find(items, function (item) {
        if (item.venue.id == result.get("foursquare_id")) {
          return item;
        }
      });
      item.venue.price = result.get("price");
      item.venue.hours = result.get("hours");
    });
    return Parse.Promise
  }, function(error) {
    alert("Error: " + error.code + " " + error.message);
  });
} 


function addMehDataToItems(items, userId) {
  var venueIds = _.map(items, function(item) {
    return item.venue.id;
  });
  console.log("user = "+userId + " venues "+ venueIds);
  var query = new Parse.Query(Meh);
  query.equalTo("user_id", userId);
  query.containedIn("foursquare_id", venueIds);

  return query.find()
  .then(function(results) {
    console.log("results = "+results);
    _.each(results, function(result) {
      var item = _.find(items, function(item) {
        if (item.venue.id == result.get("foursquare_id")) {
          return item;
        }
      });
      item.venue.mehed = true;
    })
    return Parse.Promise;
  }, function(error) {
    alert("Error: " + error.code + " " + error.message);
  });
}

//Retrieve Venue Detail
Parse.Cloud.define("getVenueDetail", function(request, response){
  var jsonobj;
  var api_url = foursquare_api_url + "venues/"
    + request.params.venueId + "?"
    + "v=" + foursquare_version + "&"
    + "client_id=" + client_id + "&"
    + "client_secret=" + client_secret;
  console.log(api_url);

  Parse.Cloud.httpRequest({
    method: "GET",
    url: api_url
  }).then(function(httpResponse) {
    jsonobj = JSON.parse(httpResponse.text);
    return jsonobj;
  }, function(httpResponse) {
    console.error('Request failed with response code ' + httpResponse.status);
  }).then(function(jsonobj) {
    return addMehDataToItems([jsonobj.response], request.params.userId);
  }).then(function() {
    response.success(jsonobj);
  },
  function(error) {
    response.error("Cloud Code Failed");
  });
})

// Mehing
Parse.Cloud.define("meh", function(request, response) {
  var promises = [];
  var query = new Parse.Query(Meh);
  var jsonobj = { venueId: request.params.venueId }
  query.equalTo("foursquare_id", request.params.venueId);
  query.equalTo("user_id", request.params.userId);

  query.find()
  .then(function(results) {
    if (results.length == 0) {
      var m = new Meh();
      m.set("foursquare_id", request.params.venueId);
      m.set("user_id", request.params.userId);
      m.save();
    }
    jsonobj.mehed = true;
  }, function(error) {
    response.error("Error: " + error.code + " " + error.message);
  }).then(function() {
    response.success(jsonobj);
  })



  // promises.push(query.find({
  //   success: function(results){
  //     if(results.length == 0 ){
  //       var m = new Meh();
  //       m.set("foursquare_id", request.params.venueId);
  //       m.set("user_id", request.params.userId);
  //       m.save();
  //     }
  //     jsonobj.mehed = true;
  //   },
  //   error: function(error) {
  //     alert("Error: " +error.code + " " + error.message);
  //   }
  // }));
  // Parse.Promise.when(promises).then(function(){
  //   response.success(jsonobj);
  // });
}) 

Parse.Cloud.define("unmeh", function(request, response) {
  var promises = [];
  var query = new Parse.Query(Meh);
  var jsonobj = { venueId: request.params.venueId }
  query.equalTo("foursquare_id", request.params.venueId);
  query.equalTo("user_id", request.params.userId);
  promises.push(query.first({
    success: function(result){
      result.destroy();
    },
    error: function(error) {
      alert("Error: " +error.code + " " + error.message);
    }
  }));
  jsonobj.mehed = false;
  Parse.Promise.when(promises).then(function(){
    response.success(jsonobj);
  });
}) 

// Check for AppEvents

Parse.Cloud.define("getMinVersion", function(request, response) {
  var promises = [];
  var query = new Parse.Query(AppEvent);
  var jsonobj = {"appEvents":[]};
  query.greaterThan("appVersion", request.params.currentVersion);
  query.equalTo("eventType", "min_app_version");
  query.lessThan("startDate", new Date());
  promises.push(query.find({
    success: function(result) {
      for (var i = 0; i < result.length; i++) {
        jsonobj['appEvents'].push(result[i]);
      }
    },
    error: function(error) {
      alert("Error: " +error.code + " " + error.message);
 
    }
  }));
  Parse.Promise.when(promises).then(function(){
    response.success(jsonobj)
  })
})

//#### BACKGROUND JOBS ####
// clean up cache
Parse.Cloud.job("cleanCache", function(request, status) {
  var cutoffDate = new Date();
  var daysOld = 30;
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  var query = new Parse.Query(Venue);
  query.lessThan("updatedAt",  cutoffDate);
  query.each(function(venue){
    console.log("deleting"+venue);
    venue.destroy();
  }).then(function() {
    // Set the job's success status
    status.success("Clean up Job completed successfully.");
  }, function(error) {
    // Set the job's error status
    status.error("Error with cleanup");
  });
})