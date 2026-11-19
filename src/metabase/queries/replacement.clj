(ns metabase.queries.replacement
  "The functions of the replacement spec of a Card."
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.queries.db :as queries.db]
   [metabase.queries.models.query :as queries.query]
   [metabase.replacement.core :as replacement]
   [metabase.replacement.walk :as replacement.walk]
   [metabase.source-swap.core :as source-swap]))

(set! *warn-on-reflection* true)

(defn- parameter-source-card-ids
  "The ids of the cards the parameters of `card` take their values from."
  [card]
  (replacement.walk/parameter-source-card-ids (or (:parameters card) [])))

(defn hydrate
  "The Cards `cards`, each with the cards its parameters take their values from under `:replacement/cards`, by id."
  [cards]
  (let [card-ids      (into #{} (mapcat parameter-source-card-ids) cards)
        card-id->card (if (seq card-ids)
                        (m/index-by :id (queries.db/cards card-ids))
                        {})]
    (mapv #(assoc % :replacement/cards card-id->card) cards)))

(defn- ref->column-name
  "The deduplicated column name of the column among `columns` that `ref` matches, as `:visualization_settings` uses it."
  [ref columns]
  (when-some [column (lib/find-matching-column ref columns)]
    ((some-fn :lib/deduplicated-name :name) column)))

(defn- card-writes
  "The write of `changes` to `card`, keeping its `:result_metadata` when its new query is native, or none."
  [card query changes]
  (if (seq changes)
    [[:model/Card (:id card) (cond-> changes
                               (lib/native-only-query? query)
                               (assoc :result_metadata (:result_metadata card)
                                      :verified-result-metadata? true))]]
    []))

(defn upgrade-field-refs
  "The writes that upgrade the field refs of the hydrated `card` in its query, visualization settings and parameters."
  [card]
  (let [query         (:dataset_query card)
        valid-query?  (replacement/valid-query? query)
        query'        (if valid-query?
                        (source-swap/upgrade-field-refs-in-query query)
                        query)
        viz-settings  (:visualization_settings card)
        viz-settings' (if valid-query?
                        (let [columns (lib/returned-columns query')]
                          (lib/with-aggregation-list (lib/aggregations query')
                            (some-> viz-settings
                                    (replacement.walk/walk-viz-settings-refs #(ref->column-name % columns)))))
                        viz-settings)
        parameters    (:parameters card)
        parameters'   (if (seq (parameter-source-card-ids card))
                        (replacement/upgrade-parameter-source-card-refs parameters (:replacement/cards card))
                        parameters)]
    (card-writes card query' (cond-> {}
                               (not= query query')               (assoc :dataset_query query')
                               (not= viz-settings viz-settings') (assoc :visualization_settings viz-settings')
                               (not= parameters parameters')     (assoc :parameters parameters')))))

(defn swap-source
  "The writes that swap `old-source` for `new-source` in the query and parameters of `card`, or nil when its query is
  not valid."
  [card old-source new-source]
  (let [query (:dataset_query card)]
    (when (replacement/valid-query? query)
      (let [query'      (source-swap/swap-source-in-query query old-source new-source)
            table-id    (:table_id card)
            table-id'   (:table-id (queries.query/query->database-and-table-ids query'))
            parameters  (or (:parameters card) [])
            parameters' (replacement/swap-parameter-source-card-id parameters old-source new-source)]
        (card-writes card query' (cond-> {}
                                   (not= query query')           (assoc :dataset_query query')
                                   (not= table-id table-id')     (assoc :table_id table-id')
                                   (not= parameters parameters') (assoc :parameters parameters')))))))
