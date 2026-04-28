(ns metabase.lib-be.json-schema-test
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.lib-be.json-schema :as js]
   [metabase.util.json :as json-util])
  (:import (com.github.erosb.jsonsKema FormatValidationPolicy
                                       JsonParser
                                       SchemaLoader
                                       Validator
                                       ValidatorConfig)))

(set! *warn-on-reflection* true)

(defn check-node [node]
  (when (map? node)
    (when (contains? node "type")
      (is (not= nil (node "type"))))
    (when-let [one-of (:oneOf node)]
      (is (< 1 (count one-of)))
      (is (not (some empty? one-of)) (pr-str :empty-one-of one-of)))
    (when-let [any-of (:anyOf node)]
      (is (< 1 (count any-of)))
      (is (not (some empty? any-of)) (pr-str :empty-any-of any-of)))
    (when-let [all-of (:allOf node)]
      (is (< 1 (count all-of)))
      (is (not (some empty? all-of)) (pr-str :empty-all-of all-of))))
  node)

(def simple-query
  {:lib/type :mbql/query
   :database "hello"
   :stages   [{:lib/type :mbql.stage/mbql
               :source-table ["hello" "schema" "tbl"]
               :order-by
               [[:asc {}
                 [:field {:base-type :type/BigInteger}
                  "hello" "schema" "tbl" "f"]]]}]})

(deftest fix-json-schema-test
  (let [schema-map (js/make-schema)
        schema (.load (SchemaLoader. (json-util/encode schema-map)))
        validator (Validator/create schema (ValidatorConfig. FormatValidationPolicy/ALWAYS))]
    (testing "does it pass the malli schema?"
      (is (map? schema-map)))
    (testing "it should remove malli quirks"
      (walk/postwalk check-node schema))
    (testing "simple query"
      (is (nil? (.validate validator
                           (.parse (JsonParser. (json-util/encode simple-query)))))))
    (testing "representation examples validate"
      (let [examples-dir "serialization_baseline/collections/main/queries"]
        (doseq [f (.listFiles (io/file (io/resource examples-dir)))]
          (let [query (:dataset_query (yaml/parse-string (slurp f)))]
            (is (nil? (.validate validator
                                 (.parse (JsonParser. (json-util/encode query))))))))))))
