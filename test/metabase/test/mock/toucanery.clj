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
                              :base-type     :type/Integer}
                             {:name          "ts"
                              :base-type     :type/BigInteger
                              :special-type  :type/UNIXTimestampMilliseconds}
                             {:name          "toucan"
                              :base-type     :type/Dictionary
                              :nested-fields #{{:name          "name"
                                                :base-type     :type/Text}
                                               {:name          "details"
                                                :base-type     :type/Dictionary
                                                :nested-fields #{{:name         "age"
                                                                  :base-type    :type/Integer}
                                                                 {:name         "weight"
                                                                  :special-type :type/Category
                                                                  :base-type    :type/Decimal}}}}}
                             {:name          "buyer"
                              :base-type     :type/Dictionary
                              :nested-fields #{{:name      "name"
                                                :base-type :type/Text}
                                               {:name      "cc"
                                                :base-type :type/Text}}}}}
   "employees" {:name "employees"
                :schema nil
                :fields #{{:name      "id"
                           :base-type :type/Integer}
                          {:name      "name"
                           :base-type :type/Text}}}})

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
                                  :base_type    :type/Integer
                                  :special_type :type/PK})
                          (merge field-defaults
                                 {:name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text
                                  :special_type :type/Name})]
           :display_name "Employees"})
   (merge table-defaults
          {:name         "transactions"
           :fields       [(merge field-defaults
                                 {:name         "age"
                                  :display_name "Age"
                                  :base_type    :type/Integer
                                  :parent_id    true})
                          (merge field-defaults
                                 {:name         "buyer"
                                  :display_name "Buyer"
                                  :base_type    :type/Dictionary})
                          (merge field-defaults
                                 {:name         "cc"
                                  :display_name "Cc"
                                  :base_type    :type/Text
                                  :parent_id    true})
                          (merge field-defaults
                                 {:name         "details"
                                  :display_name "Details"
                                  :base_type    :type/Dictionary
                                  :parent_id    true})
                          (merge field-defaults
                                 {:name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer
                                  :special_type :type/PK})
                          (merge field-defaults
                                 {:name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text
                                  :parent_id    true
                                  :special_type :type/Name})
                          (merge field-defaults
                                 {:name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text
                                  :parent_id    true
                                  :special_type :type/Name})
                          (merge field-defaults
                                 {:name         "toucan"
                                  :display_name "Toucan"
                                  :base_type    :type/Dictionary})
                          (merge field-defaults
                                 {:name         "ts"
                                  :display_name "Ts"
                                  :base_type    :type/BigInteger
                                  :special_type :type/UNIXTimestampMilliseconds})
                          (merge field-defaults
                                 {:name         "weight"
                                  :display_name "Weight"
                                  :base_type    :type/Decimal
                                  :parent_id    true
                                  :special_type :type/Category})]
           :display_name "Transactions"})])
