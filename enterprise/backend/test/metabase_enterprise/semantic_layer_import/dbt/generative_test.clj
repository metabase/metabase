(ns metabase-enterprise.semantic-layer-import.dbt.generative-test
  "A smoke test over manifests generated from the manifest schemas: whatever fits the schemas, the converter either
  converts or reports under `:unsupported` or `:errors`. Nothing escapes decode, parse or resolve as an exception, and
  what comes out is a valid resolved manifest.

  `metadata` is fixed rather than generated: its version fields are an anchored regex and a predicate that malli has
  no generator for. Two manifests are run per seed: one as generated, whose references almost never line up (so every
  metric lands in `:unsupported`), and one wired so that they do (see [[wire]]), so that the resolve stage's column,
  aggregation, filter and SQL paths run over generated input too."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [malli.generator :as mg]
   [metabase-enterprise.semantic-layer-import.dbt.manifest :as dbt-manifest]
   [metabase-enterprise.semantic-layer-import.dbt.parse :as parse]
   [metabase-enterprise.semantic-layer-import.dbt.test-util :as tu]
   [metabase-enterprise.semantic-layer-import.resolve :as resolve]
   [metabase-enterprise.semantic-layer-import.schemas.resolved :as resolved]
   [metabase.util.malli.registry :as mr]))

(def ^:private seeds (range 1 26))

(def ^:private size
  "malli's `:size`: how many entries the generated maps and sequences have, at most, and how long the strings are."
  8)

(def ^:private metadata
  {:dbt_schema_version "https://schemas.getdbt.com/dbt/manifest/v12.json"
   :dbt_version        "1.12.6"
   :project_name       "generated"
   :adapter_type       "postgres"})

(def ^:private sections-schema
  "The generated part of a manifest: everything but `metadata`."
  [:map
   [:nodes           [:map-of :string ::dbt-manifest/node]]
   [:semantic_models [:map-of :string ::dbt-manifest/semantic-model]]
   [:metrics         [:map-of :string ::dbt-manifest/metric]]])

(defn- generate-manifest
  "A manifest generated from [[sections-schema]] with `seed`, with the fixed [[metadata]]."
  [seed]
  (assoc (mg/generate (mr/resolve-schema sections-schema) {:seed seed, :size size}) :metadata metadata))

(defn- nth-cyclic
  "The `i`th element of `coll`, wrapping around."
  [coll i]
  (nth coll (mod i (count coll))))

(defn- wire
  "`manifest` with its references lined up: every node, semantic model and metric keyed by a `unique_id` with the
  prefix dbt gives its kind (`model.`, `semantic_model.`, `metric.`), which is how `depends_on` is read, every node
  in a database (a relation without one cannot be mapped to a Metabase database) with a non-blank `schema` and
  `alias` (dbt never writes a blank one, and the metadata provider's table schema rejects it with its own validation
  error rather than a reported reason) and every column's `data_type` dropped (a generated one is a type the driver
  does not know, which is reported), every semantic
  model over one of the nodes, by `depends_on` and `node_relation`, its measures over that node's columns, every
  metric with a non-blank `name` (a blank one fails the card the provider makes of it the same way) over one of the
  semantic models and one of its measures, and every other metric's `filter` dropped (a generated template has no
  MetricFlow reference in it, so a metric with one is always reported). Unchanged when there is no node or no
  semantic model to wire to."
  [{:keys [nodes metrics], semantic-models :semantic_models, :as manifest}]
  (if (or (empty? nodes) (empty? semantic-models))
    manifest
    (let [re-key          (fn [prefix entries]
                            (into {}
                                  (map (fn [[k entry]]
                                         (let [unique-id (str prefix k)]
                                           [unique-id (assoc entry :unique_id unique-id)])))
                                  entries))
          untyped         (fn [column] (assoc column :data_type nil))
          named           (fn [s] (if (str/blank? s) "generated" s))
          nodes           (update-vals (re-key "model." nodes)
                                       (fn [node]
                                         (cond-> (-> node
                                                     (update :database #(or % "warehouse"))
                                                     (update :schema named)
                                                     (update :alias named))
                                           (:columns node) (update :columns update-vals untyped))))
          semantic-models (re-key "semantic_model." semantic-models)
          metrics         (re-key "metric." metrics)
          node-ids        (vec (keys nodes))
          sm-ids          (vec (keys semantic-models))
          wire-measure    (fn [columns j measure]
                            (cond-> measure
                              (seq columns) (assoc :expr (nth-cyclic columns j))))
          wire-model      (fn [i [sm-id semantic-model]]
                            (let [node-id (nth-cyclic node-ids i)
                                  node    (get nodes node-id)
                                  {:keys [database], node-schema :schema, node-alias :alias} node
                                  columns (vec (keys (:columns node)))]
                              [sm-id (-> semantic-model
                                         (assoc :node_relation {:database      database
                                                                :schema_name   node-schema
                                                                :alias         node-alias
                                                                :relation_name nil})
                                         (assoc-in [:depends_on :nodes] [node-id])
                                         (update :measures #(vec (map-indexed (partial wire-measure columns) %))))]))
          semantic-models (into {} (map-indexed wire-model) semantic-models)
          wire-metric     (fn [i [metric-id metric]]
                            (let [sm-id    (nth-cyclic sm-ids i)
                                  measures (vec (get-in semantic-models [sm-id :measures]))]
                              [metric-id (cond-> (-> metric
                                                     (update :name named)
                                                     (assoc-in [:depends_on :nodes] [sm-id]))
                                           (seq measures) (assoc-in [:type_params :measure :name]
                                                                    (:name (nth-cyclic measures i)))
                                           (even? i)      (assoc :filter nil))]))]
      (assoc manifest
             :nodes           nodes
             :semantic_models semantic-models
             :metrics         (into {} (map-indexed wire-metric) metrics)))))

(defn- config
  "A config mapping every warehouse database the manifest names to a Metabase database."
  [{:keys [nodes], semantic-models :semantic_models}]
  (let [databases (into #{}
                        (keep :database)
                        (concat (vals nodes) (map :node_relation (vals semantic-models))))]
    {:databases     (into {} (map (fn [database] [database (str "Metabase " database)])) databases)
     :driver        :postgres
     :creator-email "admin@example.com"}))

(defn- convert
  "`manifest` through JSON (as the converter reads a file), decode, parse and resolve; the resolved manifest, or the
  Throwable that escaped."
  [manifest]
  (try
    (->> manifest
         tu/round-trip
         dbt-manifest/decode-manifest
         parse/parse-manifest
         (resolve/resolve-semantic-layer (config manifest)))
    (catch Throwable e
      e)))

(defn- unique-ids
  "The dbt unique ids of the metrics in `manifest`."
  [manifest]
  (into #{} (map :unique_id) (vals (:metrics manifest))))

(defn- reported-ids
  "The dbt unique ids of everything `resolved` converted or reported."
  [resolved]
  (into #{}
        (concat (map (comp :unique-id :ir) (:metrics resolved))
                (map :unique-id (:unsupported resolved))
                (map :unique-id (:errors resolved)))))

(deftest ^:parallel generated-manifests-test
  (let [converted (atom 0)]
    (doseq [seed               seeds
            :let               [generated (generate-manifest seed)]
            [variant manifest] {"as generated" generated, "wired" (wire generated)}]
      (testing (format "seed %d, %s" seed variant)
        (is (mr/validate ::dbt-manifest/manifest manifest) "what the generator made fits the manifest schema")
        (let [resolved (convert manifest)]
          (is (not (instance? Throwable resolved))
              (str "an exception escaped the converter: " (ex-message resolved)))
          (when (map? resolved)
            (swap! converted + (count (:metrics resolved)))
            (is (mr/validate ::resolved/semantic-layer resolved))
            (is (set/subset? (unique-ids manifest) (reported-ids resolved))
                "every metric is converted, reported as unsupported, or listed under :errors")
            (is (= [] (:errors resolved))
                "the converter failed on none of them: an :errors entry is an exception it did not anticipate")))))
    (testing "the wired manifests convert some metrics, so the happy path runs over generated input too"
      (is (pos? @converted)))))
