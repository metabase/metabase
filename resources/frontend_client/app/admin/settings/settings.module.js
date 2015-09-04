'use strict';

var SettingsAdmin = angular.module('metabaseadmin.settings', [
    'metabaseadmin.settings.controllers',
    'metabaseadmin.settings.services'
]);

SettingsAdmin.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/admin/settings/', {
        template: '<div class="flex flex-column flex-full scroll-x" mb-react-component="SettingsEditor"></div>',
        controller: 'SettingsEditor',
        resolve: {
            settings: ['SettingsAdminServices', async function(SettingsAdminServices) {
                var settings = await SettingsAdminServices.list().$promise
                return settings.map(function(setting) {
                    setting.originalValue = setting.value;
                    return setting;
                });
            }]
        }
    });
}]);
