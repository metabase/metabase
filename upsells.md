# Metabase Upsells: Coverage Audit

This document inventories every premium/enterprise-only feature in Metabase and notes whether the OSS product surfaces an upsell for it. A "✅ Surfaced" feature has at least one user-visible upsell component (banner, card, pill, page, or gem badge) somewhere in `frontend/src/metabase/`. A "❌ Not surfaced" feature has no in-product nudge — admins on the OSS plan have no breadcrumb pointing at the paid version.

The audit was generated from:

- Token-feature definitions in `src/metabase/premium_features/settings.clj` and `frontend/src/metabase-types/api/settings.ts`.
- Upsell components in `frontend/src/metabase/admin/upsells/`, `frontend/src/metabase/common/components/upsells/`, and `frontend/src/metabase/data-studio/upsells/`.

## Upsell component primitives

All upsells are built from a small set of primitives in [frontend/src/metabase/common/components/upsells/components/](frontend/src/metabase/common/components/upsells/components/):

| Primitive | Use case |
|---|---|
| `UpsellBanner` | Inline horizontal banner. Best for embedding inside a settings page. |
| `UpsellCard` | Vertical card with title + body + CTA. Best for sidebars and rails. |
| `UpsellBigCard` | Large card with illustration. Best for full-page upsells. |
| `UpsellPill` | Small inline gem pill. Best for adjacent-to-control nudges. |
| `UpsellGem` | Bare gem icon. Inline badge, no CTA. |

All primitives go through `UpsellWrapper` (admin-only) and emit `upsell_viewed`/`upsell_clicked` analytics through `useUpsellLink` and the `analytics.ts` helpers. See [readme.md](frontend/src/metabase/admin/upsells/readme.md).

## Coverage matrix

### ✅ Surfaced premium features

| Feature (token key) | Upsell component | OSS surface |
|---|---|---|
| `advanced_permissions` | `UpsellPermissions` | [PermissionsEditor.tsx:26](frontend/src/metabase/admin/permissions/components/PermissionsEditor/PermissionsEditor.tsx) |
| `attached_dwh` | `UpsellStorage` | [CSVPanel.tsx:44](frontend/src/metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/Panels/CSVPanel.tsx) |
| `audit_app` | `UpsellPerformanceTools` | [ToolsUpsell.tsx:9](frontend/src/metabase/admin/tools/components/ToolsUpsell/ToolsUpsell.tsx) |
| `cache_granular_controls` | `UpsellCacheConfig` | [StrategyEditorForDatabases.tsx:162](frontend/src/metabase/admin/performance/components/StrategyEditorForDatabases.tsx) |
| `cloud_custom_smtp` | `UpsellEmailWhitelabelPill` | [EmailFromAddressWidget.tsx:46](frontend/src/metabase/admin/settings/components/widgets/EmailFromAddressWidget.tsx) |
| `dependencies` | `DependenciesUpsellPage` | [data-studio/routes.tsx:62](frontend/src/metabase/data-studio/routes.tsx) |
| `embedding` | `UpsellMetabaseBanner` | [LookAndFeelSettings.tsx:209](frontend/src/metabase/public/components/EmbedModal/StaticEmbedSetupPane/LookAndFeelSettings.tsx) |
| `embedding` (advanced) | `UpsellEmbedHomepage` | [EmbedHomepageView.tsx:121](frontend/src/metabase/home/components/EmbedHomepage/EmbedHomepageView.tsx) |
| `embedding` (themes) | `UpsellEmbeddingTheme` | [EmbeddingThemeListingApp.tsx:21](frontend/src/metabase/admin/embedding/components/ThemeListing/EmbeddingThemeListingApp.tsx) |
| `embedding_sdk` | `UpsellSdkLink` + `EmbeddingUpsell` | [SelectEmbedExperienceStep.tsx:65](frontend/src/metabase/embedding/embedding-iframe-sdk-setup/components/SelectEmbedExperienceStep.tsx), [SelectEmbedOptionsStep.tsx:45](frontend/src/metabase/embedding/embedding-iframe-sdk-setup/components/SelectEmbedOptionsStep.tsx) |
| `embedding_simple` | `UpsellGem` | [EmbeddingNav.tsx:62](frontend/src/metabase/admin/embedding/components/EmbeddingNav.tsx) |
| `hosting` | `UpsellHostingBanner`, `UpsellCloud`, `UpsellBetterSupport` | [EmailSettingsPage.tsx:81](frontend/src/metabase/admin/settings/components/SettingsPages/EmailSettingsPage.tsx), [UpdatesSettingsPage.tsx:44](frontend/src/metabase/admin/settings/components/SettingsPages/UpdatesSettingsPage.tsx), [MigrationStart.tsx:23](frontend/src/metabase/admin/settings/components/CloudPanel/MigrationStart.tsx), [Help.tsx:126](frontend/src/metabase/admin/tools/components/Help/Help.tsx) |
| `library` | `LibraryUpsellPage` | [data-studio/routes.tsx:55](frontend/src/metabase/data-studio/routes.tsx) |
| `remote_sync` | `RemoteSyncUpsellPage` | [GitSyncSectionLayout.tsx:12](frontend/src/metabase/data-studio/app/pages/GitSyncSectionLayout/GitSyncSectionLayout.tsx) |
| `sandboxes` | covered by `UpsellPermissions` copy | [PermissionsEditor.tsx:26](frontend/src/metabase/admin/permissions/components/PermissionsEditor/PermissionsEditor.tsx) |
| `scim` | `UpsellSSO` | [AuthenticationSettingsPage.tsx:42](frontend/src/metabase/admin/settings/components/SettingsPages/AuthenticationSettingsPage.tsx), [PeopleNav.tsx:58](frontend/src/metabase/admin/people/components/PeopleNav.tsx) |
| `semantic_search` | `UpsellSemanticSearchPill` | (component exists; rendered conditionally in search settings) |
| `sso_google` / `sso_jwt` / `sso_ldap` / `sso_oidc` / `sso_saml` | `UpsellSSO` | [AuthenticationSettingsPage.tsx:42](frontend/src/metabase/admin/settings/components/SettingsPages/AuthenticationSettingsPage.tsx) |
| `transforms-python` | `UpsellGem` + `TransformInspectorUpsellPage` | [TransformListPage.tsx:431](frontend/src/metabase/transforms/pages/TransformListPage/TransformListPage.tsx), [CreateTransformMenu.tsx:111](frontend/src/metabase/transforms/pages/TransformListPage/CreateTransformMenu/CreateTransformMenu.tsx), [TransformInspectorUpsellPage.tsx:49](frontend/src/metabase/transforms/pages/TransformInspectorUpsellPage/TransformInspectorUpsellPage.tsx) |
| `upload_management` | `UpsellUploads` | [UploadSettingsPage.tsx:22](frontend/src/metabase/admin/settings/components/SettingsPages/UploadSettingsPage.tsx) |
| `whitelabel` | `UpsellWhitelabel` + `UpsellGem` | [AppearanceSettingsPage.tsx:20](frontend/src/metabase/admin/settings/components/SettingsPages/AppearanceSettingsPage.tsx), [SettingsNav.tsx:72](frontend/src/metabase/admin/settings/components/SettingsNav/SettingsNav.tsx) |
| (Cloud) `dev_instances` | `UpsellDevInstances` | [GeneralSettingsPage.tsx:95](frontend/src/metabase/admin/settings/components/SettingsPages/GeneralSettingsPage.tsx), [EmbeddingSettings.tsx:46](frontend/src/metabase/admin/settings/components/EmbeddingSettings/EmbeddingSettings/EmbeddingSettings.tsx) |
| (Insights) usage analytics | `UpsellUsageAnalytics` / `InsightsUpsellTab` | [QuestionInfoSidebar.tsx:131](frontend/src/metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/QuestionInfoSidebar.tsx), [DashboardInfoSidebar.tsx:173](frontend/src/metabase/dashboard/components/DashboardInfoSidebar/DashboardInfoSidebar.tsx) |

### ❌ Not surfaced premium features

These features are 100% gated to enterprise but have no upsell anywhere in the OSS UI. An OSS admin will never know they exist unless they read the docs.

| Feature (token key) | What it does | Where an upsell *would* naturally live |
|---|---|---|
| `admin_security_center` | Security audit / vulnerability dashboard | New nav item in `ToolsApp` sidebar |
| `ai_controls` | Metabot scope/permission controls | Admin permissions page |
| `ai_entity_analysis` | AI-generated descriptions of tables/fields | Table/field detail panes |
| `ai_sql_fixer` | AI fixes broken SQL | SQL editor error state |
| `ai_sql_generation` | NL → SQL | SQL editor (no Metabot UI in OSS) |
| `cache_preemptive` | Auto-refresh cache before TTL | Performance settings |
| `collection_cleanup` | Auto-archive stale items in collections | Collection menu |
| `config_text_file` | Init config from a file at boot | General settings |
| `content_translation` | Auto-translate dashboard/question names | Localization settings |
| `content_verification` | Mark questions as "verified" | Question info sidebar |
| `dashboard_subscription_filters` | Pre-filter dashboard subscriptions | Dashboard subscription sidebar |
| `database_auth_providers` | DB-backed auth | DB connection form |
| `database_routing` | Route queries by user attribute | DB edit page |
| `disable_password_login` | SSO-only logins | Authentication settings |
| `email_allow_list` | Restrict subscription recipients to allowed domains | Email settings |
| `email_restrict_recipients` | Restrict recipient autocomplete | Email settings |
| `etl_connections` / `etl_connections_pg` | Outbound ETL connections | DB list page |
| `metabase-ai-managed` / `offer-metabase-ai-managed` | Metabase-hosted LLM provider | Metabot/AI admin settings |
| `metabot-v3` | Metabot AI assistant | Nav (no Metabot icon in OSS) |
| `official_collections` | Mark a collection as "official" | Collection info sidebar |
| `query_reference_validation` | Find broken question references | Tools section |
| `serialization` | Export/import instance content | Tools or Settings |
| `session_timeout_config` | Configure session lifetime | Authentication settings |
| `snippet_collections` | Folder-organize SQL snippets | Snippet sidebar |
| `support-users` | Time-limited support-engineer access | Authentication / People settings |
| `table_data_editing` | Edit table rows in the UI | Table actions / database edit |
| `tenants` | Multi-tenant deployments | Admin nav |
| `writable_connection` | Separate write creds per DB | Database edit page (plugin section returns null in OSS) |

### Notes & ambiguities

- **`sandboxes`** is technically a separate token but is sold as part of "advanced permissions" — `UpsellPermissions` already mentions row/column-level security, so I am calling that covered.
- **`embedding_hub`** appears in the enterprise tree but is a UI affordance for paying customers, not a sold feature; not in the gap list.
- Several AI features (`ai_sql_*`, `metabot-v3`) have no OSS UI to attach to at all — there is no Metabot icon, no SQL "fix this" button. Adding upsells for these would require adding new UI surfaces, not just slotting in a banner.
- **`content_translation`** has no surface in OSS settings to anchor an upsell. Would need a new section in localization settings.
- **`tenants`**, **`serialization`**, and **`admin_security_center`** would each justify a new nav item with an upsell page (similar to `DependenciesUpsellPage`). Lower priority because they're niche.

## Newly added upsells

Each upsell below follows the existing `UpsellBanner` / `UpsellCard` / `UpsellPill` pattern, gates itself on the matching token feature(s), and is wired into the most natural existing OSS surface. Each row corresponds to a separate commit.

### Settings-page banners

| Feature | Component | OSS surface |
|---|---|---|
| `email_allow_list` + `email_restrict_recipients` | `UpsellEmailRecipients` | [EmailSettingsPage.tsx](frontend/src/metabase/admin/settings/components/SettingsPages/EmailSettingsPage.tsx) |
| `session_timeout_config` + `disable_password_login` | `UpsellSessionTimeout` | [AuthenticationSettingsPage.tsx](frontend/src/metabase/admin/settings/components/SettingsPages/AuthenticationSettingsPage.tsx) |
| `cache_preemptive` | `UpsellCachePreemptive` | [StrategyEditorForDatabases.tsx](frontend/src/metabase/admin/performance/components/StrategyEditorForDatabases.tsx) |
| `database_routing` | `UpsellDatabaseRouting` | [DatabaseEditApp.tsx](frontend/src/metabase/admin/databases/containers/DatabaseEditApp.tsx) |
| `writable_connection` | `UpsellWritableConnection` | [DatabaseEditApp.tsx](frontend/src/metabase/admin/databases/containers/DatabaseEditApp.tsx) |

### Inline pills

| Feature | Component | OSS surface |
|---|---|---|
| `content_verification` | `UpsellContentVerificationPill` | [QuestionInfoSidebar.tsx](frontend/src/metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/QuestionInfoSidebar.tsx) |
| `official_collections` | `UpsellOfficialCollectionsPill` | [CollectionInfoSidebar.tsx](frontend/src/metabase/collections/components/CollectionInfoSidebar/CollectionInfoSidebar.tsx) |
| `snippet_collections` | `UpsellSnippetCollectionsPill` | [SnippetSidebar.jsx](frontend/src/metabase/querying/components/SnippetSidebar/SnippetSidebar.jsx) |
| `ai_sql_fixer` + `ai_sql_generation` | `UpsellSqlFixerPill` | [VisualizationError.tsx](frontend/src/metabase/querying/components/QueryVisualization/VisualizationError/VisualizationError.tsx) |

### Full upsell pages (new admin routes)

| Feature | Page | Nav location |
|---|---|---|
| `serialization` | `SerializationUpsell` at `/admin/tools/serialization` | Tools sidebar |
| `tenants` | `TenantsUpsell` at `/admin/people/tenants-upsell` | People sidebar |
| `admin_security_center` | `SecurityCenterUpsell` at `/admin/tools/security-center` | Tools sidebar |
