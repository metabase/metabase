(ns metabase-enterprise.library-branching.engine.semantic-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.semantic :as semantic]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.test-util :as lb.tu]))

(set! *warn-on-reflection* true)

(def ^:private orders ["Sample Database" "PUBLIC" "ORDERS"])
(def ^:private total (conj orders "TOTAL"))

(def ^:private metric-id "IW8kbqZVaMxdGtCM2F4U6")

(def ^:private snapshot
  {metric-id {:kind  :metric
              :name  "Total Revenue"
              :place nil
              :refs  #{[:database [:env ["Sample Database"]]]
                       [:source-table [:env orders]]
                       [:field [:env total]]
                       [:card "cOlQuErIeS0ExAmPlE2x1"]}
              :attrs {}}})

(def ^:private env
  {["Sample Database"] {:object :database}
   orders              {:object :table}
   total               {:object :field}})

(deftest ^:parallel validate-test
  (testing "every environment reference names an object of the environment: no finding; the reference to a card is
            not an environment reference"
    (is (= [] (semantic/validate snapshot env))))
  (testing "a field that the environment does not have"
    (is (= [{:rule :env-resolves :id metric-id :ref [:field [:env total]]}]
           (semantic/validate snapshot (dissoc env total)))))
  (testing "with an empty environment, each environment reference is a finding, in a fixed order"
    (is (= [{:rule :env-resolves :id metric-id :ref [:database [:env ["Sample Database"]]]}
            {:rule :env-resolves :id metric-id :ref [:field [:env total]]}
            {:rule :env-resolves :id metric-id :ref [:source-table [:env orders]]}]
           (semantic/validate snapshot {})))))

(defn- env-of
  "The environment that holds every environment target of snapshot `s`."
  [s]
  (into {}
        (for [[_ {:keys [refs]}] s
              [_ target]         refs
              :when              (lb.tu/env-target? target)]
          [(second target) {:object :table}])))

(defspec ^:parallel complete-environment-has-no-finding-test 200
  (prop/for-all [s (lb.tu/arbitrary-snapshot-gen)]
    (= [] (semantic/validate s (env-of s)))))

(defspec ^:parallel each-missing-key-is-a-finding-of-each-reference-test 200
  (prop/for-all [[s k] (gen/bind (gen/such-that #(seq (env-of %)) (lb.tu/arbitrary-snapshot-gen) 100)
                                 (fn [s] (gen/tuple (gen/return s) (gen/elements (sort-by str (keys (env-of s)))))))]
    (= (set (for [[id {:keys [refs]}] s
                  [_ target :as ref]  refs
                  :when               (= [:env k] target)]
              {:rule :env-resolves :id id :ref ref}))
       (set (semantic/validate s (dissoc (env-of s) k))))))

(def ^:private mutations
  [{:name   :env-unchecked
    :doc    "A reference to a table that the manifest does not have passes CI."
    :target `semantic/validate
    :edits  [[:replace '(contains? env k) true]]}
   {:name   :items-checked
    :doc    "A reference to an item counts as an environment reference, so a reference to a card is a finding."
    :target `semantic/validate
    :edits  [[:replace '(env-target? target) true]]}])

(deftest semantic-mutations-test
  (mut/check mutations {:tests [#'validate-test #'each-missing-key-is-a-finding-of-each-reference-test]}))
