#!/usr/bin/env bb

(ns lint-snowplow-schemas-test
  "Unit tests for `bin/lint-snowplow-schemas.bb`. Run with `./bin/lint-snowplow-schemas-test.bb`."
  (:require
   [babashka.fs :as fs]
   [clojure.test :as t :refer [deftest is testing]]))

;; Load the script under test as a sibling file. The script's `(when (= *file* (System/getProperty
;; "babashka.file")) ...)` guard prevents `-main` from running on load.
(load-file (str (fs/parent (fs/absolutize *file*)) "/lint-snowplow-schemas.bb"))
(require '[lint-snowplow-schemas :as l])

(deftest nullable-type?-test
  (testing "scalar 'null' is nullable"
    (is (l/nullable-type? "null")))
  (testing "vector containing 'null' is nullable"
    (is (l/nullable-type? ["string" "null"])))
  (testing "scalar non-null is not nullable"
    (is (not (l/nullable-type? "string"))))
  (testing "vector without 'null' is not nullable"
    (is (not (l/nullable-type? ["string" "integer"]))))
  (testing "missing/empty type is not nullable"
    (is (not (l/nullable-type? nil)))
    (is (not (l/nullable-type? [])))))

(deftest object-like?-test
  (testing "explicit object type"
    (is (l/object-like? {:type "object"})))
  (testing "vector type containing 'object'"
    (is (l/object-like? {:type ["object" "null"]})))
  (testing "properties present without explicit type"
    (is (l/object-like? {:properties {:x {:type "string"}}})))
  (testing "scalar non-object schema"
    (is (not (l/object-like? {:type "string"}))))
  (testing "empty schema is not object-like"
    (is (not (l/object-like? {})))))

(deftest check-schema-test
  (testing "scalar nullable required property is flagged"
    (is (= [{:path    "/p"
             :pointer "$.properties.x"
             :msg     "required property 'x' has nullable type \"null\""}]
           (l/check-schema "/p" {:type                 "object"
                                 :additionalProperties false
                                 :required             ["x"]
                                 :properties           {:x {:type "null"}}}))))
  (testing "vector-with-null required property is flagged"
    (is (= [{:path    "/p"
             :pointer "$.properties.x"
             :msg     "required property 'x' has nullable type [\"string\" \"null\"]"}]
           (l/check-schema "/p" {:type                 "object"
                                 :additionalProperties false
                                 :required             ["x"]
                                 :properties           {:x {:type ["string" "null"]}}}))))
  (testing "non-required nullable property is allowed"
    (is (empty? (l/check-schema "/p" {:type                 "object"
                                      :additionalProperties false
                                      :required             []
                                      :properties           {:x {:type ["string" "null"]}}}))))
  (testing "missing additionalProperties on type:object is flagged"
    (is (= [{:path    "/p"
             :pointer "$"
             :msg     "object schema must explicitly set 'additionalProperties' (true or false)"}]
           (l/check-schema "/p" {:type "object" :properties {}}))))
  (testing "missing additionalProperties on type [object null] is flagged"
    (is (= [{:path    "/p"
             :pointer "$"
             :msg     "object schema must explicitly set 'additionalProperties' (true or false)"}]
           (l/check-schema "/p" {:type ["object" "null"] :properties {}}))))
  (testing "missing additionalProperties on schema with :properties but no :type is flagged"
    (is (= [{:path    "/p"
             :pointer "$"
             :msg     "object schema must explicitly set 'additionalProperties' (true or false)"}]
           (l/check-schema "/p" {:properties {:x {:type "string"}}}))))
  (testing "additionalProperties: false (or true) satisfies the rule"
    (is (empty? (l/check-schema "/p" {:type "object" :additionalProperties false :properties {}})))
    (is (empty? (l/check-schema "/p" {:type "object" :additionalProperties true :properties {}}))))
  (testing "non-object schema doesn't trigger the additionalProperties rule"
    (is (empty? (l/check-schema "/p" {:type "string"}))))
  (testing "non-map property values (e.g. boolean schemas) don't crash the check"
    (is (= [] (l/check-schema "/p" {:type                 "object"
                                    :additionalProperties false
                                    :required             ["x"]
                                    :properties           {:x true}})))))

(deftest classify-violations-test
  (let [v1       {:path "/a" :pointer "$" :msg "x"}
        v2       {:path "/b" :pointer "$.properties.y" :msg "y"}
        baseline #{{:path "/a" :pointer "$"}
                   {:path "/c" :pointer "$"}}]
    (testing "matching entries are grandfathered"
      (let [{:keys [new-problems grandfathered]} (l/classify-violations [v1] baseline)]
        (is (empty? new-problems))
        (is (= [v1] grandfathered))))
    (testing "non-matching entries are new problems"
      (let [{:keys [new-problems grandfathered]} (l/classify-violations [v2] baseline)]
        (is (= [v2] new-problems))
        (is (empty? grandfathered))))
    (testing "baseline entries with no matching violation are stale"
      (let [{:keys [stale]} (l/classify-violations [v1] baseline)]
        (is (= [{:path "/c" :pointer "$"}] stale))))
    (testing ":fatal violations bypass the baseline even if path/pointer matches"
      (let [fatal {:path "/a" :pointer "$" :fatal true :msg "unparseable"}
            {:keys [new-problems grandfathered]} (l/classify-violations [fatal] baseline)]
        (is (= [fatal] new-problems))
        (is (empty? grandfathered))))))

(when (= *file* (System/getProperty "babashka.file"))
  (let [{:keys [fail error]} (t/run-tests 'lint-snowplow-schemas-test)]
    (System/exit (if (zero? (+ fail error)) 0 1))))
