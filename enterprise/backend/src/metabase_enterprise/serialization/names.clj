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
            [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.segment :refer [Segment]]
            [metabase.models.table :refer [Table]]
            [metabase.models.user :refer [User]]
            [metabase.util.i18n :as i18n :refer [trs]]
            [metabase.util.schema :as su]
            [ring.util.codec :as codec]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private root-collection-path "/collections/root")

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

(defn- local-collection-name [collection]
  (let [ns-part (if-let [coll-ns (:namespace collection)]
                  (str ":" (if (keyword? coll-ns) (name coll-ns) coll-ns) "/"))]
    (str "/collections/" ns-part (safe-name collection))))

(defmethod fully-qualified-name* (type Collection)
  [collection]
  (let [parents (some->> (str/split (:location collection) #"/")
                         rest
                         not-empty
                         (map #(-> % Integer/parseInt Collection local-collection-name))
                         (apply str))]
    (str root-collection-path parents (local-collection-name collection))))

(defmethod fully-qualified-name* (type Dashboard)
  [dashboard]
  (format "%s/dashboards/%s"
          (or (some->> dashboard :collection_id (fully-qualified-name Collection))
              root-collection-path)
          (safe-name dashboard)))

(defmethod fully-qualified-name* (type Pulse)
  [pulse]
  (format "%s/pulses/%s"
          (or (some->> pulse :collection_id (fully-qualified-name Collection))
              root-collection-path)
          (safe-name pulse)))

(defmethod fully-qualified-name* (type Card)
  [card]
  (format "%s/cards/%s"
          (or (some->> card
                       :collection_id
                       (fully-qualified-name Collection))
              root-collection-path)
          (safe-name card)))

(defmethod fully-qualified-name* (type User)
  [user]
  (str "/users/" (:email user)))

(defmethod fully-qualified-name* (type NativeQuerySnippet)
  [snippet]
  (format "%s/snippets/%s"
          (or (some->> snippet :collection_id (fully-qualified-name Collection))
              root-collection-path)
          (safe-name snippet)))

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
   (s/optional-key :user)       su/IntGreaterThanZero
   (s/optional-key :snippet)    (s/maybe su/IntGreaterThanZero)})

(defmulti ^:private path->context* (fn [_ model _ _]
                                     model))

(def ^:private ^{:arglists '([context model model-attrs entity-name])} path->context
  "Extract entities from a logical path."
  ;(memoize path->context*)
   path->context*)


(defmethod path->context* "databases"
  [context _ _ db-name]
  (assoc context :database (if (= db-name "__virtual")
                             mbql.s/saved-questions-virtual-database-id
                             (db/select-one-id Database :name db-name))))

(defmethod path->context* "schemas"
  [context _ _ schema]
  (assoc context :schema schema))

(defmethod path->context* "tables"
  [context _ _ table-name]
  (assoc context :table (db/select-one-id Table
                          :db_id  (:database context)
                          :schema (:schema context)
                          :name   table-name)))

(defmethod path->context* "fields"
  [context _ _ field-name]
  (assoc context :field (db/select-one-id Field
                          :table_id (:table context)
                          :name     field-name)))

(defmethod path->context* "fks"
  [context _ _ field-name]
  (path->context* context "fields" nil field-name))

(defmethod path->context* "metrics"
  [context _ _ metric-name]
  (assoc context :metric (db/select-one-id Metric
                           :table_id (:table context)
                           :name     metric-name)))

(defmethod path->context* "segments"
  [context _ _ segment-name]
  (assoc context :segment (db/select-one-id Segment
                            :table_id (:table context)
                            :name     segment-name)))

(defmethod path->context* "collections"
  [context _ model-attrs collection-name]
  (if (= collection-name "root")
    (assoc context :collection nil)
    (assoc context :collection (db/select-one-id Collection
                                 :name      collection-name
                                 :namespace (:namespace model-attrs)
                                 :location  (or (some-> context
                                                        :collection
                                                        Collection
                                                        :location
                                                        (str (:collection context) "/"))
                                                "/")))))

(defmethod path->context* "dashboards"
  [context _ _ dashboard-name]
  (assoc context :dashboard (db/select-one-id Dashboard
                              :collection_id (:collection context)
                              :name          dashboard-name)))

(defmethod path->context* "pulses"
  [context _ _ pulse-name]
  (assoc context :dashboard (db/select-one-id Pulse
                              :collection_id (:collection context)
                              :name          pulse-name)))

(defmethod path->context* "cards"
  [context _ _ dashboard-name]
  (assoc context :card (db/select-one-id Card
                         :collection_id (:collection context)
                         :name          dashboard-name)))

(defmethod path->context* "users"
  [context _ _ email]
  (assoc context :user (db/select-one-id User
                         :email email)))

(defmethod path->context* "snippets"
  [context _ _ snippet-name]
  (assoc context :snippet (db/select-one-id NativeQuerySnippet
                                            :collection_id (:collection context)
                                            :name          snippet-name)))

(def ^:private separator-pattern #"\/")

(def ^:dynamic *suppress-log-name-lookup-exception*
  "Dynamic boolean var that controls whether warning messages will NOT be logged on a failed name lookup (from within
  `fully-qualified-name->context`). Intended to be bound differently in first pass (i.e. set to true), where we expect
  some name lookups to fail, in order to avoid polluting the log. On subsequent rounds (i.e. reload fns) then it should
  be left off because we wouldn't expect to have failed lookups then."
  false)

(defn fully-qualified-field-name?
  "Returns true if the given `field-name` is a fully-qualified field name for serialization purposes (as opposed to a
  reference to an in-query alias or some other form)."
  [field-name]
  (and (some? field-name)
       (str/starts-with? field-name "/databases/")
       (or (str/includes? field-name "/fks/") (str/includes? field-name "/fields/"))))

(defn fully-qualified-table-name?
  "Returns true if the given `table-name` is a fully-qualified table name for serialization purposes (as opposed to a
  reference to a card)."
  [table-name]
  (and (some? table-name)
       (string? table-name)
       (str/starts-with? table-name "/databases/")
       (not (str/starts-with? table-name "card__"))))

(defn fully-qualified-card-name?
  "Returns true if the given `card-name` is a fully-qualified card name for serialization purposes."
  [card-name]
  (and (some? card-name)
       (string? card-name)
       (str/starts-with? card-name "/collections/root/")
       (str/includes? card-name "/cards/")))

;; WARNING: THIS MUST APPEAR AFTER ALL path->context* IMPLEMENTATIONS
(def ^:private all-entities (-> path->context*
                                methods
                                keys
                                set))

(defn- partition-name-components
  "This is more complicated than it needs to be due to potential clashes between an entity name (ex: a table called
  \"users\" and a model name (ex: \"users\"). Could fix in a number of ways, including special prefix of model names,
  but that would require changing the format and updating all the `defmethod` calls."
  ([name-comps]
   (partition-name-components {::name-components [] ::current-component []} name-comps))
  ([acc [c & more-comps]]
   (cond
     (nil? more-comps)
     (conj (::name-components acc) (conj (::current-component acc) c))

     (::prev-model-name? acc)
     (if (= \: (first c))
       (partition-name-components (update acc ::current-component conj c) more-comps)
       (partition-name-components (-> (assoc acc ::prev-model-name? false)
                                      (update ::current-component
                                              conj
                                              c))
                                  more-comps))

     (contains? all-entities c)
     (partition-name-components (cond-> (assoc acc ::prev-model-name? true
                                                   ::current-component [c])
                                  (not-empty (::current-component acc))
                                  (update ::name-components conj (::current-component acc)))
                                more-comps))))

(defn fully-qualified-name->context
  "Parse a logical path into a context map."
  [fully-qualified-name]
  (when fully-qualified-name
    (let [components (->> (str/split fully-qualified-name separator-pattern)
                          rest ; we start with a /
                          partition-name-components
                          (map (fn [[model-name & entity-parts]]
                                 (cond-> {::model-name model-name ::entity-name (last entity-parts)}
                                         (and (= "collections" model-name) (> (count entity-parts) 1))
                                         (assoc :namespace (->> entity-parts
                                                                       first ; ns is first/only item after "collections"
                                                                       rest  ; strip the starting :
                                                                       (apply str)))))))
          context (loop [acc-context                   {}
                         [{:keys [::model-name ::entity-name] :as model-map} & more] components]
                    (let [model-attrs (dissoc model-map ::model-name ::entity-name)
                          new-context (path->context acc-context model-name model-attrs (unescape-name entity-name))]
                      (if (empty? more)
                        new-context
                        (recur new-context more))))]
      (try
        (s/validate (s/maybe Context) context)
        (catch Exception e
          (when-not *suppress-log-name-lookup-exception*
            (log/warn
             (ex-info (trs "Can''t resolve {0} in fully qualified name {1}"
                           (str/join ", " (map name (keys (:value (ex-data e)))))
                           fully-qualified-name)
                      {:fully-qualified-name fully-qualified-name
                       :resolve-name-failed? true
                       :context              context}
                      e))))))))

(defn name-for-logging
  "Return a string representation of entity suitable for logs"
  ([entity] (name-for-logging (name entity) entity))
  ([model {:keys [name id]}]
   (cond
     (and name id) (format "%s \"%s\" (ID %s)" model name id)
     name          (format "%s \"%s\"" model name)
     id            (format "%s %s" model id)
     :else         model)))
