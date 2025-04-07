(ns metabase.query-processor.middleware.results-metadata
  "Middleware that stores metadata about results column types after running a query for a Card,
   and returns that metadata (which can be passed *back* to the backend when saving a Card) as well
   as a checksum in the API response."
  (:require
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- standardize-metadata
  "There is sometimes a difference between stored metadata and the 'new' metadata,
  where the 'new' metadata has nil values for some keys whereas the stored metadata does not include the keys.
  This function removes those nil valued-keys to avoid false negatives."
  [metadata]
  (let [drop-nil-keys #{:coercion_strategy :settings :fk_target_field_id :semantic_type}]
    (cond
      (map? metadata)
      (m/filter-kv (fn [k v] (or (some? v)
                                 (not (drop-nil-keys k))))
                   metadata)

      (sequential? metadata)
      (mapv standardize-metadata metadata)

      :else
      metadata)))

(defn- record-metadata! [{{:keys [card-id]} :info, :as query} metadata]
  (try
    ;; At the very least we can skip the Extra DB call to update this Card's metadata results
    ;; if its DB doesn't support nested queries in the first place
    (when (and metadata
               driver/*driver*
               (driver.u/supports? driver/*driver* :nested-queries (lib.metadata/database (qp.store/metadata-provider)))
               card-id
               ;; don't want to update metadata when we use a Card as a source Card.
               (not (:qp/source-card-id query)))
      ;; Only update changed metadata
      (when (and metadata (not= (standardize-metadata metadata)
                                (:card-stored-metadata (:info query))))
        (t2/update! :model/Card card-id {:result_metadata metadata
                                         :updated_at      :updated_at})))
    ;; if for some reason we weren't able to record results metadata for this query then just proceed as normal
    ;; rather than failing the entire query
    (catch Throwable e
      (log/error e "Error recording results metadata for query"))))

(defn- merge-final-column-metadata
  "Because insights are generated by reducing functions, they start working before the entire query metadata is in its
  final form. Some columns come back without type information, and thus get an initial base type of `:type/*` (unknown
  type); in this case, the `annotate` middleware scans the first few values and infers a base type, adding that
  information to the column metadata in the final result.

  This function merges inferred column base types added by `annotate` into the metadata generated by `insights`."
  [final-col-metadata insights-col-metadata]
  ;; the two metadatas will both be in order that matches the column order of the results
  (mapv
   (fn [{final-base-type :base_type, :as final-col} {our-base-type :base_type, :as insights-col}]
     (merge
      (select-keys final-col [:id :description :display_name :semantic_type :fk_target_field_id
                              :settings :field_ref :base_type :effective_type :database_type
                              :remapped_from :remapped_to :coercion_strategy :visibility_type
                              :was_binned])
      insights-col
      {:name (:name final-col)} ; The final cols have correctly disambiguated ID_2 names, but the insights cols don't.
      (when (= our-base-type :type/*)
        {:base_type final-base-type})))
   final-col-metadata
   insights-col-metadata))

(mu/defn- insights-xform :- fn?
  [orig-metadata :- [:maybe :map]
   record!       :- ifn?
   rf            :- ifn?]
  (qp.reducible/combine-additional-reducing-fns
   rf
   [(analyze/insights-rf orig-metadata)]
   (fn combine [result {:keys [metadata insights]}]
     (let [metadata (merge-final-column-metadata (-> result :data :cols) metadata)]
       (record! metadata)
       (rf (cond-> result
             (map? result)
             (update :data
                     assoc
                     ;; TODO: We agreed on the name `:result_metadata` everywhere, and this needs updating.
                     ;; It'll definitely break things on the FE, so a coordinated change is needed.
                     :results_metadata {:columns metadata}
                     :insights         insights)))))))

(mu/defn record-and-return-metadata! :- ::qp.schema/rff
  "Post-processing middleware that records metadata about the columns returned when running the query. Returns an rff."
  [{{:keys [skip-results-metadata?]} :middleware, :as query} :- ::qp.schema/query
   rff                                                       :- ::qp.schema/rff]
  (if skip-results-metadata?
    rff
    (let [record! (partial record-metadata! query)]
      (fn record-and-return-metadata!-rff* [metadata]
        (insights-xform metadata record! (rff metadata))))))
