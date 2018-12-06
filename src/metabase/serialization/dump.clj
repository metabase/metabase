(ns metabase.serialization.dump
  "Serialize a Matabase instance into a directory structure of YAMLs."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.walk :as walk]
            [metabase.automagic-dashboards.filters :refer [field-reference?]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [database :refer [Database]]
             [dependency :refer [Dependency]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [field-values :refer [FieldValues]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [segment :refer [Segment]]
             [setting :as setting]
             [table :refer [Table]]]
            [metabase.query-processor.util :as qp.util]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [yaml.core :as yaml]))

(defmulti
  ^{:doc      "Get the logical path for entity `entity`.

               The idea is to replace all IDs with these human readable paths which are also
               instance-independent, making deserialization eaiser."
    :private  true
    :arglists '([entity])}
  fully-qualified-name type)

(defmethod fully-qualified-name (type Database)
  [db]
  (str "/databases/" (:name db)))

(defmethod fully-qualified-name (type Table)
  [table]
  (format "%s/schemas/%s/tables/%s"
          (->> table :db_id Database fully-qualified-name)
          (:schema table)
          (:name table)))

(defmethod fully-qualified-name (type Field)
  [field]
  (str (->> field :table_id Table fully-qualified-name) "/fields/" (:name field)))

(defmethod fully-qualified-name (type Metric)
  [metric]
  (str (->> metric :table_id Table fully-qualified-name) "/metrics/" (:name metric)))

(defmethod fully-qualified-name (type Segment)
  [segment]
  (str (->> segment :table_id Table fully-qualified-name) "/segments/" (:name segment)))

(defmethod fully-qualified-name (type Collection)
  [collection]
  (let [parents (->> (str/split (:location collection) #"/")
                     rest
                     (map #(-> % Integer/parseInt Collection :name (str "/collections")))
                     (str/join "/")
                     (format "%s/"))]
    (str "/collections/collections/" parents (:name collection))))

(defmethod fully-qualified-name (type Dashboard)
  [dashboard]
  (format "%s/dashboards/%s"
          (or (some->> dashboard :collection_id Collection fully-qualified-name)
              "/collections")
          (:name dashboard)))

(defmethod fully-qualified-name (type Pulse)
  [pulse]
  (format "%s/pulses/%s"
          (or (some->> pulse :collection_id Collection fully-qualified-name)
              "/collections")
          (:name pulse)))

(defmethod fully-qualified-name (type Card)
  [card]
  (format "%s/cards/%s"
          (or (some->> card
                       :dataset_query
                       qp.util/query->source-card-id
                       Card
                       fully-qualified-name)
              (some->> card
                       :collection_id
                       Collection
                       fully-qualified-name)
              "/collections")
          (:name card)))

(defmethod fully-qualified-name nil
  [_]
  nil)

(def ^:private SegmentOrMetric
  [(s/one (s/constrained su/KeywordOrString
                         (comp #{:metric :segment} qp.util/normalize-token))
          "head")
   (s/cond-pre s/Int su/KeywordOrString)])

(def ^{:arglists '([form])} entity-reference?
  "Is given form an MBQL entity reference?"
  (some-fn field-reference? (complement (s/checker SegmentOrMetric))))

(defn- entity-reference->fully-qualified-name
  [[op & args :as entity-reference]]
  (case (qp.util/normalize-token op)
    :metric        [op (fully-qualified-name (Metric (first args)))]
    :segment       [op (fully-qualified-name (Segment (first args)))]
    :field-id      [op (if (string? (first args))
                         (first args)
                         (fully-qualified-name (Field (first args))))]
    :fk->          (into [op]
                         (for [arg args]
                           (if (number? arg)
                             (Field arg)
                             (entity-reference->fully-qualified-name arg))))
    :field-literal entity-reference))

(defn- humanize-entity-references
  [entity]
  (walk/postwalk
   (fn [form]
     (cond
       (entity-reference? form)
       (entity-reference->fully-qualified-name form)

       (map? form)
       (let [id->fully-qualified-name (fn [entity-id model]
                                        (if (string? entity-id)
                                          entity-id
                                          (fully-qualified-name (model entity-id))))]
         (-> form
             (u/update-when :database (fn [db]
                                        (if (= db -1337)
                                          "database/virtual"
                                          (id->fully-qualified-name db Database))))
             (u/update-when :card_id id->fully-qualified-name Card)
             (u/update-when :source-table (fn [source-table]
                                            (if (and (string? source-table)
                                                     (str/starts-with? source-table "card__"))
                                              (-> source-table
                                                  (str/split #"__")
                                                  second
                                                  Integer/parseInt
                                                  (id->fully-qualified-name Card))
                                              (id->fully-qualified-name source-table Table))))))

       :else
       form))
   entity))

(defmulti
  ^{:doc      "Serialize entity `entity` to location `dir`.

               Depending on the entity, it will be serialized either as a single YAML, or a
               directory structure.

               Removes unneeded fields that can either be reconstructed from context or are
               meaningless (eg. :created_at)."
    :arglists '([dir entity])}
  dump (fn [_ entity]
         (type entity)))

(defn- strip-crud
  [entity]
  (cond-> (dissoc entity :id :creator_id :created_at :updated_at :db_id :database_id :location
                  :dashboard_id :fields_hash :personal_owner_id :made_public_by_id :collection_id
                  :pulse_id)
    (some #(instance? % entity) (map type [Metric Field Segment])) (dissoc :table_id)))

(defn- spit-yaml
  [fname obj]
  (io/make-parents fname)
  (spit fname (yaml/generate-string obj :dumper-options {:flow-style :block})))

(defn- spit-entity
  ([path entity] (spit-entity path :dir entity))
  ([path mode entity]
   (spit-yaml (if (= mode :dir)
                (format "%s/%s/%s.yaml" path (fully-qualified-name entity) (:name entity))
                (format "%s/%s.yaml" path (fully-qualified-name entity)))
              (->> entity
                   strip-crud
                   humanize-entity-references))))

(defmethod dump (type Database)
  [path db]
  (spit-entity path (dissoc db :features)))

(defmethod dump (type Table)
  [path table]
  (spit-entity path table))

(defmethod dump (type Field)
  [path field]
  (spit-entity path :file (merge field
                                 (-> (db/select-one FieldValues :field_id (u/get-id field))
                                     (u/select-non-nil-keys [:values :human_readable_values])))))

(defmethod dump (type Segment)
  [path segment]
  (spit-entity path :file segment))

(defmethod dump (type Metric)
  [path metric]
  (spit-entity path :file metric))

(defn- dashboard-cards-for-dashboard
  [dashboard]
  (->> dashboard
       u/get-id
       (db/select DashboardCard :dashboard_id)
       (map (fn [dashboard-card]
              (->> (assoc dashboard-card
                     :series (for [series (db/select DashboardCardSeries
                                            :dashboardcard_id (u/get-id dashboard-card))]
                               (-> series
                                   (update :card_id (comp fully-qualified-name Card))
                                   (dissoc :id :dashboardcard_id))))
                   strip-crud
                   humanize-entity-references)))))

(defmethod dump (type Dashboard)
  [path dashboard]
  (spit-entity path :file (assoc dashboard
                            :dashboard_cards (dashboard-cards-for-dashboard dashboard))))

(defmethod dump (type Collection)
  [path collection]
  (spit-entity path collection))

(defmethod dump (type Card)
  [path card]
  (->> (u/update-when card :table_id (comp fully-qualified-name Table))
       (spit-entity path)))

(defmethod dump (type Pulse)
  [path pulse]
  (spit-entity path :file
               (assoc pulse
                 :cards    (for [card (db/select PulseCard :pulse_id (u/get-id pulse))]
                             (-> card
                                 (dissoc :id :pulse_id)
                                 (update :card_id (comp fully-qualified-name Card))))
                 :channels (for [channel (db/select PulseChannel :pulse_id (u/get-id pulse))]
                             (strip-crud channel)))))

(def ^:private model-name->model
  {"Card"    Card
   "Segment" Segment
   "Metric"  Metric})

(defn dump-dependencies
  "Combine all dependencies into a vector and dump it into YAML at `path`."
  [path]
  (spit-yaml (str path "/dependencies.yaml")
             (for [{:keys [model_id model dependent_on_id dependent_on_model]} (Dependency)]
               {:model_id        (fully-qualified-name ((model-name->model model) model_id))
                :dependent_on_id (fully-qualified-name ((model-name->model dependent_on_model) dependent_on_id))})))

(defn dump-settings
  "Combine all settings into a map and dump it into YAML at `path`."
  [path]
  (spit-yaml (str path "/settings.yaml")
             (into {} (for [{:keys [key value]} (setting/all setting/get-string)]
                        [key value]))))

(defn dump-dimensions
  "Combine all dimensions into a vector and dump it into YAML at in the directory for the
   corresponding schema starting at `path`."
  [path]
  (doseq [[table-id dimensions] (group-by (comp :table_id Field :field_id) (Dimension))
          :let [table (Table table-id)]]
    (spit-yaml (format "%s/%s/schemas/%s/dimensions.yaml"
                       path
                       (->> table :db_id Database fully-qualified-name)
                       (:schema table))
               (for [dimension dimensions]
                 (-> dimension
                     (update :human_readable_field_id (comp fully-qualified-name Field))
                     strip-crud
                     humanize-entity-references)))))
