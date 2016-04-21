(ns metabase.mock.toucanery
  "A document style database mocked for testing.
   This is a `:dynamic-schema` db with `:nested-fields`.
   Most notably meant to serve as a representation of a Mongo database."
  (:require [metabase.driver :as driver]))


(def ^:const toucanery-tables
  "Docstring"
  {"transactions"  {:name   "transactions"
                    :schema nil
                    :fields #{{:name          "id"
                               :pk?           true
                               :base-type     :IntegerField}
                              {:name          "ts"
                               :base-type     :BigIntegerField
                               :special-type  :timestamp_milliseconds}
                              {:name          "toucan"
                               :base-type     :DictionaryField
                               :nested-fields #{{:name          "name"
                                                 :base-type     :TextField}
                                                {:name          "details"
                                                 :base-type     :DictionaryField
                                                 :nested-fields #{{:name         "age"
                                                                   :base-type    :IntegerField}
                                                                  {:name         "weight"
                                                                   :special-type :category
                                                                   :base-type    :DecimalField}}}}}
                              {:name          "buyer"
                               :base-type     :DictionaryField
                               :nested-fields #{{:name      "name"
                                                 :base-type :TextField}
                                                {:name      "cc"
                                                 :base-type :TextField}}}}}
   "employees"     {:name   "employees"
                    :schema nil
                    :fields #{{:name      "id"
                               :base-type :IntegerField}
                              {:name      "name"
                               :base-type :TextField}}}})

(defrecord ToucaneryDriver []
  clojure.lang.Named
  (getName [_] "ToucaneryDriver"))

(extend ToucaneryDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table       (constantly nil)
          :describe-database   (fn [_ {:keys [exclude-tables]}]
                                 (let [tables (for [table (vals toucanery-tables)
                                                    :when (not (contains? exclude-tables (:name table)))]
                                                (select-keys table [:schema :name]))]
                                   {:tables (set tables)}))
          :describe-table      (fn [_ _ table]
                                 (get toucanery-tables (:name table)))
          :features            (constantly #{:dynamic-schema :nested-fields})
          :details-fields      (constantly [])
          :table-rows-seq      (constantly [{:keypath "movies.filming.description", :value "If the movie is currently being filmed."}
                                            {:keypath "movies.description", :value "A cinematic adventure."}])}))

(driver/register-driver! :toucanery (ToucaneryDriver.))


(def ^:const toucanery-raw-tables-and-columns
  "Docstring"
  [{:schema nil
    :database_id true
    :columns []
    :name "employees"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema nil
    :database_id true
    :columns []
    :name "transactions"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}])

(def ^:const toucanery-tables-and-fields
  "Docstring"
  [{:description nil
    :entity_type nil
    :schema nil
    :raw_table_id true
    :name "employees"
    :fields [{:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id false
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
              :raw_column_id false
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
    :display_name "Employees"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema nil
    :raw_table_id true
    :name "transactions"
    :fields [{:description nil
              :table_id true
              :special_type nil
              :name "age"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id true
              :id true
              :raw_column_id false
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Age"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type nil
              :name "buyer"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id false
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Buyer"
              :created_at true
              :base_type :DictionaryField}
             {:description nil
              :table_id true
              :special_type nil
              :name "cc"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id true
              :id true
              :raw_column_id false
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Cc"
              :created_at true
              :base_type :TextField}
             {:description nil
              :table_id true
              :special_type nil
              :name "details"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id true
              :id true
              :raw_column_id false
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Details"
              :created_at true
              :base_type :DictionaryField}
             {:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id false
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
              :parent_id true
              :id true
              :raw_column_id false
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Name"
              :created_at true
              :base_type :TextField}
             {:description nil
              :table_id true
              :special_type :name
              :name "name"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id true
              :id true
              :raw_column_id false
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Name"
              :created_at true
              :base_type :TextField}
             {:description nil
              :table_id true
              :special_type nil
              :name "toucan"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id false
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Toucan"
              :created_at true
              :base_type :DictionaryField}
             {:description nil
              :table_id true
              :special_type :timestamp_milliseconds
              :name "ts"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id false
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Ts"
              :created_at true
              :base_type :BigIntegerField}
             {:description nil
              :table_id true
              :special_type :category
              :name "weight"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id true
              :id true
              :raw_column_id false
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Weight"
              :created_at true
              :base_type :DecimalField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Transactions"
    :created_at true}])
