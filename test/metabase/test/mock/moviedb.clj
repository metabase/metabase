(ns metabase.test.mock.moviedb
  "A simple relational schema based mocked for testing. 4 tables w/ some FKs."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

;; TODO - this whole fake driver is used in exactly one test. Can definitely remove a lot of the stuff here since it's
;; not used.
;; Tech debt issue: #39338

(def ^:private moviedb-tables
  {"movies"
   {:name   "movies"
    :schema nil
    :fields #{{:name      "id"
               :base-type :type/Integer}
              {:name      "title"
               :base-type :type/Text}
              {:name      "filming"
               :base-type :type/Boolean}}}

   "actors"
   {:name   "actors"
    :schema nil
    :fields #{{:name      "id"
               :base-type :type/Integer}
              {:name      "name"
               :base-type :type/Text}}}

   "roles"
   {:name   "roles"
    :schema nil
    :fields #{{:name      "id"
               :base-type :type/Integer}
              {:name      "movie_id"
               :base-type :type/Integer}
              {:name      "actor_id"
               :base-type :type/Integer}
              {:name      "character"
               :base-type :type/Text}
              {:name      "salary"
               :base-type :type/Decimal}}
    :fks    #{{:fk-column-name   "movie_id"
               :dest-table       {:name   "movies"
                                  :schema nil}
               :dest-column-name "id"}
              {:fk-column-name   "actor_id"
               :dest-table       {:name   "actors"
                                  :schema nil}
               :dest-column-name "id"}}}

   "reviews"
   {:name   "reviews"
    :schema nil
    :fields #{{:name      "id"
               :base-type :type/Integer}
              {:name      "movie_id"
               :base-type :type/Integer}
              {:name      "stars"
               :base-type :type/Integer}}
    :fks    #{{:fk-column-name   "movie_id"
               :dest-table       {:name   "movies"
                                  :schema nil}
               :dest-column-name "id"}}}

   "_metabase_metadata"
   {:name   "_metabase_metadata"
    :schema nil
    :fields #{{:name      "keypath"
               :base-type :type/Text}
              {:name      "value"
               :base-type :type/Text}}}})

(driver/register! ::moviedb, :abstract? true)

(defmethod driver/describe-database* ::moviedb [_ {:keys [exclude-tables]}]
  (let [tables (for [table (vals moviedb-tables)
                     :when (not (contains? exclude-tables (:name table)))]
                 (select-keys table [:schema :name]))]
    {:tables (set tables)}))

(defmethod driver/describe-table ::moviedb [_ _ table]
  (-> (get moviedb-tables (:name table))
      (dissoc :fks)
      (update :fields (partial map-indexed (fn [idx field]
                                             (assoc field :database-position idx))))))

(mu/defmethod driver/describe-fks ::moviedb :- ::driver/describe-fks.result
  [_driver                               :- :keyword
   _database                             :- ::lib.schema.metadata/database
   & {:keys [table-names], :as _options} :- ::driver/describe-fks.options]
  (for [[table-name table] moviedb-tables
        :when              (or (empty? table-names)
                               (contains? (set table-names) table-name))
        fk                 (:fks table)]
    {:fk-table-name   table-name
     :fk-table-schema nil
     :fk-column-name  (:fk-column-name fk)
     :pk-table-name   (get-in fk [:dest-table :name])
     :pk-table-schema (get-in fk [:dest-table :schema])
     :pk-column-name  (:dest-column-name fk)}))

(defmethod driver/table-rows-seq ::moviedb [_ _ table]
  (when (= (:name table) "_metabase_metadata")
    [{:keypath "movies.filming.description", :value "If the movie is currently being filmed."}
     {:keypath "movies.description", :value "A cinematic adventure."}
     {:keypath "description", :value "Information about movies"}]))

(defmethod driver/database-supports? [::moviedb :metadata/key-constraints] [_driver _feature _db] true)
