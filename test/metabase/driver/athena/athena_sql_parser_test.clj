(ns metabase.driver.athena.athena-sql-parser-test
  (:require [metabase.driver.athena.athena-sql-parser :as parser]
            [expectations :refer :all]))


(expect
  {:name "sk_id"
   :base-type :type/Text}
  (parser/parse-schema {:name "sk_id" :type "string"}))

(expect
  {:name "sk_date"
   :base-type :type/Date}
  (parser/parse-schema {:name "sk_date" :type "date"}))

(expect
  {:name "sk_hour"
   :base-type :type/Integer}
  (parser/parse-schema {:name "sk_hour" :type "int"}))

(expect
  {:name "warnings"
   :base-type :type/Array}
  (parser/parse-schema {:name "warnings" :type "array<string>"}))

(expect
  {:name "scheduleslots"
   :base-type :type/Dictionary
   :nested-fields #{{:name "availabledays" :base-type :type/Array}
                    {:name "availablepartsofday" :base-type :type/Array}}}
  (parser/parse-schema {:name "scheduleslots" :type "struct<availabledays:array<string>,availablepartsofday:array<string>>"}))

(expect
  {:name "price"
   :base-type :type/Float}
  (parser/parse-schema {:name "price" :type "double"}))

(expect
  {:name "sk_references"
   :base-type :type/Dictionary
   :nested-fields #{{:name "cepid" :base-type :type/Text}
                    {:name "customerid" :base-type :type/Text}
                    {:name "id" :base-type :type/Integer}}}
  (parser/parse-schema {:name "sk_references" :type "struct<cepid:string,customerid:string,id:int>"}))

(expect
  {:name "options"
   :base-type :type/Dictionary
   :nested-fields #{{:name "conventional"
                     :base-type :type/Dictionary
                     :nested-fields #{{:name "price" :base-type :type/Float}
                                      {:name "eta"
                                       :base-type :type/Dictionary
                                       :nested-fields #{{:name "date" :base-type :type/Text}
                                                        {:name "businessdays" :base-type :type/Integer}
                                                        {:name "lowerboundbusinessdays" :base-type :type/Integer}}}}}}}
  (parser/parse-schema {:name "options" :type (str "struct<options:struct<conventional:struct<"
                                                   "price:double,eta:struct<"
                                                   "date:string,businessdays:int,lowerboundbusinessdays:int>>>>")}))

