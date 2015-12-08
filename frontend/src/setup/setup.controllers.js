import { createStore, combineReducers } from "metabase/lib/redux";

import SetupApp from 'metabase/setup/containers/SetupApp.jsx';
import * as reducers from 'metabase/setup/reducers';

const reducer = combineReducers(reducers);

var SetupControllers = angular.module('metabase.setup.controllers', ['metabase.services']);
SetupControllers.controller('SetupController', ['$scope', '$location', '$timeout', 'ipCookie', function($scope, $location, $timeout, ipCookie) {
    $scope.Component = SetupApp;
    $scope.props = {
        setSessionFn: function(sessionId) {
            // TODO - this session cookie code needs to be somewhere easily reusable
            var isSecure = ($location.protocol() === "https") ? true : false;
            ipCookie('metabase.SESSION_ID', sessionId, {
                path: '/',
                expires: 14,
                secure: isSecure
            });

            // send a login notification event
            $scope.$emit('appstate:login', sessionId);

            // this is ridiculously stupid.  we have to wait (300ms) for the cookie to actually be set in the browser :(
            return $timeout(function(){}, 1000);
        }
    };
    $scope.store = createStore(reducer, { activeStep: 0, allowTracking: true, setupComplete: false });
}]);
