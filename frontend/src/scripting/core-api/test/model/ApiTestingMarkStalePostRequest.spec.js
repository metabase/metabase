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
    instance = new MetabaseApi.ApiTestingMarkStalePostRequest();
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

  describe('ApiTestingMarkStalePostRequest', function() {
    it('should create an instance of ApiTestingMarkStalePostRequest', function() {
      // uncomment below and update the code to test ApiTestingMarkStalePostRequest
      //var instance = new MetabaseApi.ApiTestingMarkStalePostRequest();
      //expect(instance).to.be.a(MetabaseApi.ApiTestingMarkStalePostRequest);
    });

    it('should have the property dateStr (base name: "date-str")', function() {
      // uncomment below and update the code to test the property dateStr
      //var instance = new MetabaseApi.ApiTestingMarkStalePostRequest();
      //expect(instance).to.be();
    });

    it('should have the property id (base name: "id")', function() {
      // uncomment below and update the code to test the property id
      //var instance = new MetabaseApi.ApiTestingMarkStalePostRequest();
      //expect(instance).to.be();
    });

    it('should have the property model (base name: "model")', function() {
      // uncomment below and update the code to test the property model
      //var instance = new MetabaseApi.ApiTestingMarkStalePostRequest();
      //expect(instance).to.be();
    });

  });

}));
