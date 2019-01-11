(ns metabase.serialization.load
  "Load entities serialized by `metabase.serialization.dump`."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [metabase.config :as config]
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
             [field-values :refer [FieldValues]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [segment :refer [Segment]]
             [setting :refer [Setting] :as setting]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.query-processor.util :as qp.util]
            [metabase.serialization
             [names :refer [fully-qualified-name->context]]
             [upsert :refer [maybe-upsert-many!]]]
            [metabase.util :as u]
            [toucan.db :as db]
            [yaml.core :as yaml])
  (:refer-clojure :exclude [load]))

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
  (mbql.util/replace (mbql.normalize/normalize entity)
    [:field-id (fully-qualified-name :guard string?)]
    [:field-id (:field (fully-qualified-name->context fully-qualified-name))]

    [:metric (fully-qualified-name :guard string?)]
    [:metric (:metric (fully-qualified-name->context fully-qualified-name))]

    [:segment (fully-qualified-name :guard string?)]
    [:segment (:segment (fully-qualified-name->context fully-qualified-name))]))

(def ^:private default-user (delay (db/select-one-id User :is_superuser true)))

(defmulti load
  "Load an entity of type `model` stored at `path` in the context `context`.

   Passing in parent entities as context instead of decoding them from the path each time,
   saves a lot of queriying."
  (fn [_ _ model]
    model))

(defn- load-dimensions
  [path context]
  (maybe-upsert-many! (:mode context) Dimension
    (for [dimension (yaml/from-file (str path "/dimensions.yaml") true)]
      (-> dimension
          (update :human_readable_field_id (comp :field fully-qualified-name->context))
          (update :field_id (comp :field fully-qualified-name->context))))))

(defmethod load Database
  [path context _]
  (let [context (assoc context :prefix path)]
    (doseq [path (list-dirs (str path "/databases"))]
      (maybe-upsert-many! (:mode context) Database (slurp-dir path))
      (doseq [path (conj (list-dirs (str path "/schemas")) path)]
        (load path context Table)
        (load-dimensions path context)))))

(defn- path->fully-qualified-name
  [prefix path]
  (subs path (count prefix) (count path)))

(defmethod load Table
  [path context _]
  (let [context   (->> path
                       (path->fully-qualified-name (:prefix context))
                       fully-qualified-name->context
                       (merge context))
        paths     (list-dirs (str path "/tables"))
        table-ids (maybe-upsert-many! (:mode context) Table
                    (for [table (slurp-many paths)]
                      (assoc table :db_id (:database context))))]
    (doseq [[path table-id] (map vector paths table-ids)]
      (let [context (assoc context :table table-id)]
        (load path context Field)
        (load path context Metric)
        (load path context Segment)))))

(defn- fully-qualified-name->card-id
  [fully-qualified-name]
  (some->> fully-qualified-name fully-qualified-name->context :card))

(defmethod load Field
  [path context _]
  (let [fields       (slurp-dir (str path "/fields"))
        field-values (map :values fields)
        field-ids    (maybe-upsert-many! (:mode context) Field
                       (for [field fields]
                         (-> field
                             (update :parent_id (comp :field fully-qualified-name->context))
                             (update :fk_target_field_id (comp :field fully-qualified-name->context))
                             (dissoc :values)
                             (assoc :table_id (:table context)))))]
    (maybe-upsert-many! (:mode context) FieldValues
      (for [[field-value field-id] (map vector field-values field-ids)]
        (assoc field-value :field_id field-id)))))

(defmethod load Metric
  [path context _]
  (maybe-upsert-many! (:mode context) Metric
    (for [metric (slurp-dir (str path "/metrics"))]
      (-> metric
          (assoc :table_id   (:table context)
                 :creator_id @default-user)
          (assoc-in [:definition :source-table] (:table context))
          (update :definition mbql-fully-qualified-names->ids)))))

(defmethod load Segment
  [path context _]
  (maybe-upsert-many! (:mode context) Segment
    (for [metric (slurp-dir (str path "/segments"))]
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

(defmethod load Dashboard
  [path context _]
  (let [dashboards         (slurp-dir (str path "/dashboards"))
        dashboard-ids      (maybe-upsert-many! (:mode context) Dashboard
                             (for [dashboard dashboards]
                               (-> dashboard
                                   (dissoc :dashboard_cards)
                                   (assoc :collection_id (:collection context)
                                          :creator_id    @default-user))))
        dashboard-cards    (map :dashboard_cards dashboards)
        dashboard-card-ids (maybe-upsert-many! (:mode context) DashboardCard
                             (for [[dashboard-cards dashboard-id] (map vector dashboard-cards dashboard-ids)
                                   dashboard-card dashboard-cards]
                               (-> dashboard-card
                                   (dissoc :series)
                                   (update :card_id fully-qualified-name->card-id)
                                   (assoc :dashboard_id dashboard-id)
                                   (update :parameter_mappings update-parameter-mappings))))]
    (maybe-upsert-many! (:mode context) DashboardCardSeries
      (for [[series dashboard-card-id] (map vector (mapcat (partial map :series) dashboard-cards)
                                                   dashboard-card-ids)
            dashboard-card-series series
            :when dashboard-card-series]
        (-> dashboard-card-series
            (assoc :dashboardcard_id dashboard-card-id)
            (update :card_id fully-qualified-name->card-id))))))

(defmethod load Pulse
  [path context _]
  (let [pulses    (slurp-dir (str path "/pulses"))
        cards     (map :cards pulses)
        channels  (map :channels pulses)
        pulse-ids (maybe-upsert-many! (:mode context) Pulse
                    (for [pulse pulses]
                      (-> pulse
                          (assoc :collection_id (:collection context)
                                 :creator_id    @default-user)
                          (dissoc :channels :cards))))]
    (maybe-upsert-many! (:mode context) PulseCard
      (for [[cards pulse-id] (map vector cards pulse-ids)
            card             cards]
        (-> card
            (assoc :pulse_id pulse-id)
            (update :card_id fully-qualified-name->card-id))))
    (maybe-upsert-many! (:mode context) PulseChannel
      (for [[channels pulse-id] (map vector channels pulse-ids)
            channel             channels]
        (assoc channel :pulse_id pulse-id)))))

(defn- source-table
  [source-table]
  (let [{:keys [card table]} (fully-qualified-name->context source-table)]
    (if card
      (str "card__" card)
      table)))

(defmethod load Card
  [path context _]
  (let [paths    (list-dirs (str path "/cards"))
        card-ids (maybe-upsert-many! (:mode context) Card
                   (for [card (slurp-many paths)]
                     (-> card
                         (update :table_id (comp :table fully-qualified-name->context))
                         (update :database_id (comp :database fully-qualified-name->context))
                         (update :dataset_query mbql-fully-qualified-names->ids)
                         (assoc :creator_id    @default-user
                                :collection_id (:collection context))
                         (update-in [:dataset_query :database]
                                    (comp :database fully-qualified-name->context))
                         (cond->
                             (-> card
                                 :dataset_query
                                 :type
                                 qp.util/normalize-token
                                 (= :query))
                           (update-in [:dataset_query :query :source-table] source-table)))))]
    ;; Nested cards
    (doseq [path paths]
      (load path context Card))))

(defmethod load User
  [path context _]
  ;; Currently we only serialize the new owner user, so it's fine to ignore mode setting
  (maybe-upsert-many! :skip User
    (for [user (slurp-dir (str path "/users"))]
      (assoc user :password "changeme"))))

(defn- derive-location
  [context]
  (if-let [parent-id (:collection context)]
    (str (-> parent-id Collection :location) parent-id "/")
    "/"))

(defmethod load Collection
  [path context _]
  (doseq [path (list-dirs (str path "/collections"))]
    (let [context (assoc context
                    :collection (->> (slurp-dir path)
                                     (map (fn [collection]
                                            (assoc collection :location (derive-location context))))
                                     (maybe-upsert-many! (:mode context) Collection)
                                     first))]
      (load path context Collection)
      (load path context Card)
      (load path context Pulse)
      (load path context Dashboard))))

(defn load-settings
  "Load a dump of settings."
  [path context]
  (doseq [[k v] (yaml/from-file (str path "/settings.yaml") true)
          :when (or (= (:mode context) :update)
                    (nil? (setting/get-string k)))]
    (setting/set-string! k v)))

(defn load-dependencies
  "Load a dump of dependencies."
  [path context]
  (let [fully-qualified-name->entity (comp (some-fn (comp Card :card)
                                                    (comp Metric :metric)
                                                    (comp Segment :segment)
                                                    (comp Pulse :pulse))
                                           fully-qualified-name->context)]
    (maybe-upsert-many! (:mode context) Dependency
      (for [{:keys [model_id dependent_on_id]} (yaml/from-file (str path "/dependencies.yaml") true)]
        (let [model        (fully-qualified-name->entity model_id)
              dependent-on (fully-qualified-name->entity dependent_on_id)]
          {:model              (name model)
           :model_id           (u/get-id model)
           :dependent_on_model (name dependent-on)
           :dependent_on_id    (u/get-id dependent-on)
           :created_at         (java.util.Date.)})))))

(defn compatible?
  "Is dump at path `path` compatible with the currently running version of Metabase?"
  [path]
  (-> (str path "/manifest.yaml")
      (yaml/from-file true)
      :metabase-version
      (= config/mb-version-info)))
