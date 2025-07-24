(ns metabase.lib.metadata.composed-provider-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
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

(deftest ^:parallel caching-test
  (testing "Should implement CachedMetadataProvider methods"
    (let [mp (lib/composed-metadata-provider
              meta/metadata-provider
              (lib.metadata.cached-provider/cached-metadata-provider
               meta/metadata-provider))]
      (lib.metadata.protocols/cache-value! mp [::x] 100)
      (is (= 100
             (lib.metadata.protocols/cached-value mp [::x] ::not-found))))))
