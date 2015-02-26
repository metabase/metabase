(ns metabase.test-data
  (:require [metabase.db :refer [sel *log-db-calls* migrate]]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test-data.load :as load]))

(declare tables
         table-fields)

;; # PUBLIC FUNCTIONS / VARS

(defn field->id [table-name field-name]
  {:pre [(keyword? table-name)
         (keyword? field-name)]
   :post [(integer? %)
          (not (zero? %))]}
  (-> @table-fields table-name field-name))

(defn table->id [table-name]
  {:pre [(keyword? table-name)]
   :post [(integer? %)
          (not (zero? %))]}
  (@tables table-name))

(def ^{:doc "The test `Database` object."} test-db
  (delay (migrate :up)
         (load/test-db)))

(def ^{:doc "The ID of the test `Database`."} db-id
  (delay (assert @test-db)
         (:id @test-db)))


;; # INTERNAL

(defn- map-table-kws
  "Return a map create by mapping the keyword names of Tables in test DB (e.g. `:users`) against F, e.g.

    {:users (f :users)
     :venues (f :venues)
     ...}"
  [f]
  (->> [:users :venues :checkins :categories]
       (map (fn [table-kw]
              {table-kw (f table-kw)}))
       (reduce merge {})))

(def
  ^{:doc "A map of Table name keywords -> Table IDs.

              {:users 100
               :venues 101
               ...}"
    :private true}
  tables
  (delay
   (binding [*log-db-calls* false]
     (letfn [(table-kw->table-id [table-kw]
               (->> (-> table-kw name .toUpperCase)
                    (sel :one [Table :id] :db_id @db-id :name)
                    :id))]
       (map-table-kws table-kw->table-id)))))

(def
  ^{:doc "A map of Table name keywords -> map of Field name keywords -> Field IDs.

              {:users {:id 14
                       :name 15}
               :venues ...}"
    :private true}
  table-fields
  (delay
   (binding [*log-db-calls* false]
     (letfn [(table-kw->fields [table-kw]
               (->> (sel :many [Field :name :id] :table_id (@tables table-kw))
                    (map (fn [{:keys [^String name id]}]
                           {:pre [(string? name)
                                  (integer? id)
                                  (not (zero? id))]}
                           {(keyword (.toLowerCase name)) id}))
                    (reduce merge {})))]
       (map-table-kws table-kw->fields)))))
