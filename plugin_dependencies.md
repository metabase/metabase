# Metabase Plugin Dependencies

This document provides a comprehensive analysis of the relationship between premium features and plugins in Metabase.
It shows how `hasPremiumFeature()` checks gate plugin mutations within `initializePlugin()` functions.

## Summary

- **Total Enterprise Modules**: 40
- **Total Unique Premium Features**: 42
- **Total Unique Plugin Objects**: 69

## Table of Contents

- [By Feature](#by-feature-features-and-their-plugin-dependencies)
- [By Plugin](#by-plugin-plugins-and-their-feature-requirements)
- [Key Insights](#key-insights)

---

## By Feature: Features and Their Plugin Dependencies

This section shows which plugins are affected by each premium feature.

### `advanced_permissions`

**Modules requiring this feature**: 4
- `advanced_permissions`
- `application_permissions`
- `feature_level_permissions`
- `group_managers`

**Plugins affected**: 13
- `PLUGIN_ADMIN_ALLOWED_PATH_GETTERS`
- `PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS`
- `PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES`
- `PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS`
- `PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES`
- `PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS`
- `PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS`
- `PLUGIN_ADVANCED_PERMISSIONS`
- `PLUGIN_APPLICATION_PERMISSIONS`
- `PLUGIN_DATA_PERMISSIONS`
- `PLUGIN_FEATURE_LEVEL_PERMISSIONS`
- `PLUGIN_GROUP_MANAGERS`
- `PLUGIN_REDUCERS`

### `ai_entity_analysis`

**Modules requiring this feature**: 1
- `ai-entity-analysis`

**Plugins affected**: 2
- `PLUGIN_AI_ENTITY_ANALYSIS`
- `PLUGIN_DASHCARD_MENU`

### `ai_sql_fixer`

**Modules requiring this feature**: 1
- `ai-sql-fixer`

**Plugins affected**: 1
- `PLUGIN_AI_SQL_FIXER`

### `attached_dwh`

**Modules requiring this feature**: 2
- `database_replication`
- `upload_management`

**Plugins affected**: 2
- `PLUGIN_DATABASE_REPLICATION`
- `PLUGIN_UPLOAD_MANAGEMENT`

### `audit_app`

**Modules requiring this feature**: 3
- `audit_app`
- `collections`
- `tools`

**Plugins affected**: 6
- `PLUGIN_ADMIN_TOOLS`
- `PLUGIN_ADMIN_USER_MENU_ITEMS`
- `PLUGIN_ADMIN_USER_MENU_ROUTES`
- `PLUGIN_AUDIT`
- `PLUGIN_COLLECTIONS`
- `PLUGIN_COLLECTION_COMPONENTS`

### `cache_granular_controls`

**Modules requiring this feature**: 2
- `caching`
- `model_persistence`

**Plugins affected**: 2
- `PLUGIN_CACHING`
- `PLUGIN_MODEL_PERSISTENCE`

### `cache_preemptive`

**Modules requiring this feature**: 1
- `caching`

**Plugins affected**: 1
- `PLUGIN_CACHING`

### `cloud_custom_smtp`

**Modules requiring this feature**: 1
- `smtp-override`

**Plugins affected**: 1
- `PLUGIN_SMTP_OVERRIDE`

### `collection_cleanup`

**Modules requiring this feature**: 1
- `clean_up`

**Plugins affected**: 1
- `PLUGIN_COLLECTIONS`

### `content_translation`

**Modules requiring this feature**: 1
- `content_translation`

**Plugins affected**: 1
- `PLUGIN_CONTENT_TRANSLATION`

### `content_verification`

**Modules requiring this feature**: 2
- `content_verification`
- `moderation`

**Plugins affected**: 2
- `PLUGIN_CONTENT_VERIFICATION`
- `PLUGIN_MODERATION`

### `dashboard_subscription_filters`

**Modules requiring this feature**: 1
- `sharing`

**Plugins affected**: 1
- `PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE`

### `data_studio`

**Modules requiring this feature**: 1
- `data-studio`

**Plugins affected**: 1
- `PLUGIN_DATA_STUDIO`

### `database_routing`

**Modules requiring this feature**: 1
- `database_routing`

**Plugins affected**: 1
- `PLUGIN_DB_ROUTING`

### `dependencies`

**Modules requiring this feature**: 1
- `dependencies`

**Plugins affected**: 1
- `PLUGIN_DEPENDENCIES`

### `disable_password_login`

**Modules requiring this feature**: 1
- `auth`

**Plugins affected**: 4
- `PLUGIN_AUTH_PROVIDERS`
- `PLUGIN_IS_PASSWORD_USER`
- `PLUGIN_LDAP_FORM_FIELDS`
- `PLUGIN_REDUX_MIDDLEWARES`

### `embedding`

**Modules requiring this feature**: 1
- `embedding`

**Plugins affected**: 2
- `PLUGIN_ADMIN_SETTINGS`
- `PLUGIN_EMBEDDING`

### `embedding_sdk`

**Modules requiring this feature**: 1
- `embedding-sdk`

**Plugins affected**: 1
- `PLUGIN_EMBEDDING_SDK`

### `embedding_simple`

**Modules requiring this feature**: 2
- `embedding_iframe_sdk`
- `embedding_iframe_sdk_setup`

**Plugins affected**: 2
- `PLUGIN_EMBEDDING_IFRAME_SDK`
- `PLUGIN_EMBEDDING_IFRAME_SDK_SETUP`

### `etl_connections`

**Modules requiring this feature**: 1
- `database_replication`

**Plugins affected**: 1
- `PLUGIN_DATABASE_REPLICATION`

### `etl_connections_pg`

**Modules requiring this feature**: 1
- `database_replication`

**Plugins affected**: 1
- `PLUGIN_DATABASE_REPLICATION`

### `hosting`

**Modules requiring this feature**: 2
- `database_replication`
- `upload_management`

**Plugins affected**: 2
- `PLUGIN_DATABASE_REPLICATION`
- `PLUGIN_UPLOAD_MANAGEMENT`

### `metabot_v3`

**Modules requiring this feature**: 1
- `metabot`

**Plugins affected**: 2
- `PLUGIN_METABOT`
- `PLUGIN_REDUCERS`

### `offer_metabase_ai`

**Modules requiring this feature**: 1
- `metabot`

**Plugins affected**: 2
- `PLUGIN_METABOT`
- `PLUGIN_REDUCERS`

### `offer_metabase_ai_tiered`

**Modules requiring this feature**: 1
- `metabot`

**Plugins affected**: 2
- `PLUGIN_METABOT`
- `PLUGIN_REDUCERS`

### `official_collections`

**Modules requiring this feature**: 1
- `collections`

**Plugins affected**: 2
- `PLUGIN_COLLECTIONS`
- `PLUGIN_COLLECTION_COMPONENTS`

### `remote_sync`

**Modules requiring this feature**: 2
- `collections`
- `remote_sync`

**Plugins affected**: 5
- `PLUGIN_COLLECTIONS`
- `PLUGIN_COLLECTION_COMPONENTS`
- `PLUGIN_REDUCERS`
- `PLUGIN_REDUX_MIDDLEWARES`
- `PLUGIN_REMOTE_SYNC`

### `sandboxes`

**Modules requiring this feature**: 1
- `sandboxes`

**Plugins affected**: 9
- `PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS`
- `PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS`
- `PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS`
- `PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION`
- `PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES`
- `PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES`
- `PLUGIN_ADMIN_USER_FORM_FIELDS`
- `PLUGIN_DATA_PERMISSIONS`
- `PLUGIN_REDUCERS`

### `scim`

**Modules requiring this feature**: 1
- `user_provisioning`

**Plugins affected**: 1
- `PLUGIN_AUTH_PROVIDERS`

### `semantic_search`

**Modules requiring this feature**: 1
- `semantic_search`

**Plugins affected**: 1
- `PLUGIN_SEMANTIC_SEARCH`

### `session_timeout_config`

**Modules requiring this feature**: 1
- `auth`

**Plugins affected**: 4
- `PLUGIN_AUTH_PROVIDERS`
- `PLUGIN_IS_PASSWORD_USER`
- `PLUGIN_LDAP_FORM_FIELDS`
- `PLUGIN_REDUX_MIDDLEWARES`

### `snippet_collections`

**Modules requiring this feature**: 1
- `snippets`

**Plugins affected**: 5
- `PLUGIN_SNIPPET_FOLDERS`
- `PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS`
- `PLUGIN_SNIPPET_SIDEBAR_MODALS`
- `PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS`
- `PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS`

### `sso_jwt`

**Modules requiring this feature**: 1
- `auth`

**Plugins affected**: 4
- `PLUGIN_AUTH_PROVIDERS`
- `PLUGIN_IS_PASSWORD_USER`
- `PLUGIN_LDAP_FORM_FIELDS`
- `PLUGIN_REDUX_MIDDLEWARES`

### `sso_ldap`

**Modules requiring this feature**: 1
- `auth`

**Plugins affected**: 4
- `PLUGIN_AUTH_PROVIDERS`
- `PLUGIN_IS_PASSWORD_USER`
- `PLUGIN_LDAP_FORM_FIELDS`
- `PLUGIN_REDUX_MIDDLEWARES`

### `sso_saml`

**Modules requiring this feature**: 1
- `auth`

**Plugins affected**: 4
- `PLUGIN_AUTH_PROVIDERS`
- `PLUGIN_IS_PASSWORD_USER`
- `PLUGIN_LDAP_FORM_FIELDS`
- `PLUGIN_REDUX_MIDDLEWARES`

### `support-users`

**Modules requiring this feature**: 1
- `support`

**Plugins affected**: 1
- `PLUGIN_SUPPORT`

### `table_data_editing`

**Modules requiring this feature**: 1
- `table-editing`

**Plugins affected**: 1
- `PLUGIN_TABLE_EDITING`

### `tenants`

**Modules requiring this feature**: 1
- `tenants`

**Plugins affected**: 3
- `PLUGIN_ADMIN_PERMISSIONS_TABS`
- `PLUGIN_ADMIN_USER_MENU_ROUTES`
- `PLUGIN_TENANTS`

### `transforms`

**Modules requiring this feature**: 1
- `transforms`

**Plugins affected**: 2
- `PLUGIN_ENTITIES`
- `PLUGIN_TRANSFORMS`

### `transforms-python`

**Modules requiring this feature**: 1
- `transforms-python`

**Plugins affected**: 1
- `PLUGIN_TRANSFORMS_PYTHON`

### `upload_management`

**Modules requiring this feature**: 1
- `upload_management`

**Plugins affected**: 1
- `PLUGIN_UPLOAD_MANAGEMENT`

### `whitelabel`

**Modules requiring this feature**: 1
- `whitelabel`

**Plugins affected**: 5
- `PLUGIN_APP_INIT_FUNCTIONS`
- `PLUGIN_LANDING_PAGE`
- `PLUGIN_LOGO_ICON_COMPONENTS`
- `PLUGIN_SELECTORS`
- `PLUGIN_WHITELABEL`

---

## By Plugin: Plugins and Their Feature Requirements

This section shows how many features need to be activated to fully initialize each plugin.

### `PLUGIN_ADMIN_ALLOWED_PATH_GETTERS`

**Total features required**: 1
- `advanced_permissions`

**Modules that mutate this plugin**: 3
- `application_permissions`
- `feature_level_permissions`
- `group_managers`

### `PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS`

**Total features required**: 1
- `advanced_permissions`

**Modules that mutate this plugin**: 1
- `advanced_permissions`

### `PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES`

**Total features required**: 1
- `advanced_permissions`

**Modules that mutate this plugin**: 1
- `advanced_permissions`

### `PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS`

**Total features required**: 1
- `advanced_permissions`

**Modules that mutate this plugin**: 1
- `advanced_permissions`

### `PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES`

**Total features required**: 1
- `advanced_permissions`

**Modules that mutate this plugin**: 1
- `advanced_permissions`

### `PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS`

**Total features required**: 1
- `sandboxes`

**Modules that mutate this plugin**: 1
- `sandboxes`

### `PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS`

**Total features required**: 1
- `sandboxes`

**Modules that mutate this plugin**: 1
- `sandboxes`

### `PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS`

**Total features required**: 2
- `advanced_permissions`
- `sandboxes`

**Modules that mutate this plugin**: 2
- `advanced_permissions`
- `sandboxes`

### `PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION`

**Total features required**: 1
- `sandboxes`

**Modules that mutate this plugin**: 1
- `sandboxes`

### `PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES`

**Total features required**: 1
- `sandboxes`

**Modules that mutate this plugin**: 1
- `sandboxes`

### `PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS`

**Total features required**: 1
- `advanced_permissions`

**Modules that mutate this plugin**: 1
- `advanced_permissions`

### `PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES`

**Total features required**: 1
- `sandboxes`

**Modules that mutate this plugin**: 1
- `sandboxes`

### `PLUGIN_ADMIN_PERMISSIONS_TABS`

**Total features required**: 1
- `tenants`

**Modules that mutate this plugin**: 1
- `tenants`

### `PLUGIN_ADMIN_SETTINGS`

**Total features required**: 1
- `embedding`

**Modules that mutate this plugin**: 1
- `embedding`

### `PLUGIN_ADMIN_TOOLS`

**Total features required**: 1
- `audit_app`

**Modules that mutate this plugin**: 1
- `tools`

### `PLUGIN_ADMIN_USER_FORM_FIELDS`

**Total features required**: 1
- `sandboxes`

**Modules that mutate this plugin**: 1
- `sandboxes`

### `PLUGIN_ADMIN_USER_MENU_ITEMS`

**Total features required**: 1
- `audit_app`

**Modules that mutate this plugin**: 1
- `audit_app`

### `PLUGIN_ADMIN_USER_MENU_ROUTES`

**Total features required**: 2
- `audit_app`
- `tenants`

**Modules that mutate this plugin**: 2
- `audit_app`
- `tenants`

### `PLUGIN_ADVANCED_PERMISSIONS`

**Total features required**: 1
- `advanced_permissions`

**Modules that mutate this plugin**: 1
- `advanced_permissions`

### `PLUGIN_AI_ENTITY_ANALYSIS`

**Total features required**: 1
- `ai_entity_analysis`

**Modules that mutate this plugin**: 1
- `ai-entity-analysis`

### `PLUGIN_AI_SQL_FIXER`

**Total features required**: 1
- `ai_sql_fixer`

**Modules that mutate this plugin**: 1
- `ai-sql-fixer`

### `PLUGIN_APPLICATION_PERMISSIONS`

**Total features required**: 1
- `advanced_permissions`

**Modules that mutate this plugin**: 1
- `application_permissions`

### `PLUGIN_APP_INIT_FUNCTIONS`

**Total features required**: 1
- `whitelabel`

**Modules that mutate this plugin**: 1
- `whitelabel`

### `PLUGIN_AUDIT`

**Total features required**: 1
- `audit_app`

**Modules that mutate this plugin**: 1
- `audit_app`

### `PLUGIN_AUTH_PROVIDERS`

**Total features required**: 6
- `disable_password_login`
- `scim`
- `session_timeout_config`
- `sso_jwt`
- `sso_ldap`
- `sso_saml`

**Modules that mutate this plugin**: 2
- `auth`
- `user_provisioning`

### `PLUGIN_CACHING`

**Total features required**: 2
- `cache_granular_controls`
- `cache_preemptive`

**Modules that mutate this plugin**: 1
- `caching`

### `PLUGIN_COLLECTIONS`

**Total features required**: 4
- `audit_app`
- `collection_cleanup`
- `official_collections`
- `remote_sync`

**Modules that mutate this plugin**: 2
- `clean_up`
- `collections`

### `PLUGIN_COLLECTION_COMPONENTS`

**Total features required**: 3
- `audit_app`
- `official_collections`
- `remote_sync`

**Modules that mutate this plugin**: 1
- `collections`

### `PLUGIN_CONTENT_TRANSLATION`

**Total features required**: 1
- `content_translation`

**Modules that mutate this plugin**: 1
- `content_translation`

### `PLUGIN_CONTENT_VERIFICATION`

**Total features required**: 1
- `content_verification`

**Modules that mutate this plugin**: 1
- `content_verification`

### `PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE`

**Total features required**: 1
- `dashboard_subscription_filters`

**Modules that mutate this plugin**: 1
- `sharing`

### `PLUGIN_DASHCARD_MENU`

**Total features required**: 1
- `ai_entity_analysis`

**Modules that mutate this plugin**: 1
- `ai-entity-analysis`

### `PLUGIN_DATABASE_REPLICATION`

**Total features required**: 4
- `attached_dwh`
- `etl_connections`
- `etl_connections_pg`
- `hosting`

**Modules that mutate this plugin**: 1
- `database_replication`

### `PLUGIN_DATA_PERMISSIONS`

**Total features required**: 2
- `advanced_permissions`
- `sandboxes`

**Modules that mutate this plugin**: 2
- `advanced_permissions`
- `sandboxes`

### `PLUGIN_DATA_STUDIO`

**Total features required**: 1
- `data_studio`

**Modules that mutate this plugin**: 1
- `data-studio`

### `PLUGIN_DB_ROUTING`

**Total features required**: 1
- `database_routing`

**Modules that mutate this plugin**: 1
- `database_routing`

### `PLUGIN_DEPENDENCIES`

**Total features required**: 1
- `dependencies`

**Modules that mutate this plugin**: 1
- `dependencies`

### `PLUGIN_EMBEDDING`

**Total features required**: 1
- `embedding`

**Modules that mutate this plugin**: 1
- `embedding`

### `PLUGIN_EMBEDDING_IFRAME_SDK`

**Total features required**: 1
- `embedding_simple`

**Modules that mutate this plugin**: 1
- `embedding_iframe_sdk`

### `PLUGIN_EMBEDDING_IFRAME_SDK_SETUP`

**Total features required**: 1
- `embedding_simple`

**Modules that mutate this plugin**: 1
- `embedding_iframe_sdk_setup`

### `PLUGIN_EMBEDDING_SDK`

**Total features required**: 1
- `embedding_sdk`

**Modules that mutate this plugin**: 1
- `embedding-sdk`

### `PLUGIN_ENTITIES`

**Total features required**: 1
- `transforms`

**Modules that mutate this plugin**: 1
- `transforms`

### `PLUGIN_FEATURE_LEVEL_PERMISSIONS`

**Total features required**: 1
- `advanced_permissions`

**Modules that mutate this plugin**: 1
- `feature_level_permissions`

### `PLUGIN_GROUP_MANAGERS`

**Total features required**: 1
- `advanced_permissions`

**Modules that mutate this plugin**: 1
- `group_managers`

### `PLUGIN_IS_PASSWORD_USER`

**Total features required**: 5
- `disable_password_login`
- `session_timeout_config`
- `sso_jwt`
- `sso_ldap`
- `sso_saml`

**Modules that mutate this plugin**: 1
- `auth`

### `PLUGIN_LANDING_PAGE`

**Total features required**: 1
- `whitelabel`

**Modules that mutate this plugin**: 1
- `whitelabel`

### `PLUGIN_LDAP_FORM_FIELDS`

**Total features required**: 5
- `disable_password_login`
- `session_timeout_config`
- `sso_jwt`
- `sso_ldap`
- `sso_saml`

**Modules that mutate this plugin**: 1
- `auth`

### `PLUGIN_LOGO_ICON_COMPONENTS`

**Total features required**: 1
- `whitelabel`

**Modules that mutate this plugin**: 1
- `whitelabel`

### `PLUGIN_METABOT`

**Total features required**: 3
- `metabot_v3`
- `offer_metabase_ai`
- `offer_metabase_ai_tiered`

**Modules that mutate this plugin**: 1
- `metabot`

### `PLUGIN_MODEL_PERSISTENCE`

**Total features required**: 1
- `cache_granular_controls`

**Modules that mutate this plugin**: 1
- `model_persistence`

### `PLUGIN_MODERATION`

**Total features required**: 1
- `content_verification`

**Modules that mutate this plugin**: 1
- `moderation`

### `PLUGIN_REDUCERS`

**Total features required**: 6
- `advanced_permissions`
- `metabot_v3`
- `offer_metabase_ai`
- `offer_metabase_ai_tiered`
- `remote_sync`
- `sandboxes`

**Modules that mutate this plugin**: 5
- `advanced_permissions`
- `application_permissions`
- `metabot`
- `remote_sync`
- `sandboxes`

### `PLUGIN_REDUX_MIDDLEWARES`

**Total features required**: 6
- `disable_password_login`
- `remote_sync`
- `session_timeout_config`
- `sso_jwt`
- `sso_ldap`
- `sso_saml`

**Modules that mutate this plugin**: 2
- `auth`
- `remote_sync`

### `PLUGIN_REMOTE_SYNC`

**Total features required**: 1
- `remote_sync`

**Modules that mutate this plugin**: 1
- `remote_sync`

### `PLUGIN_SELECTORS`

**Total features required**: 1
- `whitelabel`

**Modules that mutate this plugin**: 1
- `whitelabel`

### `PLUGIN_SEMANTIC_SEARCH`

**Total features required**: 1
- `semantic_search`

**Modules that mutate this plugin**: 1
- `semantic_search`

### `PLUGIN_SMTP_OVERRIDE`

**Total features required**: 1
- `cloud_custom_smtp`

**Modules that mutate this plugin**: 1
- `smtp-override`

### `PLUGIN_SNIPPET_FOLDERS`

**Total features required**: 1
- `snippet_collections`

**Modules that mutate this plugin**: 1
- `snippets`

### `PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS`

**Total features required**: 1
- `snippet_collections`

**Modules that mutate this plugin**: 1
- `snippets`

### `PLUGIN_SNIPPET_SIDEBAR_MODALS`

**Total features required**: 1
- `snippet_collections`

**Modules that mutate this plugin**: 1
- `snippets`

### `PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS`

**Total features required**: 1
- `snippet_collections`

**Modules that mutate this plugin**: 1
- `snippets`

### `PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS`

**Total features required**: 1
- `snippet_collections`

**Modules that mutate this plugin**: 1
- `snippets`

### `PLUGIN_SUPPORT`

**Total features required**: 1
- `support-users`

**Modules that mutate this plugin**: 1
- `support`

### `PLUGIN_TABLE_EDITING`

**Total features required**: 1
- `table_data_editing`

**Modules that mutate this plugin**: 1
- `table-editing`

### `PLUGIN_TENANTS`

**Total features required**: 1
- `tenants`

**Modules that mutate this plugin**: 1
- `tenants`

### `PLUGIN_TRANSFORMS`

**Total features required**: 1
- `transforms`

**Modules that mutate this plugin**: 1
- `transforms`

### `PLUGIN_TRANSFORMS_PYTHON`

**Total features required**: 1
- `transforms-python`

**Modules that mutate this plugin**: 1
- `transforms-python`

### `PLUGIN_UPLOAD_MANAGEMENT`

**Total features required**: 3
- `attached_dwh`
- `hosting`
- `upload_management`

**Modules that mutate this plugin**: 1
- `upload_management`

### `PLUGIN_WHITELABEL`

**Total features required**: 1
- `whitelabel`

**Modules that mutate this plugin**: 1
- `whitelabel`

---

## Key Insights

### Most Complex Plugin: `PLUGIN_REDUCERS`

Requires **6 premium features** to be fully initialized:
1. `advanced_permissions`
2. `metabot_v3`
3. `offer_metabase_ai`
4. `offer_metabase_ai_tiered`
5. `remote_sync`
6. `sandboxes`

### Most Complex Feature: `advanced_permissions`

Affects **13 plugins** across **4 modules**

### Most Mutated Plugin: `PLUGIN_REDUCERS`

Modified by **5 different modules**:
1. `advanced_permissions`
2. `application_permissions`
3. `metabot`
4. `remote_sync`
5. `sandboxes`

---

## Generation Metadata

- **Generated**: 2025-12-16
- **Total Files Analyzed**: 40
- **Total Features Found**: 53 (unique: 42)
- **Total Plugins Found**: 69
- **Analysis Method**: Static code analysis via Python script
- **Repository**: metabase/metabase