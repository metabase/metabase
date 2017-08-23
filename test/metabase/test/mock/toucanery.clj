(ns metabase.test.mock.toucanery
  "A document style database mocked for testing.
   This is a `:dynamic-schema` db with `:nested-fields`.
   Most notably meant to serve as a representation of a Mongo database."
  (:require [metabase.driver :as driver]
            [metabase.test.mock.util :as mock-util]))


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


(defrecord ToucaneryDriver []
  clojure.lang.Named
  (getName [_] "ToucaneryDriver"))

(extend ToucaneryDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:describe-database        describe-database
          :describe-table           describe-table
          :features                 (constantly #{:dynamic-schema :nested-fields})
          :details-fields           (constantly [])
          :table-rows-seq           table-rows-seq
          :process-query-in-context mock-util/process-query-in-context}))

(driver/register-driver! :toucanery (ToucaneryDriver.))

(def toucanery-tables-and-fields
  [(merge mock-util/table-defaults
          {:name         "employees"
           :fields       [(merge mock-util/field-defaults
                                 {:name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer
                                  :special_type :type/PK})
                          (merge mock-util/field-defaults
                                 {:name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text
                                  :special_type :type/Name})]
           :display_name "Employees"})
   (merge mock-util/table-defaults
          {:name         "transactions"
           :fields       [(merge mock-util/field-defaults
                                 {:name         "age"
                                  :display_name "Age"
                                  :base_type    :type/Integer
                                  :parent_id    true})
                          (merge mock-util/field-defaults
                                 {:name         "buyer"
                                  :display_name "Buyer"
                                  :base_type    :type/Dictionary})
                          (merge mock-util/field-defaults
                                 {:name         "cc"
                                  :display_name "Cc"
                                  :base_type    :type/Text
                                  :parent_id    true})
                          (merge mock-util/field-defaults
                                 {:name         "details"
                                  :display_name "Details"
                                  :base_type    :type/Dictionary
                                  :parent_id    true})
                          (merge mock-util/field-defaults
                                 {:name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer
                                  :special_type :type/PK})
                          (merge mock-util/field-defaults
                                 {:name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text
                                  :parent_id    true
                                  :special_type :type/Name})
                          (merge mock-util/field-defaults
                                 {:name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text
                                  :parent_id    true
                                  :special_type :type/Name})
                          (merge mock-util/field-defaults
                                 {:name         "toucan"
                                  :display_name "Toucan"
                                  :base_type    :type/Dictionary})
                          (merge mock-util/field-defaults
                                 {:name         "ts"
                                  :display_name "Ts"
                                  :base_type    :type/BigInteger
                                  :special_type :type/UNIXTimestampMilliseconds})
                          (merge mock-util/field-defaults
                                 {:name         "weight"
                                  :display_name "Weight"
                                  :base_type    :type/Decimal
                                  :parent_id    true
                                  :special_type :type/Category})]
           :display_name "Transactions"})])
