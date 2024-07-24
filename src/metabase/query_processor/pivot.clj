(ns metabase.query-processor.pivot
  "Pivot table QP. There are two implementations:

  * [[metabase.query-processor.pivot.impl.legacy]], which runs a series of queries sequentially and then combines
    results in post-processing

  * [[metabase.query-processor.pivot.impl.new]], which combines a series of queries with `UNION ALL` or equivalent and
    runs them as a single query against the data warehouse all at once.

  Drivers that implement [[metabase.driver/EXPERIMENTAL-execute-multiple-queries]] will use the `new` impl, otherwise
  we fall back to the `legacy` impl. At the time of this writing, the `new` impl is implemented for `:sql-jdbc`
  drivers."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pivot.impl.common :as qp.pivot.impl.common]
   [metabase.query-processor.pivot.impl.legacy]
   [metabase.query-processor.pivot.impl.new]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(comment
  metabase.query-processor.pivot.impl.legacy/keep-me
  metabase.query-processor.pivot.impl.new/keep-me)

(mu/defn ^:private pivot-options :- [:map
                                     [:pivot-rows [:maybe [:sequential [:int {:min 0}]]]]
                                     [:pivot-cols [:maybe [:sequential [:int {:min 0}]]]]]
  "Given a pivot table query and a card ID, looks at the `pivot_table.column_split` key in the card's visualization
  settings and generates pivot-rows and pivot-cols to use for generating subqueries."
  [query :- [:map
             [:database ::lib.schema.id/database]]]
  (or (when-let [opts (not-empty (select-keys query [:pivot-rows :pivot-cols]))]
        (merge {:pivot-rows nil, :pivot-cols nil}
               opts))
      (let [viz-settings         (get-in query [:info :visualization-settings])
            column-split         (:pivot_table.column_split viz-settings)
            column-split-rows    (seq (:rows column-split))
            column-split-columns (seq (:columns column-split))
            index-in-breakouts   (when (or column-split-rows
                                           column-split-columns)
                                   (let [metadata-provider (or (:lib/metadata query)
                                                               (lib.metadata.jvm/application-database-metadata-provider (:database query)))
                                         mlv2-query        (lib/query metadata-provider query)
                                         breakouts         (into []
                                                                 (map-indexed (fn [i col]
                                                                                (assoc col ::i i)))
                                                                 (lib/breakouts-metadata mlv2-query))]
                                     (fn [legacy-ref]
                                       (try
                                         (::i (lib.equality/find-column-for-legacy-ref
                                               mlv2-query
                                               -1
                                               legacy-ref
                                               breakouts))
                                         (catch Throwable e
                                           (log/errorf e "Error finding matching column for ref %s" (pr-str legacy-ref))
                                           nil)))))

            pivot-rows (when column-split-rows
                         (into [] (keep index-in-breakouts) column-split-rows))
            pivot-cols (when column-split-columns
                         (into [] (keep index-in-breakouts) column-split-columns))]
        {:pivot-rows pivot-rows
         :pivot-cols pivot-cols})))

(mr/def ::impl-name
  [:enum :qp.pivot.impl/new :qp.pivot.impl/legacy])

(def ^:dynamic ^:private *impl-override*
  "For test purposes, which pivot implementation to use. Overrides the normal way we check in [[impl-name]]."
  nil)

(mu/defn ^:private impl :- ::impl-name
  "Which pivot query implementation should we use?"
  [driver :- :keyword]
  (or *impl-override*
      (if (get-method driver/EXPERIMENTAL-execute-multiple-queries driver)
        :qp.pivot.impl/new
        :qp.pivot.impl/legacy)))

(mu/defn run-pivot-query :- :some
  "Run the pivot query. You are expected to wrap this call in [[metabase.query-processor.streaming/streaming-response]]
  yourself."
  ([query]
   (run-pivot-query query nil))

  ([query :- ::qp.schema/query
    rff   :- [:maybe ::qp.schema/rff]]
   (log/debugf "Running pivot query:\n%s" (u/pprint-to-str query))
   (qp.setup/with-qp-setup [query query]
     (binding [qp.perms/*card-id* (get-in query [:info :card-id])]
       (let [rff           (or rff qp.reducible/default-rff)
             query         (lib/query (qp.store/metadata-provider) query)
             pivot-options (pivot-options query)
             query         (assoc-in query [:middleware :pivot-options] pivot-options)
             impl          (impl driver/*driver*)]
         (try
           (qp.pivot.impl.common/run-pivot-query impl query rff)
           (catch Throwable e
             (throw (ex-info (i18n/tru "Error executing pivot table query: {0}" (ex-message e))
                             {:original-query query, :impl impl}
                             e)))))))))
