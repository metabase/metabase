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
    instance = new MetabaseApi.ApiPermissionsApi();
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

  describe('ApiPermissionsApi', function() {
    describe('apiPermissionsGraphDbDbIdGet', function() {
      it('should call apiPermissionsGraphDbDbIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsGraphDbDbIdGet
        //instance.apiPermissionsGraphDbDbIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsGraphGet', function() {
      it('should call apiPermissionsGraphGet successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsGraphGet
        //instance.apiPermissionsGraphGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsGraphGroupGroupIdGet', function() {
      it('should call apiPermissionsGraphGroupGroupIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsGraphGroupGroupIdGet
        //instance.apiPermissionsGraphGroupGroupIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsGraphPut', function() {
      it('should call apiPermissionsGraphPut successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsGraphPut
        //instance.apiPermissionsGraphPut(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsGroupGet', function() {
      it('should call apiPermissionsGroupGet successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsGroupGet
        //instance.apiPermissionsGroupGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsGroupGroupIdDelete', function() {
      it('should call apiPermissionsGroupGroupIdDelete successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsGroupGroupIdDelete
        //instance.apiPermissionsGroupGroupIdDelete(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsGroupGroupIdPut', function() {
      it('should call apiPermissionsGroupGroupIdPut successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsGroupGroupIdPut
        //instance.apiPermissionsGroupGroupIdPut(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsGroupIdGet', function() {
      it('should call apiPermissionsGroupIdGet successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsGroupIdGet
        //instance.apiPermissionsGroupIdGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsGroupPost', function() {
      it('should call apiPermissionsGroupPost successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsGroupPost
        //instance.apiPermissionsGroupPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsMembershipGet', function() {
      it('should call apiPermissionsMembershipGet successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsMembershipGet
        //instance.apiPermissionsMembershipGet(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsMembershipGroupIdClearPut', function() {
      it('should call apiPermissionsMembershipGroupIdClearPut successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsMembershipGroupIdClearPut
        //instance.apiPermissionsMembershipGroupIdClearPut(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsMembershipIdDelete', function() {
      it('should call apiPermissionsMembershipIdDelete successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsMembershipIdDelete
        //instance.apiPermissionsMembershipIdDelete(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsMembershipIdPut', function() {
      it('should call apiPermissionsMembershipIdPut successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsMembershipIdPut
        //instance.apiPermissionsMembershipIdPut(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
    describe('apiPermissionsMembershipPost', function() {
      it('should call apiPermissionsMembershipPost successfully', function(done) {
        //uncomment below and update the code to test apiPermissionsMembershipPost
        //instance.apiPermissionsMembershipPost(function(error) {
        //  if (error) throw error;
        //expect().to.be();
        //});
        done();
      });
    });
  });

}));
