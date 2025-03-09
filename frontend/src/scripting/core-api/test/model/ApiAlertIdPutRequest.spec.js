/**
 * Metabase API
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * The version of the OpenAPI document: v1.53.2-SNAPSHOT
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD.
    define(['expect.js', process.cwd()+'/src/index'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    factory(require('expect.js'), require(process.cwd()+'/src/index'));
  } else {
    // Browser globals (root is window)
    factory(root.expect, root.MetabaseApi);
  }
}(this, function(expect, MetabaseApi) {
  'use strict';

  var instance;

  beforeEach(function() {
    instance = new MetabaseApi.ApiAlertIdPutRequest();
  });

  var getProperty = function(object, getter, property) {
    // Use getter method if present; otherwise, get the property directly.
    if (typeof object[getter] === 'function')
      return object[getter]();
    else
      return object[property];
  }

  var setProperty = function(object, setter, property, value) {
    // Use setter method if present; otherwise, set the property directly.
    if (typeof object[setter] === 'function')
      object[setter](value);
    else
      object[property] = value;
  }

  describe('ApiAlertIdPutRequest', function() {
    it('should create an instance of ApiAlertIdPutRequest', function() {
      // uncomment below and update the code to test ApiAlertIdPutRequest
      //var instance = new MetabaseApi.ApiAlertIdPutRequest();
      //expect(instance).to.be.a(MetabaseApi.ApiAlertIdPutRequest);
    });

    it('should have the property alertAboveGoal (base name: "alert_above_goal")', function() {
      // uncomment below and update the code to test the property alertAboveGoal
      //var instance = new MetabaseApi.ApiAlertIdPutRequest();
      //expect(instance).to.be();
    });

    it('should have the property alertCondition (base name: "alert_condition")', function() {
      // uncomment below and update the code to test the property alertCondition
      //var instance = new MetabaseApi.ApiAlertIdPutRequest();
      //expect(instance).to.be();
    });

    it('should have the property alertFirstOnly (base name: "alert_first_only")', function() {
      // uncomment below and update the code to test the property alertFirstOnly
      //var instance = new MetabaseApi.ApiAlertIdPutRequest();
      //expect(instance).to.be();
    });

    it('should have the property archived (base name: "archived")', function() {
      // uncomment below and update the code to test the property archived
      //var instance = new MetabaseApi.ApiAlertIdPutRequest();
      //expect(instance).to.be();
    });

    it('should have the property card (base name: "card")', function() {
      // uncomment below and update the code to test the property card
      //var instance = new MetabaseApi.ApiAlertIdPutRequest();
      //expect(instance).to.be();
    });

    it('should have the property channels (base name: "channels")', function() {
      // uncomment below and update the code to test the property channels
      //var instance = new MetabaseApi.ApiAlertIdPutRequest();
      //expect(instance).to.be();
    });

  });

}));
