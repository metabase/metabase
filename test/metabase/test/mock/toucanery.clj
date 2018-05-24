(ns metabase.test.mock.toucanery
  "A document style database mocked for testing. This is a dynamic schema db with `:nested-fields`. Most notably meant
  to serve as a representation of a Mongo database."
  (:require [metabase.driver :as driver]
            [metabase.test.mock.util :as mock-util]))


(def ^:private ^:const toucanery-tables
  {"transactions" {:name   "transactions"
                   :schema nil
                   :fields #{{:name          "id"
                              :pk?           true
                              :database-type "SERIAL"
                              :base-type     :type/Integer}
                             {:name          "ts"
                              :database-type "BIGINT"
                              :base-type     :type/BigInteger
                              :special-type  :type/UNIXTimestampMilliseconds}
                             {:name          "toucan"
                              :database-type "OBJECT"
                              :base-type     :type/Dictionary
                              :nested-fields #{{:name          "name"
                                                :database-type "VARCHAR"
                                                :base-type     :type/Text}
                                               {:name          "details"
                                                :database-type "OBJECT"
                                                :base-type     :type/Dictionary
                                                :nested-fields #{{:name          "age"
                                                                  :database-type "INT"
                                                                  :base-type     :type/Integer}
                                                                 {:name          "weight"
                                                                  :database-type "DECIMAL"
                                                                  :special-type  :type/Category
                                                                  :base-type     :type/Decimal}}}}}
                             {:name          "buyer"
                              :database-type "OBJECT"
                              :base-type     :type/Dictionary
                              :nested-fields #{{:name          "name"
                                                :database-type "VARCHAR"
                                                :base-type     :type/Text}
                                               {:name          "cc"
                                                :database-type "VARCHAR"
                                                :base-type     :type/Text}}}}}
   "employees"    {:name   "employees"
                   :schema nil
                   :fields #{{:name          "id"
                              :database-type "SERIAL"
                              :base-type     :type/Integer}
                             {:name          "name"
                              :database-type "VARCHAR"
                              :base-type     :type/Text}}}})


(defn- describe-database [_ {:keys [exclude-tables]}]
  (let [tables (for [table (vals toucanery-tables)
                     :when (not (contains? exclude-tables (:name table)))]
                 (select-keys table [:schema :name]))]
    {:tables (set tables)}))

(defn- describe-table [_ _ table]
  (get toucanery-tables (:name table)))

(defn- table-rows-seq [_ _ table]
  (when (= (:name table) "_metabase_metadata")
    [{:keypath "movies.filming.description", :value "If the movie is currently being filmed."}
     {:keypath "movies.description", :value "A cinematic adventure."}]))


(defrecord ^:private ToucaneryDriver []
  clojure.lang.Named
  (getName [_] "ToucaneryDriver"))

(extend ToucaneryDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:describe-database        describe-database
          :describe-table           describe-table
          :features                 (constantly #{:nested-fields})
          :details-fields           (constantly [])
          :table-rows-seq           table-rows-seq
          :process-query-in-context mock-util/process-query-in-context}))

(driver/register-driver! :toucanery (ToucaneryDriver.))

(def toucanery-tables-and-fields
  [(merge mock-util/table-defaults
          {:name         "employees"
           :fields       [(merge mock-util/field-defaults
                                 {:name          "id"
                                  :display_name  "ID"
                                  :database_type "SERIAL"
                                  :base_type     :type/Integer
                                  :special_type  :type/PK})
                          (merge mock-util/field-defaults
                                 {:name          "name"
                                  :display_name  "Name"
                                  :database_type "VARCHAR"
                                  :base_type     :type/Text
                                  :special_type  :type/Name})]
           :display_name "Employees"})
   (merge mock-util/table-defaults
          {:name         "transactions"
           :fields       [(merge mock-util/field-defaults
                                 {:name          "age"
                                  :display_name  "Age"
                                  :database_type "INT"
                                  :base_type     :type/Integer
                                  :parent_id     true})
                          (merge mock-util/field-defaults
                                 {:name          "buyer"
                                  :display_name  "Buyer"
                                  :database_type "OBJECT"
                                  :base_type     :type/Dictionary})
                          (merge mock-util/field-defaults
                                 {:name          "cc"
                                  :display_name  "Cc"
                                  :database_type "VARCHAR"
                                  :base_type     :type/Text
                                  :parent_id     true})
                          (merge mock-util/field-defaults
                                 {:name          "details"
                                  :display_name  "Details"
                                  :database_type "OBJECT"
                                  :base_type     :type/Dictionary
                                  :parent_id     true})
                          (merge mock-util/field-defaults
                                 {:name          "id"
                                  :display_name  "ID"
                                  :database_type "SERIAL"
                                  :base_type     :type/Integer
                                  :special_type  :type/PK})
                          (merge mock-util/field-defaults
                                 {:name          "name"
                                  :display_name  "Name"
                                  :database_type "VARCHAR"
                                  :base_type     :type/Text
                                  :parent_id     true
                                  :special_type  :type/Name})
                          (merge mock-util/field-defaults
                                 {:name          "name"
                                  :display_name  "Name"
                                  :database_type "VARCHAR"
                                  :base_type     :type/Text
                                  :parent_id     true
                                  :special_type  :type/Name})
                          (merge mock-util/field-defaults
                                 {:name          "toucan"
                                  :display_name  "Toucan"
                                  :database_type "OBJECT"
                                  :base_type     :type/Dictionary})
                          (merge mock-util/field-defaults
                                 {:name          "ts"
                                  :display_name  "Ts"
                                  :database_type "BIGINT"
                                  :base_type     :type/BigInteger
                                  :special_type  :type/UNIXTimestampMilliseconds})
                          (merge mock-util/field-defaults
                                 {:name          "weight"
                                  :display_name  "Weight"
                                  :database_type "DECIMAL"
                                  :base_type     :type/Decimal
                                  :parent_id     true
                                  :special_type  :type/Category})]
           :display_name "Transactions"})])
