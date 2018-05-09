(ns metabase.driver.athena.athena-sql-parser-test
  (:require [metabase.driver.athena.athena-sql-parser :as parser]
            [expectations :refer :all]))


(expect
  {:name "sk_id"
   :base-type :type/Text
   :database-type "string"}
  (parser/parse-schema {:name "sk_id" :type "string"}))

(expect
  {:name "sk_date"
   :base-type :type/Date
   :database-type "date"}
  (parser/parse-schema {:name "sk_date" :type "date"}))

(expect
  {:name "sk_hour"
   :base-type :type/Integer
   :database-type "int"}
  (parser/parse-schema {:name "sk_hour" :type "int"}))

(expect
  {:name "warnings"
   :base-type :type/Array
   :database-type "array"}
  (parser/parse-schema {:name "warnings" :type "array<string>"}))

(expect
  {:name "scheduleslots"
   :base-type :type/Dictionary
   :database-type "struct"
   :nested-fields #{{:name "availabledays" :base-type :type/Array :database-type "array"}
                    {:name "availablepartsofday" :base-type :type/Array :database-type "array"}}}
  (parser/parse-schema {:name "scheduleslots" :type "struct<availabledays:array<string>,availablepartsofday:array<string>>"}))

(expect
  {:name "price"
   :base-type :type/Float
   :database-type "double"}
  (parser/parse-schema {:name "price" :type "double"}))

(expect
  {:name "sk_references"
   :base-type :type/Dictionary
   :database-type "struct"
   :nested-fields #{{:name "cepid" :base-type :type/Text :database-type "string"}
                    {:name "customerid" :base-type :type/Text :database-type "string"}
                    {:name "id" :base-type :type/Integer :database-type "int"}}}
  (parser/parse-schema {:name "sk_references" :type "struct<cepid:string,customerid:string,id:int>"}))

(expect
  {:name "options"
   :base-type :type/Dictionary
   :database-type "struct"
   :nested-fields #{{:name "conventional"
                     :base-type :type/Dictionary
                     :database-type "map"
                     :nested-fields #{{:name "price" :base-type :type/Float :database-type "double"}
                                      {:name "eta"
                                       :base-type :type/Dictionary
                                       :database-type "map"
                                       :nested-fields #{{:name "date" :base-type :type/Text :database-type "string"}
                                                        {:name "businessdays" :base-type :type/Integer :database-type "int"}
                                                        {:name "lowerboundbusinessdays" :base-type :type/Integer :database-type "int"}}}}}}}
  (parser/parse-schema {:name "options" :type (str "struct<options:struct<conventional:struct<"
                                                   "price:double,eta:struct<"
                                                   "date:string,businessdays:int,lowerboundbusinessdays:int>>>>")}))

