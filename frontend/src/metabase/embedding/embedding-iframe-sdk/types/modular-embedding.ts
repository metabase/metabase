/**
 * Types for modular embedding web-components.
 *
 * This is the source of truth for all attributes accepted by modular embedding components.
 *
 * @module
 */

/**
 * Attributes for the `<metabase-dashboard>` web component.
 *
 * Embeds a Metabase dashboard. Provide either `dashboard-id` (for SSO embeds)
 * or `token` (for guest embeds), plus optional display configuration.
 */
export interface MetabaseDashboardAttributes {
  /**
   * The ID of the dashboard to embed. Can be a regular ID or an
   * [entity ID](https://www.metabase.com/docs/latest/installation-and-operation/serialization#entity-ids-work-with-embedding).
   * Only for SSO embeds — guest embeds set the ID with `token`.
   */
  "dashboard-id": number | string;

  /**
   * The token for guest embeds. Set automatically by the guest embed flow.
   *
   * @remarks Guest embed
   */
  token?: string;

  /**
   * Whether to show the dashboard title in the embed.
   *
   * @defaultValue true
   * @remarks Guest embed
   */
  "with-title"?: boolean;

  /**
   * Whether to show the button to download the dashboard as PDF and download question results.
   *
   * @defaultValue `true` on OSS/Starter, `false` on Pro/Enterprise
   * @remarks Guest embed
   */
  "with-downloads"?: boolean;

  /**
   * Whether to enable drill-through on the dashboard.
   *
   * @defaultValue true
   * @remarks Pro/Enterprise
   */
  drills?: boolean;

  /**
   * Auto-refresh interval in seconds. For example, `60` refreshes the
   * dashboard every 60 seconds.
   *
   * @remarks Pro/Enterprise, Guest embed
   */
  "auto-refresh-interval"?: number;

  /**
   * Whether to let people set up
   * [dashboard subscriptions](https://www.metabase.com/docs/latest/dashboards/subscriptions).
   * Subscriptions sent from embedded dashboards exclude links to Metabase items.
   *
   * @remarks Pro/Enterprise
   */
  "with-subscriptions"?: boolean;

  /**
   * Default values for dashboard filters, e.g. `{ 'productId': '42' }`.
   *
   * @remarks Pro/Enterprise, Guest embed
   */
  "initial-parameters"?: object;

  /**
   * List of filter names to hide from the dashboard, e.g. `['productId']`.
   *
   * @remarks Pro/Enterprise
   */
  "hidden-parameters"?: string[];

  /**
   * Whether to enable internal entity navigation (links to dashboards/questions).
   * Requires `drills` to be `true`
   *
   * @defaultValue false
   * @remarks Pro/Enterprise
   */
  "enable-entity-navigation"?: boolean;
}

/**
 * Attributes for the `<metabase-question>` web component.
 *
 * Embeds a Metabase question (chart). Provide either `question-id` (for SSO embeds)
 * or `token` (for guest embeds), plus optional display configuration.
 * Use `question-id="new"` to embed the query builder exploration interface.
 * Use `question-id="new-native"` to embed the SQL editor interface.
 */
export interface MetabaseQuestionAttributes {
  /**
   * The ID of the question to embed. Can be a regular ID or an
   * [entity ID](https://www.metabase.com/docs/latest/installation-and-operation/serialization#entity-ids-work-with-embedding).
   * Use `"new"` to embed the query builder. Only for SSO embeds — guest embeds use `token`.
   */
  "question-id": number | string;

  /**
   * The token for guest embeds. Set automatically by the guest embed flow.
   *
   * @remarks Guest embed
   */
  token?: string;

  /**
   * Whether to show the question title in the embed.
   *
   * @defaultValue true
   * @remarks Guest embed
   */
  "with-title"?: boolean;

  /**
   * Whether to show download buttons for question results.
   *
   * @defaultValue `true` on OSS/Starter, `false` on Pro/Enterprise
   * @remarks Guest embed
   */
  "with-downloads"?: boolean;

  /**
   * Whether to show the alerts button.
   *
   * @defaultValue false
   * @remarks Pro/Enterprise
   */
  "with-alerts"?: boolean;

  /**
   * Whether to enable drill-through on the question.
   *
   * @defaultValue true
   * @remarks Pro/Enterprise
   */
  drills?: boolean;

  /**
   * Default values for SQL parameters, only applicable to native SQL questions,
   * e.g. `{ "productId": "42" }`.
   *
   * @remarks Pro/Enterprise, Guest embed
   */
  "initial-sql-parameters"?: object;

  /**
   * List of parameter names to hide from the question.
   *
   * @remarks Pro/Enterprise
   */
  "hidden-parameters"?: string[];

  /**
   * Whether the save button is enabled.
   *
   * @defaultValue false
   * @remarks Pro/Enterprise
   */
  "is-save-enabled"?: boolean;

  /**
   * The collection to save a question to. Values: regular ID, entity ID,
   * `"personal"`, `"root"`.
   *
   * @remarks Pro/Enterprise
   */
  "target-collection"?: number | string;

  /**
   * Which entity types to show in the question's data picker,
   * e.g. `["model", "table"]`.
   *
   * @remarks Pro/Enterprise, Guest embed
   */
  "entity-types"?: ("model" | "table")[];
}

/**
 * Attributes for the `<metabase-browser>` web component.
 *
 * Embeds a collection browser so people can navigate collections and open
 * dashboards or questions. Only available for authenticated (SSO) modular embeds.
 *
 * @remarks Pro/Enterprise
 */
export interface MetabaseBrowserAttributes {
  /**
   * Which collection to start from. Use a collection ID (e.g., `14`) to start
   * in a specific collection, or `"root"` for the top-level "Our Analytics" collection.
   */
  "initial-collection": number | string;

  /**
   * Whether the content manager is in read-only mode. When `true`, people can
   * interact with items (filter, summarize, drill-through) but can't save.
   * When `false`, they can create and edit items.
   *
   * @defaultValue true
   */
  "read-only"?: boolean;

  /**
   * An array of columns to show in the collection browser:
   * `type`, `name`, `description`, `lastEditedBy`, `lastEditedAt`, `archive`.
   */
  "collection-visible-columns"?: (
    | "type"
    | "name"
    | "description"
    | "lastEditedBy"
    | "lastEditedAt"
    | "archive"
  )[];

  /**
   * How many items to show per page in the collection browser.
   */
  "collection-page-size"?: number;

  /**
   * An array of entity types to show in the collection browser:
   * `collection`, `dashboard`, `question`, `model`.
   */
  "collection-entity-types"?: (
    | "collection"
    | "dashboard"
    | "question"
    | "model"
  )[];

  /**
   * An array of entity types to show in the question's data picker:
   * `model`, `table`.
   */
  "data-picker-entity-types"?: ("model" | "table")[];

  /**
   * Whether to show the "New exploration" button.
   *
   * @defaultValue true
   */
  "with-new-question"?: boolean;

  /**
   * Whether to show the "New dashboard" button.
   * Only applies when `read-only` is `false`.
   *
   * @defaultValue true
   */
  "with-new-dashboard"?: boolean;

  /**
   * Whether to enable internal entity navigation (links to dashboards/questions).
   *
   * @defaultValue false
   */
  "enable-entity-navigation"?: boolean;
}

/**
 * Attributes for the `<metabase-metabot>` web component.
 *
 * Embeds the AI chat interface. Only available for authenticated (SSO) modular embeds.
 *
 * @remarks Pro/Enterprise
 */
export interface MetabaseMetabotAttributes {
  /**
   * How should the browser position the visualization with respect to the chat
   * interface. `auto` uses `stacked` on mobile and `sidebar` on larger screens.
   *
   * @defaultValue "auto"
   */
  layout?: "auto" | "sidebar" | "stacked";

  /**
   * Whether the save button is enabled.
   *
   * @defaultValue false
   */
  "is-save-enabled"?: boolean;

  /**
   * The collection to save a question to.
   */
  "target-collection"?: number | string;
}

/**
 * Used to enforce types in frontend/src/metabase/embedding/embedding-iframe-sdk/embed.ts
 *
 * @internal
 */
export interface ComponentToAttributes {
  "metabase-question": MetabaseQuestionAttributes;
  "metabase-dashboard": MetabaseDashboardAttributes;
  "metabase-browser": MetabaseBrowserAttributes;
  "metabase-metabot": MetabaseMetabotAttributes;
}
