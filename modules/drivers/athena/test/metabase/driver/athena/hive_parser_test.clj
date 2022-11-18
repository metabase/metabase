(ns metabase.driver.athena.hive-parser-test
  (:require [clojure.test :refer :all]
            [metabase.driver.athena.hive-parser :refer [hive-schema->map]]))

(deftest parser
  (testing "Parse schema"
    (is (=
         {:customerid "string" :prime "boolean" :productid "int"}
         (hive-schema->map "struct<customerid:string,prime:boolean,productid:int>")))

    (is (=
         {:customerid "string" :m_field [{:key "string" :value "string"}]}
         (hive-schema->map "struct<customerid:string,m_field:map<string,string>>")))

    (is (=
         {:grouperrors "string" :grouperrorsorder [] :fielderrors {:reviewtext {:field "string"} :title {:field "string"}} :fielderrorsorder []}
         (hive-schema->map "struct<grouperrors:string,grouperrorsorder:array<string>,fielderrors:struct<reviewtext:struct<field:string>,title:struct<field:string>>,fielderrorsorder:array<string>>")))

    (is (=
         [{:customerid "string" :Order "bigint"}]
         (hive-schema->map "array<struct<customerid:string,Order:bigint>>")))

    (is (=
         {:accredited_buyer_representative_abr "boolean"}
         (hive-schema->map "struct<accredited_buyer_representative_abr: boolean>")))

    (is (=
         {:mediacategory "string" :mediakey "string" :mediaurl "string" :order "bigint"}
         (hive-schema->map "struct<mediacategory: string, mediakey: string, mediaurl: string, order: bigint>")))))
