(ns metabase.lib.metadata.composed-provider-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel composed-metadata-provider-test
  (testing "Return things preferentially from earlier metadata providers"
    (let [time-field        (assoc (meta/field-metadata :people :birth-date)
                                   :base-type      :type/Time
                                   :effective-type :type/Time)
          metadata-provider (lib/composed-metadata-provider
                             (lib.tu/mock-metadata-provider
                              {:fields [time-field]})
                             meta/metadata-provider)]
      (is (=? {:name           "BIRTH_DATE"
               :base-type      :type/Time
               :effective-type :type/Time}
              (lib.metadata/field
               metadata-provider
               (meta/id :people :birth-date)))))))

(deftest ^:parallel equality-test
  (is (= (lib/composed-metadata-provider meta/metadata-provider)
         (lib/composed-metadata-provider meta/metadata-provider))))

(deftest ^:parallel setting-nil-vs-not-found-test
  (testing "Composed metadata provider should distinguish nil setting value from not-found"
    (let [provider-with-nil-setting    (lib.tu/mock-metadata-provider
                                        {:settings {:some-setting nil}})
          provider-without-setting     (lib.tu/mock-metadata-provider
                                        {:settings {}})
          provider-with-actual-setting (lib.tu/mock-metadata-provider
                                        {:settings {:some-setting "actual-value"}})]
      (testing "Individual providers work correctly"
        (is (nil? (lib.metadata/setting provider-with-nil-setting :some-setting)))
        (is (nil? (lib.metadata/setting provider-without-setting :some-setting)))
        (is (= "actual-value" (lib.metadata/setting provider-with-actual-setting :some-setting))))
      
      (testing "Composed provider should return nil when first provider explicitly has nil"
        (let [composed (lib/composed-metadata-provider 
                        provider-with-nil-setting 
                        provider-with-actual-setting)]
          ;; This should return nil (from first provider), not "actual-value" (from second)
          ;; With the fix, the composed provider should recognize that the first provider
          ;; explicitly has nil for this setting and return nil instead of continuing
          (is (nil? (lib.metadata/setting composed :some-setting)))))
      
      (testing "Composed provider should return value from later provider when first doesn't have it"
        (let [composed (lib/composed-metadata-provider 
                        provider-without-setting 
                        provider-with-actual-setting)]
          ;; This should return "actual-value" from the second provider
          (is (= "actual-value" (lib.metadata/setting composed :some-setting)))))))))
