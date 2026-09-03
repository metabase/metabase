(ns metabase.metabot.query-export
  "Permission gating for the queries Metabot renders into the prompt. Exporting a query resolves table and field ids
  to names through an unfiltered metadata provider, so a query the user cannot run is not rendered."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.models.interface :as mi]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private exported-table-id-keys
  [:source-table :source_table])

(def ^:private exported-card-id-keys
  [:source-card :source_card :card-id :card_id])

(def ^:private exported-field-id-keys
  [:source-field :metabase.models.visualization-settings/param-mapping-source])

(defn- exported-entity-ids
  [normalized]
  (let [ids (fn [ks node] (into #{} (comp (map #(get node %)) (filter pos-int?)) ks))]
    (reduce
     (fn [acc node]
       (cond
         (map? node)
         (-> acc
             (update :table into (ids exported-table-id-keys node))
             (update :card  into (ids exported-card-id-keys node))
             (update :field into (ids exported-field-id-keys node)))

         (and (vector? node) (not (map-entry? node)))
         (case (keyword (first node))
           (:field :field-id) (update acc :field into (filter pos-int?) [(nth node 1 nil) (nth node 2 nil)])
           :metric            (update acc :card into (filter pos-int?) [(nth node 1 nil) (nth node 2 nil)])
           acc)

         :else acc))
     {:table #{} :card #{} :field #{}}
     (tree-seq coll? seq normalized))))

(defn- sandbox-visible-fields?
  [field-id->table-id]
  (let [restricted (metabot.perms/sandbox-restricted-fields (set (vals field-id->table-id)))]
    (every? (fn [[field-id table-id]]
              (if-let [allowed (get restricted table-id)]
                (contains? allowed field-id)
                true))
            field-id->table-id)))

(defn- queryable-normalized-query
  [query]
  ;; the raw :database may be the legacy virtual id -1337; normalizing resolves it through
  ;; the source card, so the id is only gated after normalization
  (when (and (map? query) (:database query))
    (try
      (let [normalized  (lib-be/normalize-query query)
            database-id (:database normalized)]
        (when (and (pos-int? database-id)
                   ;; throw on a calculation failure so only a denial reads as false
                   (query-perms/can-run-query? normalized false true))
          (let [{:keys [table card field]} (exported-entity-ids normalized)
                field-table (metabot.perms/field-id->table-id field)
                table-ids   (into (set table) (vals field-table))]
            (when (and (= table-ids (metabot.perms/queryable-table-ids table-ids))
                       (sandbox-visible-fields? field-table)
                       (every? #(mi/can-read? :model/Card %) card))
              [normalized (lib-be/application-database-metadata-provider database-id)]))))
      (catch Exception e
        (log/debugf "Omitting a viewing-context query that could not be permission-checked: %s"
                    (ex-message e))
        nil))))

(defn exportable-query?
  "May the current user run `query`? Queries with no :database only ever pprint
  (no name resolution), so they pass."
  [query]
  (or (not (and (map? query) (:database query)))
      (some? (queryable-normalized-query query))))

(defn exported-query-text
  "Render a query for the LLM when the user may run it, nil when they may not."
  [query]
  (if (and (map? query) (:database query))
    (when-let [[normalized mp] (queryable-normalized-query query)]
      (llm-shape/export-normalized-query-for-llm mp normalized))
    (llm-shape/export-query-for-llm query)))

(defn transform-with-exportable-source
  "`transform` with its stored source query withheld unless the current user may run it.
  Rendering the source resolves table and field ids to names; the rest of the transform
  stays readable either way."
  [transform]
  (if (exportable-query? (get-in transform [:source :query]))
    transform
    (update transform :source dissoc :query)))
