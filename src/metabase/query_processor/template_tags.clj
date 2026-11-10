(ns metabase.query-processor.template-tags
  "Which template tags become parameters, and whether a card's query reads any. Kept apart from
  [[metabase.query-processor.card]] so the referenced-entity runner, which that namespace requires, can use them too,
  and out of the Card model so the QP can use them without depending on it."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

(mu/defn parameter-template-tag? :- :boolean
  "Whether a parameter is created for this template tag, as opposed to tags that splice content into the query itself,
  like snippets, card references, and tables."
  [{tag-type :type, widget-type :widget-type} :- [:maybe ::lib.schema.template-tag/template-tag]]
  (boolean
   (and tag-type
        (or (contains? lib.schema.template-tag/raw-value-template-tag-types tag-type)
            (= tag-type :temporal-unit)
            (and (= tag-type :dimension) widget-type (not= widget-type :none))))))

(defn- reads-parameter-tag?
  [query]
  (boolean (perf/some parameter-template-tag? (lib/all-template-tags query))))

(defn reads-parameters?
  "Whether running `card`'s saved query needs parameter values: `card` has parameters, or its query or the query of any
  card it reads, at any depth, has a template tag that becomes one. Run without values, each such tag gets its default,
  fails, or drops its optional clause."
  [{:keys [parameters dataset_query]}]
  (boolean
   (or (seq parameters)
       (when (seq dataset_query)
         (let [query (lib/query (lib-be/application-database-metadata-provider (:database dataset_query))
                                dataset_query)]
           (or (reads-parameter-tag? query)
               ;; source cards, `{{#123}}` tags and metrics, followed into each card's own query. The walk keeps a
               ;; visited set, so a reference cycle between saved cards ends.
               (perf/some (fn [card-id]
                            (some-> (lib.metadata/card query card-id)
                                    :dataset-query
                                    perf/not-empty
                                    reads-parameter-tag?))
                          (lib/all-source-card-ids-recursive query))))))))
