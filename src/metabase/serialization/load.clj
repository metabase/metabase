(ns metabase.serialization.load
  ""
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
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.query-processor.util :as qp.util]
            [metabase.serialization.dump :as dump]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [yaml.core :as yaml])
  (:refer-clojure :exclude [load]))

(defn- slurp-dir
  [f path]
  (->> path
       io/file
       (.listFiles)
       (filter #(-> % (.getName) (str/ends-with? ".yaml")))
       (map (fn [file]
              (f (yaml/from-file file true))))))

(defn- list-dirs
  [path]
  (->> path
       io/file
       (.listFiles)
       (filter #(.isDirectory %))
       (map #(.getPath %))))

(defmulti
  ^{:doc      ""
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
      (assoc :field (db/select-one-id Metric
                      :table_id (:table context)
                      :name     metric-name))
      (path->context path)))

(defmethod path->context "segments"
  [context [_ & [segment-name & path]]]
  (-> context
      (assoc :field (db/select-one-id Segment
                      :table_id (:table context)
                      :name     segment-name))
      (path->context path)))

(defmethod path->context "collections"
  [context [_ & [collection-name & path-rest :as full-path]]]
  (if (#{"dashboards" "cards"} collection-name)
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
  [prefix fully-qualified-name]
  (->> (str/split fully-qualified-name #"/")
       (remove-prefix prefix)
       (path->context {})))

(defn- fully-qualified-name->entity-reference
  [prefix [op & args]]
  (into [op] (map (fn [arg]
                    (if (sequential? arg)
                      ((some-fn :field :metric :segment) (fully-qualified-name->context prefix arg))
                      arg))
                  args)))

(defn- humanized-field-references->ids
  [entity prefix]
  (walk/postwalk (fn [form]
                   (if (dump/entity-reference? form)
                     (fully-qualified-name->entity-reference prefix form)
                     form))
                 entity))

(def ^:private default-user (delay (db/select-one-id User :is_superuser true)))

(defmulti
  ^{:doc      ""
    :arglists '([dir model])}
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
  (let [context (merge context (fully-qualified-name->context (:prefix context) path))]
    (doseq [path (list-dirs (str path "/tables"))]
      (let [context (assoc context
                      :table (->> path
                                  (slurp-dir (fn [table]
                                               (db/insert! Table
                                                 (assoc table :db_id (:database context)))))
                                  first
                                  u/get-id))]
        (load path context Field)
        (load path context Metric)
        (load path context Segment)))))

(defmethod load Field
  [path context _]
  (slurp-dir (fn [field]
               (db/insert! Field
                 (assoc field :table_id (:table context))))
             (str path "/fields")))

(defmethod load Metric
  [path context _]
  (slurp-dir (fn [metric]
               (db/insert! Metric
                 (-> metric
                     (assoc :table_id (:table context))
                     (assoc :creator_id @default-user)
                     (assoc-in [:definition :source-table] (:table context))
                     (humanized-field-references->ids (:prefix context)))))
             (str path "/metrics")))

(defmethod load Segment
  [path context _]
  (assoc context
    :segments (slurp-dir (fn [segment]
                           (db/insert! Segment
                             (-> segment
                                 (update :table_id (:table context))
                                 (update :creator_id @default-user)
                                 (assoc-in [:definition :source-table] (:table context))
                                 (humanized-field-references->ids (:prefix context)))))
                         (str path "/segments"))))

(defn- fully-qualified-name->card-id
  [context fully-qualified-name]
  (:card (fully-qualified-name->context (:prefix context) fully-qualified-name)))

(defn- update-parameter-mappings
  [parameter-mappings context]
  (map #(update % :card_id (partial fully-qualified-name->card-id context))
       parameter-mappings))

(defmethod load Dashboard
  [path context _]
  (doseq [path (list-dirs (str path "/dashboards"))]
    (slurp-dir
     (fn [dashboard]
       (let [dashboard-cards (:dashboard_cards dashboard)
             dashboard       (db/insert! Dashboard
                               (-> dashboard
                                   (dissoc :dashboard_cards)
                                   (update :collection_id (:collection context))
                                   (update :creator_id @default-user)
                                   (humanized-field-references->ids (:prefix context))))]
         (doseq [dashboard-card dashboard-cards]
           (let [series         (:series dashboard-card)
                 dashboard-card (db/insert! DashboardCard
                                  (-> dashboard-card
                                      (dissoc :series)
                                      (update :card_id (partial fully-qualified-name->card-id context))
                                      (assoc :dashboard_id (:id dashboard))
                                      (update :parameter_mappings update-parameter-mappings context)
                                      (humanized-field-references->ids (:prefix context))))]
             (doseq [dashboard-card-series series]
               (db/insert! DashboardCardSeries
                 (-> dashboard-card-series
                     (assoc :dashboardcard_id (:id dashboard-card))
                     (update :card_id (partial fully-qualified-name->card-id context)))))))
         dashboard))
     path)))

(defn- source-table
  [source-table context]
  (let [{:keys [card table]} (fully-qualified-name->context context source-table)]
    (if card
      (str "card__" (u/get-id card))
      table)))

(defmethod load Card
  [path context _]
  (doseq [path (list-dirs (str path "/cards"))]
    (slurp-dir
     (fn [card]
       (let [table (->> card :table_id (fully-qualified-name->context context) :table Table)
             db    (:db_id table)]
         (db/insert! Card
           (-> card
               (assoc :table_id (u/get-id table))
               (update :creator_id (:users context))
               (update :collection_id (:collection context))
               (update :database_id db)
               (update-in [:dataset_query :database] db)
               (cond->
                 (-> card :dataset_query :type qp.util/normalize-token (= :query))
                 (update-in [:dataset_query :query :source-table] source-table context))
               (humanized-field-references->ids (:prefix context))))))
     path)
    (load path Card)))

(defmethod load Collection
  [path context _]
  (doseq [path (list-dirs (str path "/collections"))]
    (let [context (assoc context
                    :prefix     (:prefix context path)
                    :collection (->> path
                                     (slurp-dir
                                      (fn [collection]
                                        (or (db/select-one Collection
                                              :location (:location collection)
                                              :personal_owner_id @default-user
                                            (db/insert! Collection
                                              (assoc collection :personal_owner_id @default-user))))))
                                     first
                                     u/get-id))]
      (load path Collection)
      (load path Card)
      (load path Dashboard))))
