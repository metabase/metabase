(ns metabase-enterprise.serialization.load
  "Load entities serialized by `metabase-enterprise.serialization.dump`."
  (:refer-clojure :exclude [load])
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase-enterprise.serialization
             [names :refer [fully-qualified-name->context]]
             [upsert :refer [maybe-upsert-many!]]]
            [metabase.mbql
             [normalize :as mbql.normalize]
             [util :as mbql.util]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [database :as database :refer [Database]]
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
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.query-processor.util :as qp.util]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [trs]]]
            [toucan.db :as db]
            [yaml
             [core :as yaml]
             [reader :as y.reader]])
  (:import java.time.temporal.Temporal))

(extend-type Temporal y.reader/YAMLReader
  (decode [data]
    (u.date/parse data)))

(defn- slurp-dir
  [path]
  (doall
   (for [^java.io.File file (.listFiles ^java.io.File (io/file path))
         :when (-> file (.getName) (str/ends-with? ".yaml"))]
     (yaml/from-file file true))))

(defn- slurp-many
  [paths]
  (apply concat (map slurp-dir paths)))

(defn- list-dirs
  [path]
  (for [^java.io.File file (.listFiles ^java.io.File (io/file path))
        :when (.isDirectory file)]
    (.getPath file)))

(defn- mbql-fully-qualified-names->ids
  [entity]
  (mbql.util/replace (mbql.normalize/normalize-tokens entity)
    [:field-id (fully-qualified-name :guard string?)]
    [:field-id (:field (fully-qualified-name->context fully-qualified-name))]

    [:metric (fully-qualified-name :guard string?)]
    [:metric (:metric (fully-qualified-name->context fully-qualified-name))]

    [:segment (fully-qualified-name :guard string?)]
    [:segment (:segment (fully-qualified-name->context fully-qualified-name))]))

(def ^:private default-user (delay
                             (let [user (db/select-one-id User :is_superuser true)]
                               (assert user (trs "No admin users found! At least one admin user is needed to act as the owner for all the loaded entities."))
                               user)))

(defn- terminal-dir
  "Return the last path component (presumably a dir)"
  [path]
  (.getName (clojure.java.io/file path)))

(defmulti load
  "Load an entity of type `model` stored at `path` in the context `context`.

   Passing in parent entities as context instead of decoding them from the path each time,
   saves a lot of queriying."
  (fn [path _]
    (terminal-dir path)))

(defn- load-dimensions
  [path context]
  (maybe-upsert-many! context Dimension
    (for [dimension (yaml/from-file (str path "/dimensions.yaml") true)]
      (-> dimension
          (update :human_readable_field_id (comp :field fully-qualified-name->context))
          (update :field_id (comp :field fully-qualified-name->context))))))

(defmethod load "databases"
  [path context]
  (doseq [path (list-dirs path)]
    ;; If we failed to load the DB no use in trying to load its tables
    (when-let [db (first (maybe-upsert-many! context Database (slurp-dir path)))]
      (doseq [inner-path (conj (list-dirs (str path "/schemas")) path)
              :let [context (merge context {:database db
                                            :schema   (when (not= inner-path path)
                                                        (terminal-dir path))})]]
        (load (str inner-path "/tables") context)
        (load-dimensions inner-path context)))))

(defmethod load "tables"
  [path context]
  (let [paths     (list-dirs path)
        table-ids (maybe-upsert-many! context Table
                    (for [table (slurp-many paths)]
                      (assoc table :db_id (:database context))))]
    ;; First load fields ...
    (doseq [[path table-id] (map vector paths table-ids)
            :when table-id]
      (let [context (assoc context :table table-id)]
        (load (str path "/fields") context)))
    ;; ... then everything else so we don't have issues with cross-table referencess
    (doseq [[path table-id] (map vector paths table-ids)
            :when table-id]
      (let [context (assoc context :table table-id)]
        (load (str path "/fks") context)
        (load (str path "/metrics") context)
        (load (str path "/segments") context)))))

(def ^:private fully-qualified-name->card-id
  (comp :card fully-qualified-name->context))

(defn- load-fields
  [path context]
  (let [fields       (slurp-dir path)
        field-values (map :values fields)
        field-ids    (maybe-upsert-many! context Field
                       (for [field fields]
                         (-> field
                             (update :parent_id (comp :field fully-qualified-name->context))
                             (update :last_analyzed u.date/parse)
                             (update :fk_target_field_id (comp :field fully-qualified-name->context))
                             (dissoc :values)
                             (assoc :table_id (:table context)))))]
    (maybe-upsert-many! context FieldValues
      (for [[field-value field-id] (map vector field-values field-ids)
            :when field-id]
        (assoc field-value :field_id field-id)))))

(defmethod load "fields"
  [path context]
  (load-fields path context))

(defmethod load "fks"
  [path context]
  (load-fields path context))

(defmethod load "metrics"
  [path context]
  (maybe-upsert-many! context Metric
    (for [metric (slurp-dir path)]
      (-> metric
          (assoc :table_id   (:table context)
                 :creator_id @default-user)
          (assoc-in [:definition :source-table] (:table context))
          (update :definition mbql-fully-qualified-names->ids)))))

(defmethod load "segments"
  [path context]
  (maybe-upsert-many! context Segment
    (for [metric (slurp-dir path)]
      (-> metric
          (assoc :table_id   (:table context)
                 :creator_id @default-user)
          (assoc-in [:definition :source-table] (:table context))
          (update :definition mbql-fully-qualified-names->ids)))))

(defn- update-parameter-mappings
  [parameter-mappings]
  (for [parameter-mapping parameter-mappings]
    (-> parameter-mapping
        (update :card_id fully-qualified-name->card-id)
        (update :target mbql-fully-qualified-names->ids))))

(defmethod load "dashboards"
  [path context]
  (let [dashboards         (slurp-dir path)
        dashboard-ids      (maybe-upsert-many! context Dashboard
                             (for [dashboard dashboards]
                               (-> dashboard
                                   (dissoc :dashboard_cards)
                                   (assoc :collection_id (:collection context)
                                          :creator_id    @default-user))))
        dashboard-cards    (map :dashboard_cards dashboards)
        dashboard-card-ids (maybe-upsert-many! context DashboardCard
                             (for [[dashboard-cards dashboard-id] (map vector dashboard-cards dashboard-ids)
                                   dashboard-card dashboard-cards
                                   :when dashboard-id]
                               (-> dashboard-card
                                   (dissoc :series)
                                   (update :card_id fully-qualified-name->card-id)
                                   (assoc :dashboard_id dashboard-id)
                                   (update :parameter_mappings update-parameter-mappings))))]
    (maybe-upsert-many! context DashboardCardSeries
      (for [[series dashboard-card-id] (map vector (mapcat (partial map :series) dashboard-cards)
                                                   dashboard-card-ids)
            dashboard-card-series series
            :when (and dashboard-card-series dashboard-card-id)]
        (-> dashboard-card-series
            (assoc :dashboardcard_id dashboard-card-id)
            (update :card_id fully-qualified-name->card-id))))))

(defmethod load "pulses"
  [path context]
  (let [pulses    (slurp-dir path)
        cards     (map :cards pulses)
        channels  (map :channels pulses)
        pulse-ids (maybe-upsert-many! context Pulse
                    (for [pulse pulses]
                      (-> pulse
                          (assoc :collection_id (:collection context)
                                 :creator_id    @default-user)
                          (dissoc :channels :cards))))]
    (maybe-upsert-many! context PulseCard
      (for [[cards pulse-id] (map vector cards pulse-ids)
            card             cards
            :when pulse-id]
        (-> card
            (assoc :pulse_id pulse-id)
            (update :card_id fully-qualified-name->card-id))))
    (maybe-upsert-many! context PulseChannel
      (for [[channels pulse-id] (map vector channels pulse-ids)
            channel             channels
            :when pulse-id]
        (assoc channel :pulse_id pulse-id)))))

(defn- source-table
  [source-table]
  (let [{:keys [card table]} (fully-qualified-name->context source-table)]
    (if card
      (str "card__" card)
      table)))

(defmethod load "cards"
  [path context]
  (let [paths (list-dirs path)]
    (maybe-upsert-many! context Card
      (for [card (slurp-many paths)]
        (-> card
            (update :table_id (comp :table fully-qualified-name->context))
            (update :database_id (comp :database fully-qualified-name->context))
            (update :dataset_query mbql-fully-qualified-names->ids)
            (assoc :creator_id    @default-user
                   :collection_id (:collection context))
            (update-in [:dataset_query :database] (comp :database fully-qualified-name->context))
            (cond->
                (-> card
                    :dataset_query
                    :type
                    qp.util/normalize-token
                    (= :query)) (update-in [:dataset_query :query :source-table] source-table)))))
    ;; Nested cards
    (doseq [path paths]
      (load (str path "/cards") context))))

(defmethod load "users"
  [path context]
  ;; Currently we only serialize the new owner user, so it's fine to ignore mode setting
  (maybe-upsert-many! context User
    (for [user (slurp-dir path)]
      (assoc user :password "changeme"))))

(defn- derive-location
  [context]
  (if-let [parent-id (:collection context)]
    (str (-> parent-id Collection :location) parent-id "/")
    "/"))

(defmethod load "collections"
  [path context]
  (doseq [path (list-dirs path)]
    (let [context (assoc context
                    :collection (->> (slurp-dir path)
                                     (map (fn [collection]
                                            (assoc collection :location (derive-location context))))
                                     (maybe-upsert-many! context Collection)
                                     first))]
      (load (str path "/collections") context)
      (load (str path "/cards") context)
      (load (str path "/pulses") context)
      (load (str path "/dashboards") context))))

(defn load-settings
  "Load a dump of settings."
  [path context]
  (doseq [[k v] (yaml/from-file (str path "/settings.yaml") true)
          :when (or (= context :update)
                    (nil? (setting/get-string k)))]
    (setting/set-string! k v)))

(defn- log-or-die
  [on-error message]
  (if (= on-error :abort)
    (throw (Exception. (str message)))
    (log/error message)))

(defn load-dependencies
  "Load a dump of dependencies."
  [path context]
  (let [fully-qualified-name->entity (comp (some-fn (comp Card :card)
                                                    (comp Metric :metric)
                                                    (comp Segment :segment)
                                                    (comp Pulse :pulse))
                                           fully-qualified-name->context)]
    (maybe-upsert-many! context Dependency
      (for [{:keys [model_id dependent_on_id]} (yaml/from-file (str path "/dependencies.yaml") true)]
        (let [model        (fully-qualified-name->entity model_id)
              dependent-on (fully-qualified-name->entity dependent_on_id)]
          (cond
            (and model dependent-on)
            {:model              (name model)
             :model_id           (u/get-id model)
             :dependent_on_model (name dependent-on)
             :dependent_on_id    (u/get-id dependent-on)
             :created_at         (java.util.Date.)}

            (nil? model)
            (log-or-die (:on-error model) (trs "Error loading dependencies: reference to an unknown entity {0}" model_id))

            (nil? dependent-on)
            (log-or-die (:on-error model) (trs "Error loading dependencies: reference to an unknown entity {0}" dependent_on_id))))))))

(defn compatible?
  "Is dump at path `path` compatible with the currently running version of Metabase?"
  [path]
  (-> (str path "/manifest.yaml")
      (yaml/from-file true)
      :metabase-version
      (= config/mb-version-info)))
