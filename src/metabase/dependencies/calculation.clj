(ns metabase.dependencies.calculation
  "The helpers that the dependencies specs of the models compute the dependencies of a row with: those of a query, of
  parameters and of visualization settings."
  (:require
   [metabase.dependencies.native :as dependencies.native]
   [metabase.dependencies.schema :as dependencies.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn merge-dependencies
  "The union of the dependencies `deps`, each as `{entity-type #{entity-id}}`."
  [& deps]
  (apply merge-with into {} deps))

(mu/defn with-native-dependencies :- [:sequential :map]
  "`rows` with the dependencies of the native-only query that `query-fn` returns of each, or the exception that
  resolving them threw, in their metadata, where no closed schema of a row sees them, for [[query-dependencies]]."
  [rows     :- [:sequential :map]
   query-fn :- ifn?]
  (mapv (fn [row]
          (try
            (let [query (query-fn row)]
              (cond-> row
                (and query (lib/native-only-query? query))
                (vary-meta assoc ::native-dependencies (dependencies.native/native-query-dependencies query))))
            (catch Exception e
              (vary-meta row assoc ::native-dependencies e))))
        rows))

(mu/defn- mbql-query-dependencies :- ::dependencies.schema/dependencies
  "The cards, measures, segments and tables that the MBQL `query` reads."
  [query :- ::lib.schema/query]
  {:card    (or (lib/all-source-card-ids query) #{})
   :measure (or (lib/all-measure-ids query) #{})
   :segment (or (lib/all-segment-ids query) #{})
   :table   (-> #{}
                (into (lib/all-source-table-ids query))
                (into (lib/all-implicitly-joined-table-ids query)))})

(mu/defn query-dependencies :- ::dependencies.schema/dependencies
  "The dependencies of `query`, the query of `row`, the native dependencies of which [[with-native-dependencies]]
  attached to the metadata of the row."
  [row   :- :map
   query :- ::lib.schema/query]
  (if (lib/native-only-query? query)
    (let [deps (get (meta row) ::native-dependencies ::missing)]
      (cond
        (= ::missing deps)          (throw (ex-info "The native dependencies of the row were not hydrated" {:id (:id row)}))
        (instance? Throwable deps) (throw deps)
        :else                       deps))
    (mbql-query-dependencies query)))

(mu/defn parameters-dependencies :- ::dependencies.schema/dependencies
  "The cards that the `parameters` take their values from, none as `{}`."
  [parameters :- [:maybe [:sequential :map]]]
  (if-let [card-ids (seq (keep (comp :card_id :values_source_config) parameters))]
    {:card (set card-ids)}
    {}))

(defn- click-behavior-target
  "The id that the `click-behavior` of `link-type` targets, nil unless it is a positive integer."
  [link-type click-behavior]
  (when (and (= link-type (:linkType click-behavior))
             (pos-int? (:targetId click-behavior)))
    (:targetId click-behavior)))

(mu/defn visualization-settings-dependencies :- ::dependencies.schema/dependencies
  "The cards and dashboards that the click behaviors of `visualization-settings`, its own and its columns', link to."
  [visualization-settings :- [:maybe :map]]
  (let [behaviors (cons (:click_behavior visualization-settings)
                        (map (comp :click_behavior val) (:column_settings visualization-settings)))]
    {:card      (into #{} (keep #(click-behavior-target "question" %)) behaviors)
     :dashboard (into #{} (keep #(click-behavior-target "dashboard" %)) behaviors)}))
