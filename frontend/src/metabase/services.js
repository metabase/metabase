/* @flow */

import { GET, PUT, POST, DELETE } from "metabase/lib/api";

// $FlowFixMe: Flow doesn't understand webpack loader syntax
import getGAMetadata from "promise?global!metabase/lib/ga-metadata";

export const ActivityApi = {
    list:                        GET("/api/activity"),
    recent_views:                GET("/api/activity/recent_views"),
};

export const CardApi = {
    list:                        GET("/api/card"),
    create:                     POST("/api/card"),
    get:                         GET("/api/card/:cardId"),
    update:                      PUT("/api/card/:id"),
    delete:                   DELETE("/api/card/:cardId"),
    query:                      POST("/api/card/:cardId/query"),
    // isfavorite:                  GET("/api/card/:cardId/favorite"),
    favorite:                   POST("/api/card/:cardId/favorite"),
    unfavorite:               DELETE("/api/card/:cardId/favorite"),
    updateLabels:               POST("/api/card/:cardId/labels"),
};

export const DashboardApi = {
    list:                        GET("/api/dashboard"),
    create:                     POST("/api/dashboard"),
    get:                         GET("/api/dashboard/:dashId"),
    update:                      PUT("/api/dashboard/:id"),
    delete:                   DELETE("/api/dashboard/:dashId"),
    addcard:                    POST("/api/dashboard/:dashId/cards"),
    removecard:               DELETE("/api/dashboard/:dashId/cards"),
    reposition_cards:            PUT("/api/dashboard/:dashId/cards"),
};

export const EmailApi = {
    updateSettings:              PUT("/api/email"),
    sendTest:                   POST("/api/email/test"),
};

export const SlackApi = {
    updateSettings:              PUT("/api/slack/settings"),
};

export const MetabaseApi = {
    db_list:                     GET("/api/database"),
    db_list_with_tables:         GET("/api/database?include_tables=true"),
    db_create:                  POST("/api/database"),
    db_add_sample_dataset:      POST("/api/database/sample_dataset"),
    db_get:                      GET("/api/database/:dbId"),
    db_update:                   PUT("/api/database/:id"),
    db_delete:                DELETE("/api/database/:dbId"),
    db_metadata:                 GET("/api/database/:dbId/metadata"),
    // db_tables:                   GET("/api/database/:dbId/tables"),
    db_fields:                   GET("/api/database/:dbId/fields"),
    db_idfields:                 GET("/api/database/:dbId/idfields"),
    db_autocomplete_suggestions: GET("/api/database/:dbId/autocomplete_suggestions?prefix=:prefix"),
    db_sync_metadata:           POST("/api/database/:dbId/sync"),
    table_list:                  GET("/api/table"),
    // table_get:                   GET("/api/table/:tableId"),
    table_update:                PUT("/api/table/:id"),
    // table_fields:                GET("/api/table/:tableId/fields"),
    table_fks:                   GET("/api/table/:tableId/fks"),
    // table_reorder_fields:       POST("/api/table/:tableId/reorder"),
    table_query_metadata:        GET("/api/table/:tableId/query_metadata", async (table) => {
                                    // HACK: inject GA metadata that we don't have intergrated on the backend yet
                                    if (table && table.db && table.db.engine === "googleanalytics") {
                                        let GA = await getGAMetadata();
                                        table.fields = table.fields.map(f => ({ ...f, ...GA.fields[f.name] }));
                                        table.metrics.push(...GA.metrics);
                                        table.segments.push(...GA.segments);
                                    }
                                    return table;
                                 }),
    // table_sync_metadata:        POST("/api/table/:tableId/sync"),
    // field_get:                   GET("/api/field/:fieldId"),
    // field_summary:               GET("/api/field/:fieldId/summary"),
    // field_values:                GET("/api/field/:fieldId/values"),
    // field_value_map_update:     POST("/api/field/:fieldId/value_map_update"),
    field_update:                PUT("/api/field/:id"),
    dataset:                    POST("/api/dataset"),
    dataset_duration:           POST("/api/dataset/duration"),
};

export const PulseApi = {
    list:                        GET("/api/pulse"),
    create:                     POST("/api/pulse"),
    get:                         GET("/api/pulse/:pulseId"),
    update:                      PUT("/api/pulse/:id"),
    delete:                   DELETE("/api/pulse/:pulseId"),
    test:                       POST("/api/pulse/test"),
    form_input:                  GET("/api/pulse/form_input"),
    preview_card:                GET("/api/pulse/preview_card_info/:id"),
};

export const SegmentApi = {
    list:                        GET("/api/segment"),
    create:                     POST("/api/segment"),
    get:                         GET("/api/segment/:segmentId"),
    update:                      PUT("/api/segment/:id"),
    delete:                   DELETE("/api/segment/:segmentId"),
};

export const MetricApi = {
    list:                        GET("/api/metric"),
    create:                     POST("/api/metric"),
    get:                         GET("/api/metric/:metricId"),
    update:                      PUT("/api/metric/:id"),
    update_important_fields:     PUT("/api/metric/:metricId/important_fields"),
    delete:                   DELETE("/api/metric/:metricId"),
};

export const RevisionApi = {
    list:                        GET("/api/revision"),
    revert:                     POST("/api/revision/revert"),
};

export const RevisionsApi = {
    get:                         GET("/api/:entity/:id/revisions"),
};

export const LabelApi = {
    list:                        GET("/api/label"),
    create:                     POST("/api/label"),
    update:                      PUT("/api/label/:id"),
    delete:                   DELETE("/api/label/:id"),
};

export const SessionApi = {
    create:                     POST("/api/session"),
    createWithGoogleAuth:       POST("/api/session/google_auth"),
    delete:                   DELETE("/api/session"),
    properties:                  GET("/api/session/properties"),
    forgot_password:            POST("/api/session/forgot_password"),
    reset_password:             POST("/api/session/reset_password"),
    password_reset_token_valid:  GET("/api/session/password_reset_token_valid"),
};

export const SettingsApi = {
    list:                        GET("/api/setting"),
    put:                         PUT("/api/setting/:key"),
    // setAll:                      PUT("/api/setting"),
    // delete:                   DELETE("/api/setting/:key"),
};

export const PermissionsApi = {
    groups:                      GET("/api/permissions/group"),
    groupDetails:                GET("/api/permissions/group/:id"),
    graph:                       GET("/api/permissions/graph"),
    updateGraph:                 PUT("/api/permissions/graph"),
    createGroup:                POST("/api/permissions/group"),
    memberships:                 GET("/api/permissions/membership"),
    createMembership:           POST("/api/permissions/membership"),
    deleteMembership:         DELETE("/api/permissions/membership/:id"),
    updateGroup:                 PUT("/api/permissions/group/:id"),
    deleteGroup:              DELETE("/api/permissions/group/:id"),
};

export const GettingStartedApi = {
    get:                         GET("/api/getting_started"),
};

export const SetupApi = {
    create:                     POST("/api/setup"),
    validate_db:                POST("/api/setup/validate"),
};

export const UserApi = {
    create:                     POST("/api/user"),
    list:                        GET("/api/user"),
    current:                     GET("/api/user/current"),
    // get:                         GET("/api/user/:userId"),
    update:                      PUT("/api/user/:id"),
    update_password:             PUT("/api/user/:id/password"),
    update_qbnewb:               PUT("/api/user/:id/qbnewb"),
    delete:                   DELETE("/api/user/:userId"),
    send_invite:                POST("/api/user/:id/send_invite"),
};

export const UtilApi = {
    password_check:             POST("/api/util/password_check"),
};
