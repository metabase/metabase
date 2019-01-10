(ns metabase.serialization.names
  "Consistent instance-independent naming scheme that replaces IDs with human-readable paths."
  (:require [clojure.string :as str]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [database :refer [Database] :as database]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.query-processor.util :as qp.util]
            [toucan.db :as db]))

(defn safe-name
  "Return entity name with forward slashes replaced by unicode char `FRACTION SLASH`."
  [entity]
  (-> entity ((some-fn :email :name)) (str/escape {\/ "⁄"})))

(defn unescape-name
  "Inverse of `safe-name`. Replaces `FRACTION SLASH` back to forward slash."
  [entity-name]
  (str/replace entity-name \⁄ \/))

(defmulti ^:private fully-qualified-name* type)

(def ^{:arglists '([entity] [model id])} fully-qualified-name
  "Get the logical path for entity `entity`."
  (memoize (fn
             ([entity] (fully-qualified-name* entity))
             ([model id]
              (if (string? id)
                id
                (fully-qualified-name* (db/select-one model :id id)))))))

(defmethod fully-qualified-name* (type Database)
  [db]
  (str "/databases/" (safe-name db)))

(defmethod fully-qualified-name* (type Table)
  [table]
  (if (:schema table)
    (format "%s/schemas/%s/tables/%s"
            (->> table :db_id (fully-qualified-name Database))
            (:schema table)
            (safe-name table))
    (format "%s/tables/%s"
            (->> table :db_id (fully-qualified-name Database))
            (safe-name table))))

(defmethod fully-qualified-name* (type Field)
  [field]
  (str (->> field :table_id (fully-qualified-name Table)) "/fields/" (safe-name field)))

(defmethod fully-qualified-name* (type Metric)
  [metric]
  (str (->> metric :table_id (fully-qualified-name Table)) "/metrics/" (safe-name metric)))

(defmethod fully-qualified-name* (type Segment)
  [segment]
  (str (->> segment :table_id (fully-qualified-name Table)) "/segments/" (safe-name segment)))

(defmethod fully-qualified-name* (type Collection)
  [collection]
  (let [parents (some->> (str/split (:location collection) #"/")
                         rest
                         not-empty
                         (map #(-> % Integer/parseInt Collection safe-name (str "/collections")))
                         (str/join "/")
                         (format "%s/"))]
    (str "/collections/root/collections/" parents (safe-name collection))))

(defmethod fully-qualified-name* (type Dashboard)
  [dashboard]
  (format "%s/dashboards/%s"
          (or (some->> dashboard :collection_id (fully-qualified-name Collection))
              "/collections/root")
          (safe-name dashboard)))

(defmethod fully-qualified-name* (type Pulse)
  [pulse]
  (format "%s/pulses/%s"
          (or (some->> pulse :collection_id (fully-qualified-name Collection))
              "/collections/root")
          (safe-name pulse)))

(defmethod fully-qualified-name* (type Card)
  [card]
  (format "%s/cards/%s"
          (or (some->> card
                       :dataset_query
                       qp.util/query->source-card-id
                       (fully-qualified-name Card))
              (some->> card
                       :collection_id
                       (fully-qualified-name Collection))
              "/collections/root")
          (safe-name card)))

(defmethod fully-qualified-name* (type User)
  [user]
  (str "/users/" (:email user)))

(defmethod fully-qualified-name* nil
  [_]
  nil)

(defmulti ^:private path->context* (fn [_ model _]
                                     model))

(def ^:private ^{:arglists '([context model entity-name])} path->context
  "Extract entities from a logical path."
  (memoize path->context*))

(defmethod path->context* "databases"
  [context _ db-name]
  (assoc context :database (if (= db-name "__virtual")
                             database/virtual-id
                             (db/select-one-id Database :name db-name))))

(defmethod path->context* "schemas"
  [context _ schema]
  (assoc context :schema schema))

(defmethod path->context* "tables"
  [context _ table-name]
  (assoc context :table (db/select-one-id Table
                          :db_id  (:database context)
                          :schema (:schema context)
                          :name   table-name)))

(defmethod path->context* "fields"
  [context _ field-name]
  (assoc context :field (db/select-one-id Field
                          :table_id (:table context)
                          :name     field-name)))

(defmethod path->context* "metrics"
  [context _ metric-name]
  (assoc context :metric (db/select-one-id Metric
                           :table_id (:table context)
                           :name     metric-name)))

(defmethod path->context* "segments"
  [context _ segment-name]
  (assoc context :segment (db/select-one-id Segment
                            :table_id (:table context)
                            :name     segment-name)))

(defmethod path->context* "collections"
  [context _ collection-name]
  (if (= collection-name "root")
    (assoc context :collection nil)
    (assoc context :collection (db/select-one-id Collection
                                 :name     collection-name
                                 :location (or (some-> context
                                                       :collection
                                                       Collection
                                                       :location
                                                       (str (:collection context) "/"))
                                               "/")))))

(defmethod path->context* "dashboards"
  [context _ dashboard-name]
  (assoc context :dashboard (db/select-one-id Dashboard
                              :collection_id (:collection context)
                              :name          dashboard-name)))

(defmethod path->context* "pulses"
  [context _ pulse-name]
  (assoc context :dashboard (db/select-one-id Pulse
                              :collection_id (:collection context)
                              :name          pulse-name)))

(defmethod path->context* "cards"
  [context _ dashboard-name]
  (assoc context :card (db/select-one-id Card
                         :collection_id (:collection context)
                         :name          dashboard-name)))

(defmethod path->context* "users"
  [context _ email]
  (assoc context :user (db/select-one-id User
                         :email email)))

(defn fully-qualified-name->context
  "Parse a logcial path into a context map."
  [fully-qualified-name]
  (when fully-qualified-name
    (->> (str/split fully-qualified-name #"/")
         rest ; we start with a /
         (partition 2)
         (reduce (fn [context [model entity-name]]
                   (path->context context model (unescape-name entity-name)))
                 {}))))
