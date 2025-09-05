(ns metabase-enterprise.transforms.util
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn qualified-table-name
  "Return the name of the target table of a transform as a possibly qualified symbol."
  [_driver {:keys [schema name]}]
  (if schema
    (keyword schema name)
    (keyword name)))

(defn query-transform?
  "Check if this is a query transform: native query / mbql query."
  [transform]
  (= :query (-> transform :source :type keyword)))

(defn python-transform?
  "Check if this is a Python transform."
  [transform]
  (= :python (-> transform :source :type keyword)))

(defn target-table-exists?
  "Test if the target table of a transform already exists."
  [{:keys [source target] :as transform}]
  (when (query-transform? transform)
    (let [db-id (-> source :query :database)
          {driver :engine :as database} (t2/select-one :model/Database db-id)]
      (driver/table-exists? driver database target))))

(defn target-table
  "Load the `target` table of a transform from the database specified by `database-id`."
  [database-id target & kv-args]
  (some-> (apply t2/select-one :model/Table
                 :db_id database-id
                 :schema (:schema target)
                 :name (:name target)
                 kv-args)
          (t2/hydrate :db)))

(defn- sync-table!
  ([database target] (sync-table! database target nil))
  ([database target {:keys [create?]}]
   (when-let [table (or (target-table (:id database) target)
                        (when create?
                          (sync/create-table! database (select-keys target [:schema :name]))))]
     (sync/sync-table! table)
     table)))

(defn activate-table-and-mark-computed!
  "Activate table for `target` in `database` in the app db."
  [database target]
  (when-let [table (sync-table! database target {:create? true})]
    (when (or (not (:active table)) (not (= (:data_authority table) :computed)))
      (t2/update! :model/Table (:id table) {:active true, :data_authority :computed}))))

(defn deactivate-table!
  "Deactivate table for `target` in `database` in the app db."
  [database target]
  (when-let [table (sync-table! database target)]
    ;; TODO this should probably be a function in the sync module
    (t2/update! :model/Table (:id table) {:active false})))

(defn delete-target-table!
  "Delete the target table of a transform and sync it from the app db."
  [{:keys [id target source], :as _transform}]
  (when target
    (let [target (update target :type keyword)
          database-id (or (-> source :query :database)
                          ;; python transform target
                          (-> target :database))
          {driver :engine :as database} (t2/select-one :model/Database database-id)]
      (driver/drop-transform-target! driver database target)
      (log/info "Deactivating  target " (pr-str target) "for transform" id)
      (deactivate-table! database target))))

(defn delete-target-table-by-id!
  "Delete the target table of the transform specified by `transform-id`."
  [transform-id]
  (delete-target-table! (t2/select-one :model/Transform transform-id)))

(defn massage-sql-query
  "Adjusts mbql query for use in a transform."
  [query]
  (assoc-in query [:middleware :disable-remaps?] true))

(defn compile-source
  "Compile the source query of a transform."
  [{query-type :type :as source}]
  (case query-type
    "query" (:query (qp.compile/compile-with-inline-parameters (massage-sql-query (:query source))))))

(defn required-database-feature
  "Returns the database feature necessary to execute `transform`."
  [transform]
  (case (-> transform :target :type)
    "table"             :transforms/table))

(mr/def ::column-definition
  [:map
   [:name :string]
   [:type ::lib.schema.common/base-type]
   [:nullable? {:optional true} :boolean]])

(mr/def ::table-definition
  [:map
   [:name :keyword]
   [:columns [:sequential ::column-definition]]
   [:primary-key {:optional true} [:sequential :string]]])

(defn dtype->base-type
  "Maps pandas dtype strings directly to Metabase base types in the type hierarchy."
  [dtype-str]
  (cond
    (str/starts-with? dtype-str "int") :type/Integer
    (str/starts-with? dtype-str "float") :type/Float
    (str/starts-with? dtype-str "bool") :type/Boolean
    ;; datetime64[ns, timezone] indicates timezone-aware datetime
    (str/starts-with? dtype-str "datetime64[ns, ") :type/DateTimeWithTZ
    (str/starts-with? dtype-str "datetime") :type/DateTime
    ;; this is not a real dtype, pandas uses 'object', but we override it if there's source or custom field metadata
    (str/starts-with? dtype-str "date") :type/Date
    :else :type/Text))

(mu/defn create-table-from-schema!
  "Create a table from a table-schema"
  [driver :- :keyword
   database-id :- pos-int?
   table-schema :- ::table-definition]
  (let [{:keys [columns] table-name :name} table-schema
        column-definitions (into {} (map (fn [{:keys [name type]}] [name (driver/type->database-type driver type)]))
                                 columns)
        primary-key-opts (select-keys table-schema [:primary-key])]
    (log/infof "Creating table %s with %d columns" table-name (count columns))
    (driver/create-table! driver database-id table-name column-definitions primary-key-opts)))
