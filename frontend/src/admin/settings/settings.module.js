var SettingsAdmin = angular.module('metabase.admin.settings', [
    'metabase.admin.settings.controllers',
    'metabase.services'
]);

SettingsAdmin.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/admin/settings/', {
        template: '<div class="flex flex-column flex-full" mb-react-component="SettingsEditor"></div>',
        controller: 'SettingsEditor',
        resolve: {
            settings: ['Settings', async function(Settings) {
                var settings = await Settings.list().$promise
                return settings.map(function(setting) {
                    setting.originalValue = setting.value;
                    return setting;
                });
            }]
        }
    });
}]);
