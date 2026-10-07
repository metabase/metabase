(ns metabase.lib.schema.metadata.fingerprint-test
  "Basic tests to make sure the fingerprint generatation code is doing something that makes sense."
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel normalize-test
  (is (= {:global {:distinct-count 4, :nil% 0.0}
          :type   {:type/Text   {:average-length 6.375
                                 :percent-email  0.0
                                 :percent-json   0.0
                                 :percent-state  0.0
                                 :percent-url    0.0}
                   :type/Number {:q1 1.459}}}
         (lib/normalize
          ::lib.schema.metadata.fingerprint/fingerprint
          {"global" {"distinct-count" 4, "nil%" 0.0}
           "type"   {"type/Text"   {"average-length" 6.375
                                    "percent-email"  0.0
                                    "percent-json"   0.0
                                    "percent-state"  0.0
                                    "percent-url"    0.0}
                     "type/Number" {"q1" 1.459}}}))))

(deftest ^:parallel fingerprint-schema-test
  (testing "every map in a fingerprint declares its keys"
    (let [base {:global {:distinct-count 2, :nil% 0.0}}]
      (is (not (me/humanize (mr/explain ::lib.schema.metadata.fingerprint/fingerprint base))))
      (doseq [path [[:type :type/Text]
                    [:type :type/Number]
                    [:type :type/DateTime]
                    [:global]
                    [:experimental]
                    []]]
        (is (me/humanize
             (mr/explain
              ::lib.schema.metadata.fingerprint/fingerprint
              (assoc-in base (conj path :extra-key) (rand-nth [3 :extra-value 4.0 {:stuff :stuff}])))))))))
