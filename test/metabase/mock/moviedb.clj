(ns metabase.mock.moviedb
  "A simple relational schema based mocked for testing.  4 tables w/ some FKs."
  (:require [metabase.driver :as driver]))


(def ^:const moviedb-tables
  "Docstring"
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


(def ^:const moviedb-raw-tables
  "Docstring"
  [{:schema nil
    :database_id true
    :columns [{:raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}
              {:raw_table_id true
               :name "name"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}]
    :name "actors"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema nil
    :database_id true
    :columns [{:raw_table_id true
               :name "filming"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "BooleanField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}
              {:raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}
              {:raw_table_id true
               :name "title"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}]
    :name "movies"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema nil
    :database_id true
    :columns [{:raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}
              {:raw_table_id true
               :name "movie_id"
               :fk_target_column_id true
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}
              {:raw_table_id true
               :name "stars"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}]
    :name "reviews"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema nil
    :database_id true
    :columns [{:raw_table_id true
               :name "actor_id"
               :fk_target_column_id true
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}
              {:raw_table_id true
               :name "character"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}
              {:raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}
              {:raw_table_id true
               :name "movie_id"
               :fk_target_column_id true
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}
              {:raw_table_id true
               :name "salary"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "DecimalField"}
               :active true
               :id true
               :is_pk false
               :created_at true
               :column_type nil}]
    :name "roles"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}])


(def ^:const moviedb-tables-and-fields
  "Docstring"
  [{:description nil
    :entity_type nil
    :schema nil
    :raw_table_id true
    :name "actors"
    :fields [{:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :name
              :name "name"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Name"
              :created_at true
              :base_type :TextField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Actors"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema nil
    :raw_table_id true
    :name "movies"
    :fields [{:description nil
              :table_id true
              :special_type nil
              :name "filming"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Filming"
              :created_at true
              :base_type :BooleanField}
             {:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type nil
              :name "title"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Title"
              :created_at true
              :base_type :TextField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Movies"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema nil
    :raw_table_id true
    :name "reviews"
    :fields [{:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :fk
              :name "movie_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Movie Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type nil
              :name "stars"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Stars"
              :created_at true
              :base_type :IntegerField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Reviews"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema nil
    :raw_table_id true
    :name "roles"
    :fields [{:description nil
              :table_id true
              :special_type :fk
              :name "actor_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Actor Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type nil
              :name "character"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Character"
              :created_at true
              :base_type :TextField}
             {:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :fk
              :name "movie_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Movie Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type nil
              :name "salary"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Salary"
              :created_at true
              :base_type :DecimalField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Roles"
    :created_at true}])
