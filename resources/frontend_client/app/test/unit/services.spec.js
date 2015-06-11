'use strict';

import 'metabase/services';
import 'metabase/metabase/metabase.services';

describe('corvus.metabase.services', function() {
    beforeEach(angular.mock.module('corvus.metabase.services'));

    describe('Metabase Service', function() {
        it('should return current version', inject(function(Metabase, $httpBackend) {
            $httpBackend.expect('GET', '/api/meta/db/?org=')
                .respond(200, '[]');

            Metabase.db_list().$promise.then(function(data) {
                expect(data.length).toEqual(0);
            });

            $httpBackend.flush();
        }));
    });
});
