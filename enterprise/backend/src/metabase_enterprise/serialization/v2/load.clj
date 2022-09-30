(ns metabase-enterprise.serialization.v2.load
  "Loading is the interesting part of deserialization: integrating the maps \"ingested\" from files into the appdb.
  See the detailed breakdown of the (de)serialization processes in [[metabase.models.serialization.base]]."
  (:require [medley.core :as m]
            [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
            [metabase.models.serialization.base :as serdes.base]))

(declare load-one)

(defn- load-deps
  "Given a list of `deps` (hierarchies), `load-one` them all."
  [ctx deps]
  (if (empty? deps)
    ctx
    (reduce load-one ctx deps)))

(defonce last-loaded (atom nil))

(comment
  (-> (metabase-enterprise.serialization.v2.ingest.yaml/ingest-yaml  "/tmp/stats-export")
      (serdes.ingest/ingest-one [{:model "Card", :id "cd346b9c"}])
      #_:parameter_mappings
      (serdes.base/load-xform)
      #_(metabase.models.serialization.util/mbql-deps)
      #_(serdes.base/serdes-dependencies))

  (-> (deref last-loaded)
      #_serdes.base/serdes-dependencies
      serdes.base/load-xform
      #_:dataset_query
      #_(metabase.models.serialization.util/mbql-deps))
  (toucan.db/select-one 'Card :name "Canceled Hosting Customers")


  (def the-entity (->> {:where [:= :name "Canceled Hosting Customers"]}
                       (serdes.base/raw-reducible-query "Card")
                       (into [])
                       first))

  (require '[clojure.test :refer :all])
  (let [col-settings {"[\"ref\",[\"field\",\"count\",{\"base-type\":\"type/BigInteger\"}]]" {:column_title "Number of Invoices"}}]
    (is (= col-settings
           (-> col-settings
               (#'metabase-enterprise.serialization.v2.storage.yaml/generate-yaml)
               (yaml.core/parse-string :keywords false)
               (#'metabase-enterprise.serialization.v2.ingest.yaml/keywords)
               ))))

  (namespace (keyword "{[\"ref\",\"type/BigInteger\"]: 7"))
  (->> (yaml.core/parse-string
         "column_settings:\n  '[\"ref\",[\"field-literal\",\"count\",\"type/BigInteger\"]]':\n    column_title: Number of Invoices\n"
         #_"'[\"ref\",[\"]': bar\nxyz: 7"
         :keywords false)
       )

  (metabase.models.serialization.util/export-visualization-settings
    {:column_settings {"[\"ref\",[\"field\",\"count\",{\"base-type\":\"type/BigInteger\"}]]"
                       {:column_title "Number of Invoices"}}})

  (let [vis  (:visualization_settings the-entity)]
    (is (= vis
           (->> vis
                metabase.models.serialization.util/export-visualization-settings
                metabase.models.serialization.util/import-visualization-settings))))

  (def extracted (serdes.base/extract-one "Metric" {} the-entity))
  (->> (serdes.ingest/ingest-one (metabase-enterprise.serialization.v2.ingest.yaml/ingest-yaml "/tmp/stats-export")
                                 [{:model "Card" :id "azfAA6RlSkoqj09lIZrrX"}])
       (serdes.base/serdes-dependencies)
       )
  )

(defn- load-one
  "Loads a single entity, specified by its `:serdes/meta` abstract path, into the appdb, doing some bookkeeping to avoid
  cycles.

  If the incoming entity has any dependencies, they are recursively processed first (postorder) so that any foreign key
  references in this entity can be resolved properly.

  This is mostly bookkeeping for the overall deserialization process - the actual load of any given entity is done by
  [[metabase.models.serialization.base/load-one!]] and its various overridable parts, which see.

  Circular dependencies are not allowed, and are detected and thrown as an error."
  [{:keys [expanding ingestion seen] :as ctx} path]
  (cond
    (expanding path) (throw (ex-info (format "Circular dependency on %s" (pr-str path)) {:path path}))
    (seen path) ctx ; Already been done, just skip it.
    :else (let [ingested (serdes.ingest/ingest-one ingestion path)
                _ (reset! last-loaded ingested)
                deps     (serdes.base/serdes-dependencies ingested)
                ctx      (-> ctx
                             (update :expanding conj path)
                             (load-deps deps)
                             (update :seen conj path)
                             (update :expanding disj path))
                ;; Use the abstract path as attached by the ingestion process, not the original one we were passed.
                rebuilt-path    (serdes.base/serdes-path ingested)
                local-pk-or-nil (serdes.base/load-find-local rebuilt-path)
                _               (serdes.base/load-one! ingested local-pk-or-nil)]
            ctx)))

(defn load-metabase
  "Loads in a database export from an ingestion source, which is any Ingestable instance."
  [ingestion]
  ;; We proceed in the arbitrary order of ingest-list, deserializing all the files. Their declared dependencies guide
  ;; the import, and make sure all containers are imported before contents, etc.
  (let [contents (serdes.ingest/ingest-list ingestion)]
    (reduce load-one {:expanding #{}
                      :seen      #{}
                      :ingestion ingestion
                      :from-ids  (m/index-by :id contents)}
            contents)))
