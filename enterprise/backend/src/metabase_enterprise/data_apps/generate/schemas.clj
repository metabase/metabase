(ns metabase-enterprise.data-apps.generate.schemas
  "A data app's schema: the TypeScript module describing the root libraries' tables and metrics and the query actions
  that belong to no model, for the `Lib.createTestQuery` DSL; each entry's `/* metadata: {...} */` block carries
  context for humans and agents.

    (-> (fetch-items) create-schema render-typescript)

  [[fetch-items]] is the only impure stage, and reads through
  [[metabase-enterprise.data-apps.generate.schemas.source/SchemaSource]]. Which keys render as runtime data vs
  metadata is policy in `metabase-enterprise.data-apps.generate.schemas.render`; TypeScript syntax lives only in the
  `metabase-enterprise.data-apps.generate.schemas.javascript` printer. The table and metric details lookups
  read-check the current user, so callers outside a request must bind a current-user context first."
  (:require
   [metabase-enterprise.data-apps.generate.schemas.common :as schemas.common]
   [metabase-enterprise.data-apps.generate.schemas.javascript :as schemas.javascript]
   [metabase-enterprise.data-apps.generate.schemas.render :as schemas.render]
   [metabase-enterprise.data-apps.generate.schemas.source :as schemas.source]
   [metabase.system.core :as system])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def Items
  "Fetched schema entities, ready for pure assembly by [[create-schema]]."
  [:map {:closed true}
   [:actions [:sequential :map]]
   [:tables  [:sequential :map]]
   [:metrics [:sequential :map]]])

(defn fetch-items
  "Fetches the library's eligible metrics and published tables, and eligible query actions without a model."
  ([]
   (fetch-items schemas.source/app-db-source))
  ([source]
   (let [{:keys [data-collection-ids metric-collection-ids]} (schemas.source/library-scope source)
         metrics   (schemas.source/metrics source metric-collection-ids)
         table-ids (into #{} (map :id) (schemas.source/library-tables source data-collection-ids))]
     {:actions (vec (schemas.source/actions source))
      :tables  (vec (schemas.source/tables source table-ids))
      :metrics (vec metrics)})))

(defn create-schema
  "Assembles fetched [[Items]] into the schema value; `info` optionally pins `:generated-at` and `:instance-url`,
  which default to the current time and the configured site URL."
  ([items]
   (create-schema items nil))
  ([{:keys [actions tables metrics]} {:keys [generated-at instance-url]}]
   (array-map
    :schemaVersion 2
    :generatedAt   (str (or generated-at (Instant/now)))
    :metabase      {:instanceUrl (or instance-url (system/site-url))}
    :actions       (schemas.common/keyed-map actions)
    :tables        (schemas.common/keyed-map tables)
    :metrics       (schemas.common/keyed-map metrics))))

(defn render-typescript
  "Renders a schema value as an ES module of `as const` TypeScript constants."
  [schema]
  (-> schema
      schemas.render/schema->ast
      schemas.javascript/render-js))

(defn generate
  "The data app's schema as a TypeScript module."
  []
  (-> (fetch-items) create-schema render-typescript))
