(ns metabase.xrays.domain-entities.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.test-metadata :as meta]
   [metabase.xrays.domain-entities.core :as de]
   [metabase.xrays.test-util.domain-entities :as test.de]))

(deftest ^:parallel satisfies-requierments?-test
  (is (de/satisfies-requirements? meta/metadata-provider
                                  (meta/table-metadata :venues)
                                  (test.de/test-domain-entity-specs "Venues"))))

(deftest ^:parallel best-match-test
  (testing "Do we correctly pick the best (most specific and most defined) candidate"
    (is (= "Venues"
           (-> test.de/test-domain-entity-specs vals (#'de/best-match) :domain-entity/name)))))

(deftest ^:parallel instantiate-snippets-test
  (testing "Do all the MBQL snippets get instantiated correctly"
    (test.de/with-test-domain-entity-specs
      (is (= {:domain-entity/metrics             {"Avg Price" {:domain-entity.metric/name        "Avg Price"
                                                               :domain-entity.metric/aggregation [:avg (meta/field-metadata :venues :price)]}}
              :domain-entity/segments            {}
              :domain-entity/breakout-dimensions [(meta/field-metadata :venues :category-id)]
              :domain-entity/dimensions          (into {} (for [field-name (meta/fields :venues)
                                                                :let       [field (meta/field-metadata :venues field-name)]]
                                                            [(#'de/field->dimension-type field) field]))
              :domain-entity/type                :DomainEntity/Venues
              :domain-entity/source-table        (meta/table-metadata :venues)
              :domain-entity/name                "Venues"}
             (de/domain-entity-for-table meta/metadata-provider (meta/table-metadata :venues)))))))
