(ns metabase.test.mock.moviedb
  "A simple relational schema based mocked for testing. 4 tables w/ some FKs."
  (:require [metabase.driver :as driver]
            [metabase.test.mock.util :refer [table-defaults field-defaults]]))


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


(defrecord ^:private MovieDbDriver []
  clojure.lang.Named
  (getName [_] "MovieDbDriver"))


(defn- describe-database [_ {:keys [exclude-tables]}]
  (let [tables (for [table (vals moviedb-tables)
                     :when (not (contains? exclude-tables (:name table)))]
                 (select-keys table [:schema :name]))]
    {:tables (set tables)}))

(defn- describe-table [_ _ table]
  (-> (get moviedb-tables (:name table))
      (dissoc :fks)))

(defn- describe-table-fks [_ _ table]
  (-> (get moviedb-tables (:name table))
      :fks
      set))

(defn- table-rows-seq [_ _ table]
  (when (= (:name table) "_metabase_metadata")
    [{:keypath "movies.filming.description", :value "If the movie is currently being filmed."}
     {:keypath "movies.description", :value "A cinematic adventure."}]))


(extend MovieDbDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:describe-database  describe-database
          :describe-table     describe-table
          :describe-table-fks describe-table-fks
          :features           (constantly #{:foreign-keys})
          :details-fields     (constantly [])
          :table-rows-seq     table-rows-seq}))

(driver/register-driver! :moviedb (MovieDbDriver.))

(def moviedb-tables-and-fields
  [(merge table-defaults
          {:name         "actors"
           :fields       [(merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text})]

           :display_name "Actors"})
   (merge table-defaults
          {:name         "movies"
           :fields       [(merge field-defaults
                                 {:name         "filming"
                                  :display_name "Filming"
                                  :base_type    :type/Boolean})
                          (merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:name         "title"
                                  :display_name "Title"
                                  :base_type    :type/Text})]

           :display_name "Movies"})
   (merge table-defaults
          {:name         "reviews"
           :fields       [(merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type       :type/FK
                                  :fk_target_field_id true
                                  :name               "movie_id"
                                  :display_name       "Movie ID"
                                  :base_type          :type/Integer})
                          (merge field-defaults
                                 {:name         "stars"
                                  :display_name "Stars"
                                  :base_type    :type/Integer})]
           :display_name "Reviews"})
   (merge table-defaults
          {:name         "roles"
           :fields       [(merge field-defaults
                                 {:special_type       :type/FK
                                  :fk_target_field_id true
                                  :name               "actor_id"
                                  :display_name       "Actor ID"
                                  :base_type          :type/Integer})
                          (merge field-defaults
                                 {:name         "character"
                                  :display_name "Character"
                                  :base_type    :type/Text})
                          (merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type       :type/FK
                                  :fk_target_field_id true
                                  :name               "movie_id"
                                  :display_name       "Movie ID"
                                  :base_type          :type/Integer})
                          (merge field-defaults
                                 {:name         "salary"
                                  :display_name "Salary"
                                  :base_type    :type/Decimal})]
           :display_name "Roles"})])
