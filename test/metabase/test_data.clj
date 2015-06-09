(ns metabase.test-data
  "Functions relating to using the test data, Database, Organization, and Users."
  (:require [cemerick.friend.credentials :as creds]
            [korma.core :as k]
            [medley.core :as medley]
            (metabase [db :refer :all])
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]]
                             [user :refer [User]])
            [metabase.test.data :refer :all]
            (metabase.test.data [data :as data]
                                [h2 :as h2])))

(declare tables
         table-fields)


;; # PUBLIC FUNCTIONS / VARS

(def test-db
  "The test `Database` object."
  (delay (get-or-create-database! (h2/dataset-loader) data/test-data)))

(def db-id
  "The ID of the test `Database`."
  (delay (assert @test-db)
         (:id @test-db)))

(defn field->id
  "Return the ID of a Field with FIELD-NAME belonging to Table with TABLE-NAME.

    (field->id :checkins :venue_id) -> 4"
  [table-name field-name]
  {:pre [(keyword? table-name)
         (keyword? field-name)]
   :post [(integer? %)
          (not (zero? %))]}
  (-> @table-fields table-name field-name))

(defn table->id
  "Return the ID of a Table with TABLE-NAME.

    (table->id :venues) -> 12"
  [table-name]
  {:pre [(keyword? table-name)]
   :post [(integer? %)
          (not (zero? %))]}
  (@tables table-name))

(defn table-name->table
  "Fetch `Table` with TABLE-NAME."
  [table-name]
  {:pre [(keyword? table-name)]
   :post [(map? %)]}
  (sel :one Table :id (table->id table-name)))









;; ## Temporary Tables / Etc.

;; DEPRECATED ! Need to rewrite this to use the new TableDefinition stuff
;; (defmacro with-temp-table
;;   "Execute BODY with a temporary Table that will be dropped afterward.
;;    The korma entity representing the Table is bound to TABLE-BINDING.
;;    FIELDS-MAP should be a map of FIELD-NAME -> SQL-TYPE.

;;     (with-temp-table [table {:name \"VARCHAR(254)\"}]
;;       (insert table (values [{:name \"A\"}
;;                              {:name \"B\"}]))
;;       (select table values (where {:name \"A\"})))"
;;   [[table-binding fields-map] & body]
;;   {:pre [(map? fields-map)]}
;;   (let [table-name (name (gensym "TABLE__"))
;;         formatted-fields (->> fields-map
;;                               (map (fn [[field-name field-type]]
;;                                      (format "\"%s\" %s" (.toUpperCase ^String (name field-name)) (name field-type))))
;;                               (interpose ", ")
;;                               (reduce str))]
;;     `(do (get-or-create-database! (h2/dataset-loader) data/test-data)
;;          (h2/exec-sql data/test-data (format "DROP TABLE IF EXISTS \"%s\";" ~table-name))
;;          (h2/exec-sql data/test-data (format "CREATE TABLE \"%s\" (%s, \"ID\" BIGINT AUTO_INCREMENT, PRIMARY KEY (\"ID\"));" ~table-name ~formatted-fields))
;;          (let [~table-binding (h2/korma-entity (map->TableDefinition {:table-name ~table-name})
;;                                                data/test-data)]
;;            (try
;;              ~@body
;;              (catch Throwable e#
;;                (println "E: " e#))
;;              (finally
;;                (h2/exec-sql data/test-data (format "DROP TABLE \"%s\";" ~table-name))))))))


;; # INTERNAL

;; ## Tables + Fields

(defn- map-table-kws
  "Return a map create by mapping the keyword names of Tables in test DB (e.g. `:users`) against F, e.g.

    {:users (f :users)
     :venues (f :venues)
     ...}"
  [f]
  (->> [:users :venues :checkins :categories]
       (map (fn [table-kw]
              {table-kw (f table-kw)}))
       (into {})))

(def
  ^{:doc "A map of Table name keywords -> Table IDs.

              {:users 100
               :venues 101
               ...}"
    :private true}
  tables
  (delay
   @test-db                         ; force lazy evaluation of Test DB
   (map-table-kws (fn [table-kw]
                    (sel :one :id Table, :db_id @db-id, :name (-> table-kw name .toUpperCase))))))

(def
  ^{:doc "A map of Table name keywords -> map of Field name keywords -> Field IDs.

              {:users {:id 14
                       :name 15}
               :venues ...}"
    :private true}
  table-fields
  (delay
   @test-db ; force lazy evaluation of Test DB
   (map-table-kws (fn [table-kw]
                    (->> (sel :many [Field :name :id] :table_id (@tables table-kw))
                         (map (fn [{:keys [^String name id]}]
                                {:pre [(string? name)
                                       (integer? id)
                                       (not (zero? id))]}
                                {(keyword (.toLowerCase name)) id}))
                         (into {}))))))

;; ## Users
