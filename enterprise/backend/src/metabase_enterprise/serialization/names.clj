(ns metabase-enterprise.serialization.names
  "Consistent instance-independent naming scheme that replaces IDs with human-readable paths."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.database :as database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.segment :refer [Segment]]
            [metabase.models.table :refer [Table]]
            [metabase.models.user :refer [User]]
            [metabase.query-processor.util :as qp.util]
            [metabase.util.i18n :as i18n :refer [trs]]
            [metabase.util.schema :as su]
            [ring.util.codec :as codec]
            [schema.core :as s]
            [toucan.db :as db]))

(defn safe-name
  "Return entity name URL encoded except that spaces are retained."
  [entity]
  (some-> entity ((some-fn :email :name)) codec/url-encode (str/replace "%20" " ")))

(def unescape-name
  "Inverse of `safe-name`."
  codec/url-decode)

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
  (if (:fk_target_field_id field)
    (str (->> field :table_id (fully-qualified-name Table)) "/fks/" (safe-name field))
    (str (->> field :table_id (fully-qualified-name Table)) "/fields/" (safe-name field))))

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

;; All the references in the dumps should resolved to entities already loaded.
(def ^:private Context
  {(s/optional-key :database)   su/IntGreaterThanZero
   (s/optional-key :table)      su/IntGreaterThanZero
   (s/optional-key :schema)     (s/maybe s/Str)
   (s/optional-key :field)      su/IntGreaterThanZero
   (s/optional-key :metric)     su/IntGreaterThanZero
   (s/optional-key :segment)    su/IntGreaterThanZero
   (s/optional-key :card)       su/IntGreaterThanZero
   (s/optional-key :dashboard)  su/IntGreaterThanZero
   (s/optional-key :collection) (s/maybe su/IntGreaterThanZero) ; root collection
   (s/optional-key :pulse)      su/IntGreaterThanZero
   (s/optional-key :user)       su/IntGreaterThanZero})

(defmulti ^:private path->context* (fn [_ model _]
                                     model))

(def ^:private ^{:arglists '([context model entity-name])} path->context
  "Extract entities from a logical path."
  ;(memoize path->context*)
   path->context*)


(defmethod path->context* "databases"
  [context _ db-name]
  (assoc context :database (if (= db-name "__virtual")
                             mbql.s/saved-questions-virtual-database-id
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

(defmethod path->context* "fks"
  [context _ field-name]
  (path->context* context "fields" field-name))

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

(def ^:private separator-pattern #"\/")

(defn fully-qualified-name->context
  "Parse a logical path into a context map."
  [fully-qualified-name]
  (when fully-qualified-name
    (let [context (->> (str/split fully-qualified-name separator-pattern)
                       rest ; we start with a /
                       (partition 2)
                       (reduce (fn [context [model entity-name]]
                                 (path->context context model (unescape-name entity-name)))
                               {}))]
      (try
        (s/validate (s/maybe Context) context)
        (catch Exception e
          (log/warn
           (ex-info (trs "Can''t resolve {0} in fully qualified name {1}"
                         (str/join ", " (map name (keys (:value (ex-data e)))))
                         fully-qualified-name)
                    {:fully-qualified-name fully-qualified-name
                     :resolve-name-failed? true
                     :context              context})))))))

(defn name-for-logging
  "Return a string representation of entity suitable for logs"
  ([entity] (name-for-logging (name entity) entity))
  ([model {:keys [name id]}]
   (cond
     (and name id) (format "%s \"%s\" (ID %s)" model name id)
     name          (format "%s \"%s\"" model name)
     id            (format "%s %s" model id)
     :else         model)))
