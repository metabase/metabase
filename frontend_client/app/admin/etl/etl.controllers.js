'use strict';
/*global _*/

var EtlControllers = angular.module('corvusadmin.etl.controllers', []);

EtlControllers.controller('EtlJobexecList', ['$scope', '$routeParams', '$interval', 'EtlJobExec', function($scope, $routeParams, $interval, EtlJobExec) {

    // $scope.jobexecs
    $scope.filterMode = 'all';
    $scope.sortMode = 'lastexec';
    var jobMonitor;

    $scope.filter = function(mode) {
        $scope.filterMode = mode;

        $scope.$watch('currentOrg', function (org) {
            if (!org) return;

            EtlJobExec.list({
                'orgId': org.id,
                'filterMode': mode
            }, function(result) {
                $scope.jobexecs = result;

                $scope.sort();
            });
        });
    };

    $scope.sort = function() {
        if ('table_name' == $scope.sortMode) {
            $scope.jobexecs.sort(function(a, b) {
                return a.details.table_name.localeCompare(b.details.table_name);
            });
        } else if ('owner' == $scope.sortMode) {
            $scope.jobexecs.sort(function(a, b) {
                return a.job.creator.email.localeCompare(b.job.creator.email);
            });
        } else if ('name' == $scope.sortMode) {
            $scope.jobexecs.sort(function(a, b) {
                return a.job.name.localeCompare(b.job.name);
            });
        } else {
            // default mode is by last exec descending
            $scope.jobexecs.sort(function(a, b) {
                a = new Date(a.created_at);
                b = new Date(b.created_at);

                return a > b ? -1 : a < b ? 1 : 0;
            });
        }
    };

    $scope.canceljobMonitor = function() {
        if (angular.isDefined(jobMonitor)) {
            $interval.cancel(jobMonitor);
            jobMonitor = undefined;
        }
    };

    // determine the appropriate filter to start with
    $scope.filter($scope.filterMode);

    $scope.$on('$destroy', function() {
        $scope.canceljobMonitor();
    });

    // start an interval which will refresh our listing periodically
    jobMonitor = $interval(function() {
        $scope.filter($scope.filterMode);
    }, 30000);
}]);

EtlControllers.controller('EtlJobList', ['$scope', '$routeParams', '$location', 'EtlJob', function($scope, $routeParams, $location, EtlJob) {

    // $scope.jobs
    $scope.filterMode = 'all';
    $scope.sortMode = 'name';

    $scope.filter = function(mode) {
        $scope.filterMode = mode;

        $scope.$watch('currentOrg', function (org) {
            if (!org) return;

            EtlJob.list({
                'orgId': org.id,
                'filterMode': mode
            }, function(result) {
                $scope.jobs = result;

                $scope.sort();
            });
        });
    };

    $scope.sort = function() {
        if ('date' == $scope.sortMode) {
            $scope.jobs.sort(function(a, b) {
                a = new Date(a.updated_at);
                b = new Date(b.updated_at);
                return a > b ? -1 : a < b ? 1 : 0;
            });
        } else if ('org' == $scope.sortMode) {
            $scope.jobs.sort(function(a, b) {
                return a.organization.name.localeCompare(b.organization.name);
            });
        } else if ('owner' == $scope.sortMode) {
            $scope.jobs.sort(function(a, b) {
                return a.creator.email.localeCompare(b.creator.email);
            });
        } else {
            $scope.jobs.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });
        }
    };

    $scope.executeJob = function(jobId) {
        EtlJob.execute({
            'jobId': jobId
        }, function(result) {
            // send the user over to the job exec listing page
            $location.path('/' + $scope.currentOrg.slug + '/admin/etl/jobexec/');
        }, function(error){
            console.log('error', error);
        });
    };

    $scope.deleteJob = function(jobId) {
        if ($scope.jobs) {
            EtlJob.delete({
                'jobId': jobId
            }, function(result) {
                $scope.jobs = _.filter($scope.jobs, function(job){
                    return job.id != jobId;
                });
                $scope.searchFilter = undefined;
            }, function(error){
                console.log(error);
                $scope.alertError('failed to remove job');
            });
        }
    };

    // start by showing all jobs
    $scope.filter($scope.filterMode);

}]);

EtlControllers.controller('EtlJobDetail', ['$scope', '$routeParams', '$location', 'EtlJob', function($scope, $routeParams, $location, EtlJob) {
    // $scope.job
    // $scope.success_message
    // $scope.error_message

    $scope.save = function(jobDetail) {
        $scope.clearStatus();

        if ($scope.job.id) {
            // if there is already an ID associated with the job then we are updating
            EtlJob.update(jobDetail, function(result) {
                if (result && !result.error) {
                    $scope.job = result;

                    // alert
                    $scope.success_message = 'EtlJob saved successfully!';
                } else {
                    console.log(result);

                    $scope.error_message = 'Failed saving EtlJob!';
                }
            });
        } else {
            // otherwise we are creating a new job
            jobDetail.org = $scope.currentOrg.id;

            EtlJob.create(jobDetail, function(result) {
                if (result && !result.error) {
                    $scope.job = result;

                    // move the user over the the actual page for the new job
                    $location.path('/' + $scope.currentOrg.slug + '/admin/etl/job/' + result.id);
                } else {
                    console.log(result);

                    $scope.error_message = 'Failed saving EtlJob!';
                }
            });
        }

    };

    $scope.executeJob = function(jobId) {
        EtlJob.execute({
            'jobId': jobId
        }, function(result) {
            if (result && !result.error) {
                // send user to listing page with a focus on our new job execution
                $location.path('/' + $scope.currentOrg.slug + '/admin/etl/jobexec/');
            } else {
                console.log('error', result);
            }
        });
    };

    $scope.addStep = function() {
        if ($scope.job) {
            $scope.job.details.steps.push({"type":"sql", "sql":{"query":""}});
        }
    };

    $scope.removeStep = function() {
        if ($scope.job) {
            $scope.job.details.steps.splice($scope.job.details.steps.length - 1, 1);

            // strange angularism.  this needs to be here because of the delete-confirm dialog
            // somehow if we don't force digest then the UI won't be notified about our change
            $scope.$digest();
        }
    };

    $scope.clearStatus = function() {
        $scope.success_message = undefined;
        $scope.error_message = undefined;
    };

    EtlJob.form_input(function (form_input) {
        $scope.form_input = form_input;
    }, function (error) {
        console.log('error getting EtlJob form_input', error);
    });

    if ($routeParams.jobId) {
        // fetch the Job data
        EtlJob.get({
            'jobId': $routeParams.jobId
        }, function(result) {
            $scope.job = result;
        }, function(error) {
            console.log(error);
            if (error.status == 404) {
                $location.path('/');
            }
        });
    } else {
        // user must be creating a new Job, so start them off with a basic template
        $scope.job = {
            "name": "",
            "details": {
                "type": "sql_table",
                "database": undefined,
                "table_name": "",
                "steps": [
                    {
                        "type": "sql",
                        "sql": {
                            "query": ""
                        }
                    }
                ]
            }
        };
    }
}]);
