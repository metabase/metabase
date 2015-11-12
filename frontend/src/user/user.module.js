var UserAdmin = angular.module('metabase.user', ['metabase.user.controllers']);

UserAdmin.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/user/edit_current', {
        template: '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: 'EditCurrentUser',
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    });
}]);
