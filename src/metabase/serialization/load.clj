(ns metabase.serialization.load
  ""
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.walk :as walk]
            [metabase.db :as mdb]
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
              (let [entity (yaml/from-file file true)]
                {(:id entity) (:id (f (dissoc entity :id)))})))
       (apply merge)))

(defn- list-dirs
  [path]
  (->> path
       io/file
       (.listFiles)
       (filter #(.isDirectory %))
       (map #(.getPath %))))

(defn- fully-qualified-name->id
  [[db schema table field]]
  (let [db    (db/select-one Database :name db)
        table (db/select-one Table
                :db_id  (u/get-id db)
                :schema schema
                :name   table)]
    (db/select-one-field :id Field
      :name     field
      :table_id (u/get-id table))))

(defn- fully-qualified-name->field-reference
  [[op & args]]
  (into [op] (map (fn [arg]
                    (if (sequential? arg)
                      (fully-qualified-name->id arg)
                      arg))
                  args)))

(def ^:private EntityReference
  [(s/one (s/constrained su/KeywordOrString
                         (comp #{:metric :segment} qp.util/normalize-token))
          "head")
   (s/cond-pre s/Int su/KeywordOrString)])

(def ^{:arglists '([form])} entity-reference?
  "Is given form an MBQL entity reference (metric or segment)?"
  (complement (s/checker EntityReference)))

(def ^:private FieldReference
  [(s/one (s/constrained su/KeywordOrString
                         (comp #{:field-id :fk-> :field-literal} qp.util/normalize-token))
          "head")
   (s/cond-pre su/KeywordOrString [s/Str] (s/recursive #'FieldReference))])

(def ^:private ^{:arglists '([form])} field-reference?
  "Is given form a serialized MBQL field reference?
   Note this function is slightly different as `metabase.automgaic-dashboards.filters/field-reference?`
  in that it alows vectors as arguments, but not ints."
  (complement (s/checker FieldReference)))

(defn- update-entity-reference-id
  [[op id] context ]
  (let [op (qp.util/normalize-token op)]
    [op (if (= op :metric)
          ((:metrics context) id id)
          ((:segmentes context) id id))]))

(defn- humanized-field-references->ids
  [entity context]
  (walk/postwalk (fn [form]
                   (cond
                     (field-reference? form)  (fully-qualified-name->field-reference form)
                     (entity-reference? form) (update-entity-reference-id form context)
                     :else                    form))
                 entity))

(defmulti
  ^{:doc      ""
    :private  true
    :arglists '([context dir model])}
  load (fn [_ _ model]
         model))

(defmethod load Database
  [context path _]
  (reduce (fn [context path]
            (-> context
                (update :databases merge (slurp-dir (partial db/insert! Database) path))
                (load path Table)))
          context
          (list-dirs (str path "/databases"))))

(defmethod load Table
  [context path _]
  (reduce (fn [context path]
            (-> context
                (update :tables merge (slurp-dir (fn [table]
                                                   (db/insert! Table
                                                     (update table :db_id (:databases context))))
                                                 path))
                (load path Field)
                (load path Metric)
                (load path Segment)
                (load path Card)))
          context
          (list-dirs (str path "/tables"))))

(defmethod load Field
  [context path _]
  (assoc context
    :fields (slurp-dir (fn [field]
                         (db/insert! Field
                           (update field :table_id (:tables context))))
                       (str path "/fields"))))

(defmethod load Metric
  [context path _]
  (assoc context
    :metrics (slurp-dir (fn [metric]
                          (db/insert! Metric
                            (-> metric
                                (update :table_id (:tables context))
                                (update :creator_id (:users context))
                                (update-in [:definition :source-table] (:tables context))
                                (humanized-field-references->ids context))))
                        (str path "/metrics"))))

(defmethod load Segment
  [context path _]
  (assoc context
    :segments (slurp-dir (fn [segment]
                           (db/insert! Segment
                             (-> segment
                                 (update :table_id (:tables context))
                                 (update :creator_id (:users context))
                                 (update-in [:definition :source-table] (:tables context))
                                 (humanized-field-references->ids context))))
                         (str path "/segments"))))

(defmethod load User
  [context path _]
  (assoc context
    :users (slurp-dir (fn [user]
                        (or (db/select-one User :email (:email user))
                            (db/insert! User user)))
                      (str path "/users"))))

(defmethod load Dashboard
  [context path _]
  (reduce (fn [context path]
            (-> context
                (update :dashboards merge
                        (slurp-dir (fn [dashbboard]
                                     (db/insert! Dashboard
                                       (-> dashbboard
                                           (update :collection_id (:collections context))
                                           (update :creator_id (:users context))
                                           (humanized-field-references->ids context))))
                                   path))
                (load path DashboardCard)))
          context
          (list-dirs (str path "/dashboards"))))

(defn- update-source-table
  [source-table context]
  ((:tables context) (if (and (string? source-table)
                              (str/starts-with? source-table "card__"))
                       (-> source-table
                           (str/split #"__")
                           second
                           Integer/parseInt)
                       source-table)))

(defmethod load Card
  [context path _]
  (reduce
   (fn [context path]
     (-> context
         (update :cards merge
                 (slurp-dir
                  (fn [card]
                    (db/insert! Card
                      (-> card
                          (update :table_id (:tables context))
                          (update :creator_id (:users context))
                          (update :collection_id (:collections context))
                          (update :database_id (:databases context))
                          (update-in [:dataset_query :database] (:databases context))
                          (cond->
                              (-> card :dataset_query :type qp.util/normalize-token (= :query))
                            (update-in [:dataset_query :query :source-table]
                                       update-source-table context))
                          (humanized-field-references->ids context))))
                  path))
         (load path Card)))
   context
   (list-dirs (str path "/cards"))))


(defn- update-parameter-mappings
  [parameter-mappings context]
  (map #(update % :card_id (:cards context)) parameter-mappings))

(defmethod load DashboardCard
  [context path _]
  (reduce (fn [context path]
            (-> context
                (update :dashboard-cards merge
                        (slurp-dir
                         (fn [dashboard-card]
                           (db/insert! DashboardCard
                             (-> dashboard-card
                                 (update :card_id (:cards context))
                                 (update :dashboard_id (:dashboards context))
                                 (update :parameter_mappings update-parameter-mappings context)
                                 (humanized-field-references->ids context))))
                         path))
                (load path DashboardCardSeries)))
          context
          (list-dirs (str path "/dashboard-cards"))))

(defmethod load DashboardCardSeries
  [context path _]
  (assoc context
    :dashboard-card-series (slurp-dir (fn [dashboard-card-series]
                                        (db/insert! DashboardCardSeries
                                          (-> dashboard-card-series
                                              (update :dashboardcard_id (:dashboard-cards context))
                                              (update :card_id (:cards context)))))
                                      (str path "/dashboard-card-series"))))

(defmethod load Collection
  [context path _]
  (reduce (fn [context path]
            (-> context
                (update :collections merge
                        (slurp-dir
                         (fn [collection]
                           (or (db/select-one Collection
                                 :location          "/"
                                 :personal_owner_id (:personal_owner_id collection))
                               (db/insert! Collection
                                 (update collection :personal_owner_id (:users context)))))
                         path))
                (load path Collection)))
          context
          (list-dirs (str path "/collections"))))

(defn -main
  [& [path & _]]
  (mdb/setup-db-if-needed!)
  (-> {}
      (load path User)
      (load path Collection)
      (load path Database)
      (load path Dashboard)))
