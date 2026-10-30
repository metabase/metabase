(ns metabase-enterprise.semantic-layer-import.resolve
  "Stage 2 of the import: bind the IR's content to Lib queries.

  Takes the IR (see [[metabase-enterprise.semantic-layer-import.schemas.ir]]) and a config, builds what every kind of
  content shares (the env of [[resolve.columns/env]], with a metadata provider per Metabase database, and the
  collection everything is written into) and resolves each kind of content in it: metrics, in
  [[metabase-enterprise.semantic-layer-import.resolve.metrics]]. Another kind of content would be resolved next to
  them here, in a namespace of its own. What the parse stage could not convert is carried over, so the result's
  `:unsupported` and `:errors` are the complete lists for the run.

  Only knows the IR, not any source, so another semantic layer's parser plugs in unchanged."
  (:require
   [metabase-enterprise.semantic-layer-import.ids :as ids]
   [metabase-enterprise.semantic-layer-import.metadata :as metadata]
   [metabase-enterprise.semantic-layer-import.resolve.columns :as resolve.columns]
   [metabase-enterprise.semantic-layer-import.resolve.metrics :as resolve.metrics]
   [metabase-enterprise.semantic-layer-import.schemas.config :as config]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase-enterprise.semantic-layer-import.schemas.resolved :as resolved]
   [metabase.util.malli :as mu]))

(mu/defn- collection :- ::resolved/collection
  "The collection the content of `ir` is written into: named by the config's `:collection-name`, or after the source's
  tool (`dbt metrics`), with an `entity_id` derived from the source and the Metabase Databases the tables map to (see
  [[ids/collection-entity-id]])."
  [config                          :- ::config/config
   {:keys [source tables] :as _ir} :- ::ir/semantic-layer]
  {:name        (:collection-name config (str (:tool source) " metrics"))
   :description (format "Metrics imported from %s." (:tool source))
   :entity-id   (ids/collection-entity-id source (keep #(metadata/table-database config %) (vals tables)))})

(mu/defn- parse-error :- ::resolved/error
  "The `:errors` entry for an entry the parse stage failed on, which it reports flagged `:error?`."
  [{:keys [kind unique-id reason], entry-name :name} :- ::ir/unsupported]
  {:kind      kind
   :name      entry-name
   :unique-id unique-id
   :message   reason})

(mu/defn resolve-semantic-layer :- ::resolved/semantic-layer
  "Resolve every kind of content in the IR `ir` with `config`. Unsupported entries from the parse stage are carried
  over, so the result's `:unsupported` is the complete list for the run, and so are the entries the parse stage failed
  on (flagged `:error?` there), under `:errors` with the resolve stage's own. A metric that refers to one of the
  metrics the parse stage reported is reported with that metric's reason (see [[resolve.metrics/resolve-metrics]])."
  [config                               :- ::config/config
   {:keys [metrics unsupported] :as ir} :- ::ir/semantic-layer]
  (let [env                                          (resolve.columns/env config ir)
        {parse-errors true, parse-unsupported false} (group-by (comp boolean :error?) unsupported)
        failed-metrics                               (into {}
                                                           (comp (filter #(= :metric (:kind %)))
                                                                 (map (juxt :name :reason)))
                                                           unsupported)
        resolved-metrics                             (resolve.metrics/resolve-metrics env failed-metrics metrics)]
    {:collection  (collection config ir)
     :metrics     (:metrics resolved-metrics)
     :unsupported (into (vec parse-unsupported) (:unsupported resolved-metrics))
     :errors      (into (mapv parse-error parse-errors) (:errors resolved-metrics))}))
