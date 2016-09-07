(ns metabase.test.mock.moviedb
  "A simple relational schema based mocked for testing. 4 tables w/ some FKs."
  (:require [metabase.driver :as driver]))


(def ^:private ^:const moviedb-tables
  {"movies"  {:name   "movies"
              :schema nil
              :fields #{{:name      "id"
                         :base-type :IntegerField}
                        {:name      "title"
                         :base-type :TextField}
                        {:name      "filming"
                         :base-type :BooleanField}}}
   "actors"  {:name   "actors"
              :schema nil
              :fields #{{:name      "id"
                         :base-type :IntegerField}
                        {:name      "name"
                         :base-type :TextField}}}
   "roles"   {:name   "roles"
              :schema nil
              :fields #{{:name      "id"
                         :base-type :IntegerField}
                        {:name      "movie_id"
                         :base-type :IntegerField}
                        {:name      "actor_id"
                         :base-type :IntegerField}
                        {:name      "character"
                         :base-type :TextField}
                        {:name      "salary"
                         :base-type :DecimalField}}
              :fks    #{{:fk-column-name   "movie_id"
                         :dest-table       {:name "movies"
                                            :schema nil}
                         :dest-column-name "id"}
                        {:fk-column-name   "actor_id"
                         :dest-table       {:name "actors"
                                            :schema nil}
                         :dest-column-name "id"}}}
   "reviews" {:name   "reviews"
              :schema nil
              :fields #{{:name      "id"
                         :base-type :IntegerField}
                        {:name      "movie_id"
                         :base-type :IntegerField}
                        {:name      "stars"
                         :base-type :IntegerField}}
              :fks    #{{:fk-column-name   "movie_id"
                         :dest-table       {:name   "movies"
                                            :schema nil}
                         :dest-column-name "id"}}}})

(defrecord MovieDbDriver []
  clojure.lang.Named
  (getName [_] "MovieDbDriver"))

(extend MovieDbDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table       (constantly nil)
          :describe-database   (fn [_ {:keys [exclude-tables]}]
                                 (let [tables (for [table (vals moviedb-tables)
                                                    :when (not (contains? exclude-tables (:name table)))]
                                                (select-keys table [:schema :name]))]
                                   {:tables (set tables)}))
          :describe-table      (fn [_ _ table]
                                 (-> (get moviedb-tables (:name table))
                                     (dissoc :fks)))
          :describe-table-fks  (fn [_ _ table]
                                 (-> (get moviedb-tables (:name table))
                                     :fks
                                     set))
          :features            (constantly #{:foreign-keys})
          :details-fields      (constantly [])
          :table-rows-seq      (constantly [{:keypath "movies.filming.description", :value "If the movie is currently being filmed."}
                                            {:keypath "movies.description", :value "A cinematic adventure."}])}))

(driver/register-driver! :moviedb (MovieDbDriver.))

(def ^:private ^:const raw-table-defaults
  {:schema      nil
   :database_id true
   :updated_at  true
   :details     {}
   :active      true
   :id          true
   :created_at  true})

(def ^:private ^:const raw-field-defaults
  {:raw_table_id        true
   :fk_target_column_id false
   :updated_at          true
   :active              true
   :id                  true
   :is_pk               false
   :created_at          true
   :column_type         nil})


(def ^:const moviedb-raw-tables
  [(merge raw-table-defaults
          {:columns [(merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}})
                     (merge raw-field-defaults
                            {:name    "name"
                             :details {:base-type "TextField"}})]
           :name    "actors"})
   (merge raw-table-defaults
          {:columns [(merge raw-field-defaults
                            {:name    "filming"
                             :details {:base-type "BooleanField"}})
                     (merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}})
                     (merge raw-field-defaults
                            {:name    "title"
                             :details {:base-type "TextField"}})]
           :name    "movies"})
   (merge raw-table-defaults
          {:columns [(merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}})
                     (merge raw-field-defaults
                            {:name                "movie_id"
                             :details             {:base-type "IntegerField"}
                             :fk_target_column_id true})
                     (merge raw-field-defaults
                            {:name    "stars"
                             :details {:base-type "IntegerField"}})]
           :name    "reviews"})
   (merge raw-table-defaults
          {:columns [(merge raw-field-defaults
                            {:name                "actor_id"
                             :details             {:base-type "IntegerField"}
                             :fk_target_column_id true})
                     (merge raw-field-defaults
                            {:name    "character"
                             :details {:base-type "TextField"}})
                     (merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}})
                     (merge raw-field-defaults
                            {:name                "movie_id"
                             :details             {:base-type "IntegerField"}
                             :fk_target_column_id true})
                     (merge raw-field-defaults
                            {:name    "salary"
                             :details {:base-type "DecimalField"}})]
           :name    "roles"})])


(def ^:private ^:const table-defaults
  {:description             nil
   :entity_type             nil
   :caveats                 nil
   :points_of_interest      nil
   :show_in_getting_started false
   :schema                  nil
   :raw_table_id            true
   :rows                    nil
   :updated_at              true
   :entity_name             nil
   :active                  true
   :id                      true
   :db_id                   true
   :visibility_type         nil
   :created_at              true})

(def ^:privaet ^:const field-defaults
  {:description        nil
   :table_id           true
   :caveats            nil
   :points_of_interest nil
   :special_type       nil
   :fk_target_field_id false
   :updated_at         true
   :active             true
   :parent_id          false
   :id                 true
   :raw_column_id      true
   :last_analyzed      false
   :position           0
   :visibility_type    :normal
   :preview_display    true
   :created_at         true})

(def ^:const moviedb-tables-and-fields
  [(merge table-defaults
          {:name         "actors"
           :fields       [(merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField})]

           :display_name "Actors"})
   (merge table-defaults
          {:name         "movies"
           :fields       [(merge field-defaults
                                 {:name         "filming"
                                  :display_name "Filming"
                                  :base_type    :BooleanField})
                          (merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:name         "title"
                                  :display_name "Title"
                                  :base_type    :TextField})]

           :display_name "Movies"})
   (merge table-defaults
          {:name         "reviews"
           :fields       [(merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type       :fk
                                  :fk_target_field_id true
                                  :name               "movie_id"
                                  :display_name       "Movie ID"
                                  :base_type          :IntegerField})
                          (merge field-defaults
                                 {:name         "stars"
                                  :display_name "Stars"
                                  :base_type    :IntegerField})]
           :display_name "Reviews"})
   (merge table-defaults
          {:name         "roles"
           :fields       [(merge field-defaults
                                 {:special_type       :fk
                                  :fk_target_field_id true
                                  :name               "actor_id"
                                  :display_name       "Actor ID"
                                  :base_type          :IntegerField})
                          (merge field-defaults
                                 {:name         "character"
                                  :display_name "Character"
                                  :base_type    :TextField})
                          (merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type       :fk
                                  :fk_target_field_id true
                                  :name               "movie_id"
                                  :display_name       "Movie ID"
                                  :base_type          :IntegerField})
                          (merge field-defaults
                                 {:name         "salary"
                                  :display_name "Salary"
                                  :base_type    :DecimalField})]
           :display_name "Roles"})])
