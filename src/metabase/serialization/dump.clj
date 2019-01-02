(ns metabase.serialization.dump
  "Serialize a Matabase instance into a directory structure of YAMLs."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [medley.core :as m]
            [metabase.mbql
             [normalize :as mbql.normalize]
             [util :as mbql.util]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [database :refer [Database] :as database]
             [dependency :refer [Dependency]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [segment :refer [Segment]]
             [setting :as setting]
             [table :refer [Table]]]
            [metabase.serialization.names :refer [fully-qualified-name safe-name]]
            [metabase.util :as u]
            [toucan.db :as db]
            [yaml.core :as yaml]))

(def ^:private ^{:arglists '([form])} mbql-entity-reference?
  "Is given form an MBQL entity reference?"
  (partial mbql.normalize/is-clause? #{:field-id :fk-> :metric :segment}))

(defn- humanize-mbql
  [mbql]
  (-> mbql
      mbql.normalize/normalize
      (mbql.util/replace
        ;; `integer?` guard is here to make the operation idempotent
        [:field-id (id :guard integer?)]
        [:field-id (fully-qualified-name Field id)]

        [:metric (id :guard integer?)]
        [:metric (fully-qualified-name Metric id)]

        [:segment (id :guard integer?)]
        [:segment (fully-qualified-name Segment id)]

        ;; Legacy form with raw IDs
        [:fk-> (from :guard integer?) (to :guard integer?)]
        [:fk-> [:field-id (fully-qualified-name Field from)]
         [:field-id (fully-qualified-name Field to)]])))

(defn- humanize-entity-references
  [entity]
  (mbql.util/replace entity
    mbql-entity-reference?
    (humanize-mbql &match)

    map?
    (as-> &match entity
      (u/update-when entity :database (fn [db-id]
                                        (if (= db-id database/virtual-id)
                                          "database/__virtual"
                                          (fully-qualified-name Database db-id))))
      (u/update-when entity :card_id (partial fully-qualified-name Card))
      (u/update-when entity :source-table (fn [source-table]
                                            (if (and (string? source-table)
                                                     (str/starts-with? source-table "card__"))
                                              (fully-qualified-name Card (-> source-table
                                                                             (str/split #"__")
                                                                             second
                                                                             Integer/parseInt))
                                              (fully-qualified-name Table source-table))))
      (m/map-vals humanize-entity-references entity))))

(defmulti dump
  "Serialize entity `entity` to location `dir`.

   Depending on the entity, it will be serialized either as a single YAML, or a directory structure.

   Removes unneeded fields that can either be reconstructed from context or are meaningless
   (eg. :created_at)."
  (fn [_ entity]
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
                (format "%s/%s/%s.yaml" path (fully-qualified-name entity) (safe-name entity))
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
  ;; Note, we expect the field to be hydrated wrt FieldValues. This is done upstream, so hydration
  ;; can be done in batch.
  (spit-entity path :file (update field :values u/select-non-nil-keys [:values :human_readable_values])))

(defmethod dump (type Segment)
  [path segment]
  (spit-entity path :file segment))

(defmethod dump (type Metric)
  [path metric]
  (spit-entity path :file metric))

(defn- dashboard-cards-for-dashboard
  [dashboard]
  (let [dashboard-cards (db/select DashboardCard :dashboard_id (u/get-id dashboard))
        series          (db/select DashboardCardSeries
                          :dashboardcard_id [:in (map u/get-id dashboard-cards)])]
    (for [dashboard-card dashboard-cards]
      (->> (assoc dashboard-card
             :series (for [series (filter (comp #{(u/get-id dashboard-card)} :dashboardcard_id)
                                          series)]
                       (-> series

                           (update :card_id (partial fully-qualified-name Card))
                           (dissoc :id :dashboardcard_id))))
           strip-crud
           humanize-entity-references))))

(defmethod dump (type Dashboard)
  [path dashboard]
  (spit-entity path :file (assoc dashboard
                            :dashboard_cards (dashboard-cards-for-dashboard dashboard))))

(defmethod dump (type Collection)
  [path collection]
  (spit-entity path collection))

(defmethod dump (type Card)
  [path card]
  (->> (u/update-when card :table_id (partial fully-qualified-name Table))
       (spit-entity path)))

(defmethod dump (type Pulse)
  [path pulse]
  (spit-entity path :file
               (assoc pulse
                 :cards    (for [card (db/select PulseCard :pulse_id (u/get-id pulse))]
                             (-> card
                                 (dissoc :id :pulse_id)
                                 (update :card_id (partial fully-qualified-name Card))))
                 :channels (for [channel (db/select PulseChannel :pulse_id (u/get-id pulse))]
                             (strip-crud channel)))))

(defn dump-dependencies
  "Combine all dependencies into a vector and dump it into YAML at `path`."
  [path]
  (spit-yaml (str path "/dependencies.yaml")
             (for [{:keys [model_id model dependent_on_id dependent_on_model]} (Dependency)]
               {:dependent_on_id (fully-qualified-name (symbol dependent_on_model) dependent_on_id)
                :model_id        (fully-qualified-name (symbol model) model_id)})))

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
                       (->> table :db_id (fully-qualified-name Database))
                       (:schema table))
               (for [dimension dimensions]
                 (-> dimension
                     (update :field_id (partial fully-qualified-name Field))
                     (update :human_readable_field_id (partial fully-qualified-name Field))
                     strip-crud
                     humanize-entity-references)))))
