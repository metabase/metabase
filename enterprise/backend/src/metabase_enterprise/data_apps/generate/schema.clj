(ns metabase-enterprise.data-apps.generate.schema
  "The `src/metabase.schema.ts` file of a data app: the TypeScript module describing the Library's published tables,
  with their fields, segments and measures, and its metrics, for the `Lib.createTestQuery` DSL; each entry's
  `/* metadata: {...} */` block carries context for humans and agents.

    (-> (fetch-items) create-schema render-typescript)

  [[fetch-items]] is the only impure stage, and reads through
  [[metabase-enterprise.data-apps.generate.schema.source/SchemaSource]]. Which keys render as runtime data vs metadata
  is policy in `metabase-enterprise.data-apps.generate.schema.render`; TypeScript syntax lives only in the
  `metabase-enterprise.data-apps.generate.schema.javascript` printer. The table and metric details lookups read-check
  the current user, so callers outside a request must bind a current-user context first."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.data-apps.generate.schema.common :as schemas.common]
   [metabase-enterprise.data-apps.generate.schema.javascript :as schemas.javascript]
   [metabase-enterprise.data-apps.generate.schema.render :as schemas.render]
   [metabase-enterprise.data-apps.generate.schema.source :as schemas.source]
   [metabase.system.core :as system])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def Items
  "Fetched schema entities, ready for pure assembly by [[create-schema]]."
  [:map {:closed true}
   [:tables  [:sequential :map]]
   [:metrics [:sequential :map]]])

(defn fetch-items
  "Fetches Library metrics, and published tables and the tables metrics are backed by."
  ([]
   (fetch-items schemas.source/app-db-source))
  ([source]
   (let [{:keys [data-collection-ids metric-collection-ids]} (schemas.source/library-scope source)
         metrics   (schemas.source/metrics source metric-collection-ids)
         table-ids (set/union (into #{} (map :id) (schemas.source/library-tables source data-collection-ids))
                              (into #{} (mapcat :mappedTableIds) metrics))]
     {:tables  (vec (schemas.source/tables source table-ids))
      :metrics (vec metrics)})))

(defn create-schema
  "Assembles fetched [[Items]] into the schema value; `info` optionally pins `:generated-at` and `:instance-url`,
  which default to the current time and the configured site URL."
  ([items]
   (create-schema items nil))
  ([{:keys [tables metrics]} {:keys [generated-at instance-url]}]
   (array-map
    :schemaVersion 3
    :generatedAt   (str (or generated-at (Instant/now)))
    :metabase      {:instanceUrl (or instance-url (system/site-url))}
    :tables        (schemas.common/keyed-map tables)
    :metrics       (schemas.common/keyed-map metrics))))

(defn render-typescript
  "Renders a schema value as an ES module of `as const` TypeScript constants."
  [schema]
  (-> schema
      schemas.render/schema->ast
      schemas.javascript/render-js))

(defn generate
  "The `src/metabase.schema.ts` file of a data app, at its path in the app's directory."
  []
  [{:path     "src/metabase.schema.ts"
    :contents (-> (fetch-items) create-schema render-typescript)}])
