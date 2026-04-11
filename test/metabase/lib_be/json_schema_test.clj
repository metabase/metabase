(ns metabase.lib-be.json-schema-test
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.shell :as sh]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.lib-be.json-schema :as js]
   [metabase.lib.test-util.generators :as gen]
   [metabase.test :as mt]
   [metabase.util.json :as json-util])
  (:import (java.io File)))

(set! *warn-on-reflection* true)

(defn check-node [node]
  (when (map? node)
    (when (contains? node "type")
      (is (not= nil (node "type"))))
    (is (not= false (:items node)))
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
   :database 1
   :stages   [{:lib/type :mbql.stage/mbql
               :source-table 2
               :order-by
               [[:asc {:lib/uuid "00000000-0000-0000-0000-000000000020"}
                 [:field {:lib/uuid "00000000-0000-0000-0000-000000000030"
                          :base-type :type/BigInteger} 3]]]}]})

(defn- is-valid? [schema-file query]
  (let [query-json (json-util/encode query {:pretty true})
        jv (sh/sh "jv" (str schema-file) "/dev/stdin" :in query-json)]
    (is (zero? (:exit jv)) (str query-json "\n" (:err jv)))))

;; If you end up making changes to the json schema generator, install jv to make
;; sure the validation tests below are run:
;; https://github.com/santhosh-tekuri/jsonschema

(deftest fix-json-schema-test
  (let [schema (js/make-schema)]
    (testing "does it pass the malli schema?"
      (is (map? schema)))
    (testing "it should remove malli quirks"
      (walk/postwalk check-node schema))
    (let [^File schema-file (File/createTempFile "json-schema" "test")]
      (spit schema-file (json-util/encode schema))
      (spit "/tmp/schema.clj" (pr-str schema))
      (try
        (testing "does the schema itself validate?"
          (let [jv (sh/sh "jv" (str schema-file))]
            (is (zero? (:exit jv)) (:err jv))))
        (testing "simple query"
          (is-valid? schema-file simple-query))
        #_(testing "generated query is validated"
          (let [query (gen/random-query (mt/metadata-provider))]
            (is-valid? schema-file query)))
        (testing "representation examples validate"
          (let [examples-dir "../representations/examples/v1/collections/main/queries"]
            (when (.exists (File. examples-dir))
              (doseq [f (take 1 (.listFiles (File. examples-dir)))]
                (let [query (:dataset_query (yaml/parse-string (slurp f)))]
                  (is-valid? schema-file query))))))
        ;; If you don't have the jv validator installed, don't worry about it
        (catch java.io.IOException e
          (when-not (re-find #"No such file or directory" (str e))
            (throw e)))
        (finally (.delete schema-file))))))
