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
  ;; TODO -- ensure names are unique (or id)
  (let [fname (str path "/" (:id entity) "_" ((some-fn :name :email :id) entity) ".yaml")]
    (io/make-parents fname)
    (spit fname (yaml/generate-string entity :dumper-options {:flow-style :block}))))

(defn- dump-all
  [path entities]
  (doseq [e entities]
    (dump path e)))

(defmethod dump (type Database)
  [path db]
  (let [path (format "%s/databases/%s" path (:name db))]
    (spit-yaml path (dissoc db :features))
    (dump-all path (db/select Table :db_id (u/get-id db)))))

(defmethod dump (type Table)
  [path {:keys [id] :as table}]
  (let [path (format "%s/tables/%s" path (:name table))]
    (spit-yaml path table)
    (dump-all path (db/select Field :table_id id))
    (dump-all path (db/select Metric :table_id id))
    (dump-all path (db/select Segment :table_id id))
    (dump-all path (db/select Card :table_id id))))

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
  (spit-yaml (str path "/users") user))

(defmethod dump (type Dashboard)
  [path dashboard]
  (let [path (format "%s/dashboards/%s" path (:name dashboard))]
    (spit-yaml path dashboard)
    (dump-all path (db/select DashboardCard :dashboard_id (u/get-id dashboard)))))

(defmethod dump (type Collection)
  [path collection]
  (spit-yaml (str path "/collections") collection))

(defmethod dump (type Card)
  [path card]
  (let [source-table (get-in card [:dataset_query :query :source-table])
        path         (if (and (string? source-table)
                              (str/starts-with? source-table "card__"))
                       (str path "/cards/" (-> source-table
                                               (str/split #"__")
                                               second
                                               Integer/parseInt
                                               Card
                                               :name))
                       path)]
    (->> card
         humanize-field-references
         (spit-yaml (str path "/cards/" (:name card))))))

(defmethod dump (type DashboardCard)
  [path dashboard-card]
  (->> dashboard-card
       humanize-field-references
       (spit-yaml (str path "/dashboard-cards"))))

(defn -main
  [& [path & _]]
  (mdb/setup-db-if-needed!)
  (dump-all path (Database))
  (dump-all path (User))
  (dump-all path (Dashboard))
  (dump-all path (Collection)))

(-main "dump")
;; (first (metabase.models.field-values/FieldValues))

;; (first (metabase.models.permissions-group-membership/PermissionsGroupMembership))

;; * PermissionsGroup
;; ** Permission
;; * PermissionsGroupMembership
