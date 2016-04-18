(ns metabase.mock.moviedb
  (:require [metabase.driver :as driver]))


(def ^:const moviedb-tables
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


(def ^:const sync-test-raw-tables
  [{:schema nil
    :database_id true
    :columns [{:raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :IntegerField}
              {:raw_table_id true
               :name "name"
               :fk_target_column_id false
               :updated_at true
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :TextField}]
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
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :BooleanField}
              {:raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :IntegerField}
              {:raw_table_id true
               :name "title"
               :fk_target_column_id false
               :updated_at true
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :TextField}]
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
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :IntegerField}
              {:raw_table_id true
               :name "movie_id"
               :fk_target_column_id true
               :updated_at true
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :IntegerField}
              {:raw_table_id true
               :name "stars"
               :fk_target_column_id false
               :updated_at true
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :IntegerField}]
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
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :IntegerField}
              {:raw_table_id true
               :name "character"
               :fk_target_column_id false
               :updated_at true
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :TextField}
              {:raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :IntegerField}
              {:raw_table_id true
               :name "movie_id"
               :fk_target_column_id true
               :updated_at true
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :IntegerField}
              {:raw_table_id true
               :name "salary"
               :fk_target_column_id false
               :updated_at true
               :details {}
               :active true
               :id true
               :is_pk false
               :created_at true
               :base_type :DecimalField}]
    :name "roles"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}])
