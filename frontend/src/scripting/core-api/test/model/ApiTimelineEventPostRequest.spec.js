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
    instance = new MetabaseApi.ApiTimelineEventPostRequest();
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

  describe('ApiTimelineEventPostRequest', function() {
    it('should create an instance of ApiTimelineEventPostRequest', function() {
      // uncomment below and update the code to test ApiTimelineEventPostRequest
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be.a(MetabaseApi.ApiTimelineEventPostRequest);
    });

    it('should have the property questionId (base name: "question_id")', function() {
      // uncomment below and update the code to test the property questionId
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be();
    });

    it('should have the property timezone (base name: "timezone")', function() {
      // uncomment below and update the code to test the property timezone
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be();
    });

    it('should have the property timestamp (base name: "timestamp")', function() {
      // uncomment below and update the code to test the property timestamp
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be();
    });

    it('should have the property name (base name: "name")', function() {
      // uncomment below and update the code to test the property name
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be();
    });

    it('should have the property archived (base name: "archived")', function() {
      // uncomment below and update the code to test the property archived
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be();
    });

    it('should have the property timelineId (base name: "timeline_id")', function() {
      // uncomment below and update the code to test the property timelineId
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be();
    });

    it('should have the property source (base name: "source")', function() {
      // uncomment below and update the code to test the property source
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be();
    });

    it('should have the property timeMatters (base name: "time_matters")', function() {
      // uncomment below and update the code to test the property timeMatters
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be();
    });

    it('should have the property description (base name: "description")', function() {
      // uncomment below and update the code to test the property description
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be();
    });

    it('should have the property icon (base name: "icon")', function() {
      // uncomment below and update the code to test the property icon
      //var instance = new MetabaseApi.ApiTimelineEventPostRequest();
      //expect(instance).to.be();
    });

  });

}));
