import 'metabase/services';

describe('metabase.services', function() {
    beforeEach(angular.mock.module('metabase.services'));

    describe('Metabase', function() {
        it('should return empty list of databases', inject(function(Metabase, $httpBackend) {
            $httpBackend.expect('GET', '/api/database')
                .respond(200, '[]');

            Metabase.db_list().$promise.then(function(data) {
                expect(data.length).toEqual(0);
            });

            $httpBackend.flush();
        }));
    });
});
