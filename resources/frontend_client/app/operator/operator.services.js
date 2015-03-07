'use strict';
/*jslint browser:true */
/*global _*/
/* Services */

var OperatorServices = angular.module('corvus.operator.services', []);

OperatorServices.service('Operator', ['$resource', '$q', 'Metabase', 'Query',
    function($resource, $q, Metabase, Query) {

        var OPERATOR_DB_NAME = "operator";

        var SPECIALIST_TABLE_NAME = "ps_specialist_details_with_calc_metrics";
        var SPECIALIST_ID_FIELD_NAME = "specialist_id";

        var CONVERSATIONS_TABLE_NAME = "ag_conversations";
        var CONVERSATIONS_ID_FIELD_NAME = "channel_id";
        var CONVERSATIONS_SPECIALIST_FK_NAME = "specialist_id";

        var MESSAGES_TABLE_NAME = "chat_message";
        var MESSAGES_CONVERSATIONS_FK_NAME = "channel_id";

        var SPECIALIST_OVERVIEW_AVG_RATING_QUERY_NAME = "Specialist Entity Avg Rating";
        var SPECIALIST_OVERVIEW_AVG_RESPONSE_TIME_QUERY = "Specialist Entity Avg Response Time Secs";


        this.queryInfo = function(orgId) {
            var deferred = $q.defer();
            var queryInfo = {};
            Metabase.db_list({
                'orgId': orgId
            }, function (dbs){
                dbs.forEach(function(db){
                    if(db.name == OPERATOR_DB_NAME){
                        queryInfo.database = db.id;
                        Metabase.db_tables({dbId:db.id}, function(tables){
                            tables.forEach(function(table){
                                if(table.name == SPECIALIST_TABLE_NAME){
                                    queryInfo.specialist_table = table.id;
                                }else if(table.name == CONVERSATIONS_TABLE_NAME){
                                    queryInfo.conversations_table = table.id;
                                }else if(table.name == MESSAGES_TABLE_NAME){
                                    queryInfo.messages_table = table.id;
                                }
                            });

                            Metabase.table_fields({tableId:queryInfo.specialist_table}, function(specialistTableFields){
                                specialistTableFields.forEach(function(field){
                                    if(field.name == SPECIALIST_ID_FIELD_NAME){
                                        queryInfo.specialist_id_field = field.id;

                                        Metabase.table_fields({tableId:queryInfo.conversations_table}, function(conversationsTableFields){
                                            conversationsTableFields.forEach(function(field){
                                                if(field.name == CONVERSATIONS_ID_FIELD_NAME){
                                                    queryInfo.conversations_id_field = field.id;
                                                }else if(field.name == CONVERSATIONS_SPECIALIST_FK_NAME){
                                                    queryInfo.conversations_specialist_fk = field.id;
                                                }
                                            });

                                            Metabase.table_fields({tableId:queryInfo.messages_table}, function(messagesTableFields){
                                                messagesTableFields.forEach(function(field){
                                                    if(field.name == MESSAGES_CONVERSATIONS_FK_NAME){
                                                        queryInfo.messages_table_conversation_fk = field.id;
                                                        Query.list({
                                                            orgId: orgId,
                                                            filterMode: 'all'
                                                        }, function(queries){
                                                            queries.forEach(function(query){
                                                                if(query.name == SPECIALIST_OVERVIEW_AVG_RATING_QUERY_NAME){
                                                                    queryInfo.specialist_overview_avg_rating_query = query.id;
                                                                }else if(query.name == SPECIALIST_OVERVIEW_AVG_RESPONSE_TIME_QUERY){
                                                                    queryInfo.specialist_overview_avg_response_time_query = query.id;
                                                                }
                                                            });
                                                            deferred.resolve(queryInfo);
                                                        }, function(error){
                                                            console.log("error getting queries:");
                                                            console.log(error);
                                                        });
                                                    }
                                                });
                                            });

                                        });

                                    }
                                });
                            });
                        });
                    }
                });
            });

            return deferred.promise;

        };

        this.convertToObjects = function (data) {
            var rows = [];
            for (var i = 0; i < data.rows.length; i++) {
                var row = {};

                for (var j = 0; j < data.cols.length; j++) {
                    var coldef = data.cols[j];

                    row[coldef.name] = data.rows[i][j];
                }

                rows.push(row);
            }

            return rows;
        };
    }
]);
