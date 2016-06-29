import "metabase/services";
import { createStore } from "metabase/lib/redux";
import SetttingsEditorApp from "./containers/SettingsEditorApp.jsx";
import settingsReducers from "./settings";

angular
.module('metabase.admin.settings', ['metabase.services'])
.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/admin/settings/', {
        template: '<div class="full-height" mb-redux-component />',
        controller: ['$scope', '$location', 'AppState',
            function($scope, $location, AppState) {
                $scope.Component = SetttingsEditorApp;
                $scope.props = {};
                $scope.store = createStore(settingsReducers, {
                    refreshSiteSettings: () => AppState.refreshSiteSettings(),
                    activeSection: $location.search().section || "Setup"
                });
            }
        ],
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    });
}]);
