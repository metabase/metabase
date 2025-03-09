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
    instance = new MetabaseApi.ApiPersistApi();
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

  describe('ApiPersistApi', function() {
    describe('apiPersistCardCardIdGet', function() {
      it('should call apiPersistCardCardIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPersistCardCardIdGet
        //instance.apiPersistCardCardIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPersistCardCardIdPersistPost', function() {
      it('should call apiPersistCardCardIdPersistPost successfully', function(done) {
        //uncomment below and update the code to test apiPersistCardCardIdPersistPost
        //instance.apiPersistCardCardIdPersistPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPersistCardCardIdRefreshPost', function() {
      it('should call apiPersistCardCardIdRefreshPost successfully', function(done) {
        //uncomment below and update the code to test apiPersistCardCardIdRefreshPost
        //instance.apiPersistCardCardIdRefreshPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPersistCardCardIdUnpersistPost', function() {
      it('should call apiPersistCardCardIdUnpersistPost successfully', function(done) {
        //uncomment below and update the code to test apiPersistCardCardIdUnpersistPost
        //instance.apiPersistCardCardIdUnpersistPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPersistDatabaseIdPersistPost', function() {
      it('should call apiPersistDatabaseIdPersistPost successfully', function(done) {
        //uncomment below and update the code to test apiPersistDatabaseIdPersistPost
        //instance.apiPersistDatabaseIdPersistPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPersistDatabaseIdUnpersistPost', function() {
      it('should call apiPersistDatabaseIdUnpersistPost successfully', function(done) {
        //uncomment below and update the code to test apiPersistDatabaseIdUnpersistPost
        //instance.apiPersistDatabaseIdUnpersistPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPersistDisablePost', function() {
      it('should call apiPersistDisablePost successfully', function(done) {
        //uncomment below and update the code to test apiPersistDisablePost
        //instance.apiPersistDisablePost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPersistEnablePost', function() {
      it('should call apiPersistEnablePost successfully', function(done) {
        //uncomment below and update the code to test apiPersistEnablePost
        //instance.apiPersistEnablePost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPersistGet', function() {
      it('should call apiPersistGet successfully', function(done) {
        //uncomment below and update the code to test apiPersistGet
        //instance.apiPersistGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPersistPersistedInfoIdGet', function() {
      it('should call apiPersistPersistedInfoIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPersistPersistedInfoIdGet
        //instance.apiPersistPersistedInfoIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPersistSetRefreshSchedulePost', function() {
      it('should call apiPersistSetRefreshSchedulePost successfully', function(done) {
        //uncomment below and update the code to test apiPersistSetRefreshSchedulePost
        //instance.apiPersistSetRefreshSchedulePost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
  });

}));
