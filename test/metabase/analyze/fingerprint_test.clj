(ns metabase.analyze.fingerprint-test
  "Basic tests to make sure the fingerprint generatation code is doing something that makes sense."
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.analyze.fingerprint.schema :as fingerprint.schema]))

(deftest ^:parallel fingerprint-schema-test
  (testing "allows for extra keywords"
    (let [base {:global
                {:distinct-count 2, :nil% 0.0}}]
      (doseq [path [[:type :type/Text]
                    [:type :type/Number]
                    [:type :type/DateTime]
                    [:global]
                    [:experimental]
                    [:top-level]
                    []]]
        (is (not (me/humanize
                  (mc/explain
                   fingerprint.schema/Fingerprint
                   (assoc-in base (conj path :extra-key) (rand-nth [3 :extra-value 4.0 {:stuff :stuff}]))))))))))
