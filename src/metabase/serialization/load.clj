(ns metabase.serialization.load
  "Load entities serialized by `metabase.serialization.dump`."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.walk :as walk]
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
             [setting :refer [Setting] :as setting]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.query-processor.util :as qp.util]
            [metabase.serialization.dump :as dump]
            [metabase.util :as u]
            [toucan.db :as db]
            [yaml.core :as yaml])
  (:refer-clojure :exclude [load]))

(defn- slurp-dir
  [f path]
  (doall
   (for [^java.io.File file (.listFiles ^java.io.File (io/file path))
         :when (-> file (.getName) (str/ends-with? ".yaml"))]
     (f (yaml/from-file file true)))))

(defn- slurp-one-id
  [f path]
  (some->> path
           (slurp-dir f)
           first
           u/get-id))

(defn- list-dirs
  [path]
  (for [^java.io.File file (.listFiles ^java.io.File (io/file path))
        :when (.isDirectory file)]
    (.getPath file)))

(defmulti
  ^{:doc      "Extract entities from a logical path."
    :private  true
    :arglists '([path context])}
  path->context (fn [_ [model & _]]
                  model))

(defmethod path->context "databases"
  [context [_ & [db-name & path]]]
  (-> context
      (assoc :database (if (= db-name "__virtual")
                         -1337
                         (db/select-one-id Database :name db-name)))
      (path->context path)))

(defmethod path->context "schemas"
  [context [_ & [schema & path]]]
  (-> context
      (assoc :schema schema)
      (path->context path)))

(defmethod path->context "tables"
  [context [_ & [table-name & path]]]
  (-> context
      (assoc :table (db/select-one-id Table
                      :db_id  (:database context)
                      :schema (:schema context)
                      :name   table-name))
      (path->context path)))

(defmethod path->context "fields"
  [context [_ & [field-name & path]]]
  (-> context
      (assoc :field (db/select-one-id Field
                      :table_id (:table context)
                      :name     field-name))
      (path->context path)))

(defmethod path->context "metrics"
  [context [_ & [metric-name & path]]]
  (-> context
      (assoc :metric (db/select-one-id Metric
                       :table_id (:table context)
                       :name     metric-name))
      (path->context path)))

(defmethod path->context "segments"
  [context [_ & [segment-name & path]]]
  (-> context
      (assoc :segment (db/select-one-id Segment
                        :table_id (:table context)
                        :name     segment-name))
      (path->context path)))

(def ^:private reserved-collection-names #{"dashboards" "cards" "pulses"})

(defmethod path->context "collections"
  [context [_ & [collection-name & path-rest :as full-path]]]
  (if (reserved-collection-names collection-name)
    ;; root collection
    (path->context context full-path)
    (let [parent-location (-> context :collection Collection :location)]
      (-> context
          (assoc :collection (db/select-one-id Collection
                               :name     collection-name
                               :location (if parent-location
                                           (str parent-location (:collection context) "/")
                                           "/")))
          (path->context path-rest)))))

(defmethod path->context "dashboards"
  [context [_ & [dashboard-name & path]]]
  (-> context
      (assoc :dashboard (db/select-one-id Dashboard
                          :collection_id (:collection context)
                          :name          dashboard-name))
      (path->context path)))

(defmethod path->context "pulses"
  [context [_ & [pulse-name & path]]]
  (-> context
      (assoc :dashboard (db/select-one-id Pulse
                          :collection_id (:collection context)
                          :name          pulse-name))
      (path->context path)))

(defmethod path->context "cards"
  [context [_ & [dashboard-name & path]]]
  (-> context
      (assoc :card (db/select-one-id Card
                     :collection_id (:collection context)
                     :name          dashboard-name))
      (path->context path)))

(defmethod path->context nil
  [context _]
  context)

(defn- remove-prefix
  [prefix path]
  (-> prefix
      (str/split #"/")
      count
      (drop path)))

(defn- fully-qualified-name->context
  [context fully-qualified-name]
  (->> (str/split fully-qualified-name #"/")
       (remove-prefix (:prefix context))
       (path->context {})))

(defn- fully-qualified-name->entity-reference
  [context [op & args :as form]]
  (if (-> op qp.util/normalize-token (= :field-literal))
    form
    (into [op]
          (map (fn [arg]
                 (if (string? arg)
                   ((some-fn :field :metric :segment) (fully-qualified-name->context context arg))
                   arg)))
          args)))

(defn- humanized-field-references->ids
  [entity context]
  (walk/postwalk (fn [form]
                   (if (dump/entity-reference? form)
                     (fully-qualified-name->entity-reference context form)
                     form))
                 entity))

(def ^:private default-user (delay (or (db/select-one-id User :is_superuser true)
                                       (u/get-id
                                        (db/insert! User {:email        "admin@example.com"
                                                          :password     "load"
                                                          :first_name   "Admin"
                                                          :last_name    ""
                                                          :is_superuser true})))))

(defmulti
  ^{:doc      "Load an entity of type `model` stored at `path` in the context `context`.

               Passing in parent entities as context instead of decoding them from the path each
               time, saves a lot of queriying."
    :arglists '([path context model])}
  load (fn [_ _ model]
         model))

(defmethod load Database
  [path context _]
  (let [context {:prefix path}]
    (doseq [path (list-dirs (str path "/databases"))]
      (slurp-dir (partial db/insert! Database) path)
      (doseq [path (list-dirs (str path "/schemas"))]
        (load path context Table)))))

(defmethod load Table
  [path context _]
  (let [context (merge context (fully-qualified-name->context context path))]
    (doseq [path (list-dirs (str path "/tables"))]
      (let [context (assoc context
                      :table (slurp-one-id (fn [table]
                                             (db/insert! Table
                                               (assoc table :db_id (:database context))))
                                           path))]
        (load path context Field)
        (load path context Metric)
        (load path context Segment)))))

(defn- fully-qualified-name->card-id
  [context fully-qualified-name]
  (some->> fully-qualified-name (fully-qualified-name->context context) :card))

(defmethod load Field
  [path context _]
  (slurp-dir
   (fn [field]
     (let [field-values (select-keys field [:values :human_readable_values])
           dimension    (:dimension field)
           field        (db/insert! Field
                          (-> field
                              (dissoc :values :human_readable_values :dimension)
                              (assoc :table_id (:table context))))]
       (when (:values field-values)
         (db/insert! FieldValues
           (assoc field-values :field_id (u/get-id field))))
       (when dimension
         (db/insert! Dimension
           (-> dimension
               (update :human_readable_field_id (partial fully-qualified-name->card-id context))
               (assoc :field_id (u/get-id field)
                      :name     (:display_name field)))))
       field))
   (str path "/fields")))

(defmethod load Metric
  [path context _]
  (slurp-dir (fn [metric]
               (db/insert! Metric
                 (-> metric
                     (assoc :table_id   (:table context)
                            :creator_id @default-user)
                     (assoc-in [:definition :source-table] (:table context))
                     (humanized-field-references->ids context))))
             (str path "/metrics")))

(defmethod load Segment
  [path context _]
  (slurp-dir (fn [segment]
               (db/insert! Segment
                 (-> segment
                     (assoc :table_id   (:table context)
                            :creator_id @default-user)
                     (assoc-in [:definition :source-table] (:table context))
                     (humanized-field-references->ids context))))
             (str path "/segments")))

(defn- update-parameter-mappings
  [parameter-mappings context]
  (map #(update % :card_id (partial fully-qualified-name->card-id context)) parameter-mappings))

(defmethod load Dashboard
  [path context _]
  (slurp-dir
   (fn [dashboard]
     (let [dashboard-cards (:dashboard_cards dashboard)
           dashboard       (db/insert! Dashboard
                             (-> dashboard
                                 (dissoc :dashboard_cards)
                                 (assoc :collection_id (:collection context)
                                        :creator_id @default-user)
                                 (humanized-field-references->ids context)))]
       (doseq [dashboard-card dashboard-cards]
         (let [series         (:series dashboard-card)
               dashboard-card (db/insert! DashboardCard
                                (-> dashboard-card
                                    (dissoc :series)
                                    (update :card_id (partial fully-qualified-name->card-id context))
                                    (assoc :dashboard_id (:id dashboard))
                                    (update :parameter_mappings update-parameter-mappings context)
                                    (humanized-field-references->ids context)))]
           (doseq [dashboard-card-series series]
             (db/insert! DashboardCardSeries
               (-> dashboard-card-series
                   (assoc :dashboardcard_id (:id dashboard-card))
                   (update :card_id (partial fully-qualified-name->card-id context)))))))
       dashboard))
   (str path "/dashboards")))

(defmethod load Pulse
  [path context _]
  (slurp-dir
   (fn [pulse]
     (let [{:keys [cards channels]} pulse
           pulse                    (db/insert! Pulse
                                      (-> pulse
                                          (assoc :collection_id (:collection context)
                                                 :creator_id    @default-user)
                                          (dissoc :channels :cards)))]
       (doseq [card cards]
         (db/insert! PulseCard
           (-> card
               (assoc :pulse_id (u/get-id pulse))
               (update :card_id (partial fully-qualified-name->card-id context)))))
       (doseq [channel channels]
         (db/insert! PulseChannel
           (assoc channel :pulse_id (u/get-id pulse))))))
   (str path "/pulses")))

(defn- source-table
  [source-table context]
  (let [{:keys [card table]} (fully-qualified-name->context context source-table)]
    (if card
      (str "card__" card)
      table)))

(defmethod load Card
  [path context _]
  (doseq [path (list-dirs (str path "/cards"))]
    (let [context (assoc context
                    :card (slurp-one-id
                           (fn [card]
                             (let [table (->> card
                                              :table_id
                                              (fully-qualified-name->context context)
                                              :table
                                              Table)
                                   db    (:db_id table)]
                               (db/insert! Card
                                 (-> card
                                     (assoc :table_id      (u/get-id table)
                                            :creator_id    @default-user
                                            :collection_id (:collection context)
                                            :database_id   db)
                                     (assoc-in [:dataset_query :database] db)
                                     (cond->
                                       (-> card
                                           :dataset_query
                                           :type
                                           qp.util/normalize-token
                                           (= :query))
                                       (update-in [:dataset_query :query :source-table] source-table context))
                                     (humanized-field-references->ids context)))))
                           path))]
      ;; Nested cards
      (load path context Card))))

(defn- derive-location
  [context]
  (if-let [parent-id (:collection context)]
    (str (-> parent-id Collection :location) parent-id "/")
    "/"))

(defmethod load Collection
  [path context _]
  (let [prefix  (:prefix context path)
        context (assoc context
                  :prefix     prefix
                  :collection (when (not= prefix path)
                                (slurp-one-id
                                 (fn [collection]
                                   (let [collection (assoc collection
                                                      :location (derive-location context))]
                                     (if (:personal_owner_id collection)
                                       (or (db/select-one Collection
                                             :personal_owner_id @default-user)
                                           (db/insert! Collection
                                             (assoc collection :personal_owner_id @default-user)))
                                       (db/insert! Collection collection))))
                                 path)))]
    (doseq [path (list-dirs (str path "/collections"))
            :when (not-any? (partial str/ends-with? path) reserved-collection-names)]
      (load path context Collection))
    (let [path (if (= path prefix)
                 (str path "/collections")
                 path)]
      (load path context Card)
      (load path context Pulse)
      (load path context Dashboard))))

(defn load-settings
  "Load a dump of settings."
  [path]
  (doseq [[k v] (yaml/from-file (str path "/settings.yaml") true)]
    (setting/set-string! k v)))

(defn load-dependencies
  "Load a dump of dependencies."
  [path]
  (let [fully-qualified-name->entity (comp (some-fn (comp Card :card)
                                                    (comp Metric :metric)
                                                    (comp Segment :segment)
                                                    (comp Pulse :pulse))
                                           (partial fully-qualified-name->context {:prefix path}))]
    (for [{:keys [model_id dependent_on_id]} (yaml/from-file (str path "/dependencies.yaml") true)]
      (let [model        (fully-qualified-name->entity model_id)
            dependent-on (fully-qualified-name->entity dependent_on_id)]
        (db/insert! Dependency {:model              (name model)
                                :model_id           (u/get-id model)
                                :dependent_on_model (name dependent-on)
                                :dependent_on_id    (u/get-id dependent-on)
                                :created_at         (java.util.Date.)})))))
