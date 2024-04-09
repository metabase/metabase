(ns metabase.lib.metadata.composed-provider-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

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
