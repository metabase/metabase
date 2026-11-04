(ns metabase.lib-be.json-schema-test
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.lib-be.json-schema :as js]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.server.middleware.json]
   [metabase.util.json :as json-util])
  (:import
   (com.github.erosb.jsonsKema FormatValidationPolicy JsonParser SchemaLoader Validator ValidatorConfig)))

(set! *warn-on-reflection* true)

(comment metabase.server.middleware.json/keep-me)

(defn- check-node [node]
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

(def ^:private simple-query
  (-> (lib/query meta/metadata-provider
                 (meta/table-metadata :orders))
      (lib/aggregate (lib/count))
      ;; lib generates "internal MBQL"; can't have integer :table/:database
      (assoc-in [:stages 0 :source-table] ["hello" "schema" "tbl"])
      (assoc :database "my-db")))

(deftest ^:parallel fix-json-schema-test
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

(defn- clause-validator ^Validator []
  (let [schema-map (js/make-schema)
        clause     {:$ref        "#/definitions/metabase.lib.schema.mbql-clause.clause"
                    :definitions (:definitions schema-map)}]
    (Validator/create (.load (SchemaLoader. (json-util/encode clause)))
                      (ValidatorConfig. FormatValidationPolicy/ALWAYS))))

(defn- valid-clause? [^Validator validator clause]
  (nil? (.validate validator (.parse (JsonParser. (json-util/encode clause))))))

(deftest ^:parallel clause-arguments-test
  (let [validator (clause-validator)]
    (testing "variadic clauses need their minimum argument count"
      (is (valid-clause? validator ["and" {} true false]))
      (is (not (valid-clause? validator ["and" {} true]))))
    (testing "fixed-arity clauses need exactly their arguments"
      (is (valid-clause? validator ["<" {} 1 2]))
      (is (not (valid-clause? validator ["<" {} 1])))
      (is (not (valid-clause? validator ["<" {} 1 2 3]))))
    (testing "optional trailing arguments may be left out but not exceeded"
      (is (valid-clause? validator ["case" {} [[true 1]]]))
      (is (valid-clause? validator ["case" {} [[true 1]] 2]))
      (is (not (valid-clause? validator ["case" {} []])))
      (is (not (valid-clause? validator ["case" {} [[true 1]] 2 3]))))
    (testing "nested arguments are checked against their clause"
      (is (valid-clause? validator ["and" {} ["<" {} 1 2] true]))
      (is (not (valid-clause? validator ["and" {} ["<" {} 1] true]))))
    (testing "unknown clauses are rejected"
      (is (not (valid-clause? validator ["no-such-clause" {} 1]))))))
