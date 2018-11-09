(ns metabase.serialization.dump
  ""
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.walk :as walk]
            [metabase.automagic-dashboards.filters :refer [field-reference?]]
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
            [toucan.db :as db]
            [yaml.core :as yaml]))

;; We replace the IDs in MBQL with full paths to make diffs more meaningful

(defmulti
  ^{:doc      ""
    :private  true
    :arglists '([entity])}
  fully-qualified-name type)

(defmethod fully-qualified-name (type Database)
  [db]
  [(:name db)])

(defmethod fully-qualified-name (type Table)
  [table]
  (concat (-> table :db_id Database fully-qualified-name) [(:schema table) (:name table)]))

(defmethod fully-qualified-name (type Field)
  [field]
  (concat (-> field :table_id Table fully-qualified-name) [(:name field)]))

(defn- field-reference->fully-qualified-name
  [field-reference]
  (cond
    (number? field-reference)
    (fully-qualified-name (Field field-reference))

    (-> field-reference first qp.util/normalize-token (= :field-literal))
    field-reference

    :else
    (let [[op & args] field-reference]
      (into [op] (map field-reference->fully-qualified-name args)))))

(defn- humanize-field-references
  [entity]
  (walk/postwalk (fn [form]
                   (if (field-reference? form)
                     (field-reference->fully-qualified-name form)
                     form))
                 entity))

(defmulti
  ^{:doc      ""
    :private  true
    :arglists '([dir entity])}
  dump (fn [_ entity]
         (type entity)))

(defn- spit-yaml
  [path entity]
  (let [fname (if-let [entity-name ((some-fn :name :email) entity)]
                (format "%s/%s_%s.yaml" path (:id entity) entity-name)
                (format "%s/%s.yaml" path (:id entity)))]
    (io/make-parents fname)
    (spit fname (yaml/generate-string entity :dumper-options {:flow-style :block}))))

(defn- dump-all
  [path entities]
  (doseq [e entities]
    (dump path e)))

(defmethod dump (type Database)
  [path db]
  (let [path   (format "%s/databases/%s_%s" path (:id db) (:name db))]
    (spit-yaml path (dissoc db :features))
    (dump-all path (db/select Table :db_id (u/get-id db)))))

(defmethod dump (type Table)
  [path {:keys [id] :as table}]
  (let [path (format "%s/tables/%s_%s" path (:id table) (:name table))]
    (spit-yaml path table)
    (dump-all path (db/select Field :table_id id))
    (dump-all path (db/select Metric :table_id id))
    (dump-all path (db/select Segment :table_id id))))

(defmethod dump (type Field)
  [path field]
  (spit-yaml (str path "/fields") field))

(defmethod dump (type Segment)
  [path segment]
  (->> segment
       humanize-field-references
       (spit-yaml (str path "/segments"))))

(defmethod dump (type Metric)
  [path metric]
  (->> metric
       humanize-field-references
       (spit-yaml (str path "/metrics"))))

(defmethod dump (type User)
  [path user]
  (spit-yaml (str path "/users") (-> user
                                     (dissoc :common_name)
                                     (assoc :password "dummy"))))

(defmethod dump (type Dashboard)
  [path dashboard]
  (spit-yaml (str path "/dashboards")
             (assoc dashboard
               :dashboard_cards (->> dashboard
                                     u/get-id
                                     (db/select DashboardCard :dashboard_id)
                                     (map (fn [dashboard-card]
                                            (-> dashboard-card
                                                (assoc :series (db/select DashboardCardSeries
                                                                 :dashboardcard_id (:id dashboard-card)))
                                                humanize-field-references)))))))

(defn- collection-location->dir
  [location]
  (if (= location "/")
    ""
    (->> (str/split location #"/")
         rest
         (map (fn [parent]
                (let [parent (Collection (Integer/parseInt parent))]
                  (format "%s_%s/collections" (:id parent) (:name parent)))))
         (str/join "/")
         (format "/%s/"))))

(defmethod dump (type Collection)
  [path collection]
  (let [path (format "%s/collections/%s/%s_%s"
                     path
                     (-> collection :location collection-location->dir)
                     (:id collection)
                     (:name collection))]
    (spit-yaml path collection)
    (dump-all path (db/select Card :collection_id (u/get-id collection)))
    (dump-all path (db/select Dashboard :collection_id (u/get-id collection)))))

(defmethod dump (type Card)
  [path card]
  (let [path (if-let [parent (-> card :dataset_query qp.util/query->source-card-id Card)]
               (format "%s/cards/%s_%s" path (:id parent) (:name parent))
               path)]
    (->> card
         humanize-field-references
         (spit-yaml (format "%s/cards/%s_%s" path (:id card) (:name card))))))

(defn -main
  [& [path & _]]
  (mdb/setup-db-if-needed!)
  (dump-all path (Database))
  (dump-all path (User))
  (dump-all path (Collection)))

(-main "dump")
