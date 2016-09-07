(ns metabase.test.mock.toucanery
  "A document style database mocked for testing.
   This is a `:dynamic-schema` db with `:nested-fields`.
   Most notably meant to serve as a representation of a Mongo database."
  (:require [metabase.driver :as driver]))


(def ^:private ^:const toucanery-tables
  {"transactions" {:name   "transactions"
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
   "employees" {:name "employees"
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
         {:analyze-table     (constantly nil)
          :describe-database (fn [_ {:keys [exclude-tables]}]
                               (let [tables (for [table (vals toucanery-tables)
                                                  :when (not (contains? exclude-tables (:name table)))]
                                              (select-keys table [:schema :name]))]
                                 {:tables (set tables)}))
          :describe-table    (fn [_ _ table]
                               (get toucanery-tables (:name table)))
          :features          (constantly #{:dynamic-schema :nested-fields})
          :details-fields    (constantly [])
          :table-rows-seq    (constantly [{:keypath "movies.filming.description", :value "If the movie is currently being filmed."}
                                          {:keypath "movies.description", :value "A cinematic adventure."}])}))

(driver/register-driver! :toucanery (ToucaneryDriver.))

(def ^:private ^:const raw-table-defaults
  {:schema      nil
   :database_id true
   :columns     []
   :updated_at  true
   :details     {}
   :active      true
   :id          true
   :created_at  true})

(def ^:const toucanery-raw-tables-and-columns
  [(merge raw-table-defaults {:name "employees"})
   (merge raw-table-defaults {:name "transactions"})])


(def ^:private ^:const table-defaults
  {:description             nil
   :entity_type             nil
   :caveats                 nil
   :points_of_interest      nil
   :show_in_getting_started false
   :schema                  nil
   :raw_table_id            true
   :fields                  []
   :rows                    nil
   :updated_at              true
   :entity_name             nil
   :active                  true
   :id                      true
   :db_id                   true
   :visibility_type         nil
   :created_at              true})

(def ^:private ^:const field-defaults
  {:description        nil
   :table_id           true
   :caveats            nil
   :points_of_interest nil
   :fk_target_field_id false
   :updated_at         true
   :active             true
   :parent_id          false
   :special_type       nil
   :id                 true
   :raw_column_id      false
   :last_analyzed      false
   :position           0
   :visibility_type    :normal
   :preview_display    true
   :created_at         true})

(def ^:const toucanery-tables-and-fields
  [(merge table-defaults
          {:name         "employees"
           :fields       [(merge field-defaults
                                 {:name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField
                                  :special_type :id})
                          (merge field-defaults
                                 {:name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField
                                  :special_type :name})]
           :display_name "Employees"})
   (merge table-defaults
          {:name         "transactions"
           :fields       [(merge field-defaults
                                 {:name         "age"
                                  :display_name "Age"
                                  :base_type    :IntegerField
                                  :parent_id    true})
                          (merge field-defaults
                                 {:name         "buyer"
                                  :display_name "Buyer"
                                  :base_type    :DictionaryField})
                          (merge field-defaults
                                 {:name         "cc"
                                  :display_name "Cc"
                                  :base_type    :TextField
                                  :parent_id    true})
                          (merge field-defaults
                                 {:name         "details"
                                  :display_name "Details"
                                  :base_type    :DictionaryField
                                  :parent_id    true})
                          (merge field-defaults
                                 {:name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField
                                  :special_type :id})
                          (merge field-defaults
                                 {:name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField
                                  :parent_id    true
                                  :special_type :name})
                          (merge field-defaults
                                 {:name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField
                                  :parent_id    true
                                  :special_type :name})
                          (merge field-defaults
                                 {:name         "toucan"
                                  :display_name "Toucan"
                                  :base_type    :DictionaryField})
                          (merge field-defaults
                                 {:name         "ts"
                                  :display_name "Ts"
                                  :base_type    :BigIntegerField
                                  :special_type :timestamp_milliseconds})
                          (merge field-defaults
                                 {:name         "weight"
                                  :display_name "Weight"
                                  :base_type    :DecimalField
                                  :parent_id    true
                                  :special_type :category})]
           :display_name "Transactions"})])
