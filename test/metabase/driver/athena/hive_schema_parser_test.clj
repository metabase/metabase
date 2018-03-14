(ns metabase.driver.athena.hive-schema-parser-test
  (:require [metabase.driver.athena.hive-schema-parser :as parser]
            [expectations :refer :all]))


(expect
  {:cepid "string"
   :customerid "string"}
  (parser/hive-schema->map "struct<cepid:string,customerid:string>"))


(expect
  {:options {:conventional {:price "double"
                            :eta {:date "string"
                                  :businessdays "int"
                                  :lowerboundbusinessdays "int"}}}}
  (parser/hive-schema->map (str "struct<options:struct<conventional:struct<"
                                "price:double,eta:struct<"
                                "date:string,businessdays:int,lowerboundbusinessdays:int>>>>")))

(expect
  []
  (parser/hive-schema->map "array<string>"))


(expect
  {:price "double"
   :scheduleslots {
                   :availabledays []
                   :availablepartsofday []}}
  (parser/hive-schema->map (str "struct<price:double,scheduleslots:struct<"
                                "availabledays:array<string>,availablepartsofday:array<string>>>")))