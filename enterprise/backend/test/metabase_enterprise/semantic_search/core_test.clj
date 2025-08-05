(ns metabase-enterprise.semantic-search.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (compose-fixtures
                     (fixtures/initialize :db)
                     #'semantic.tu/once-fixture))

(deftest appdb-available-with-semantic
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (semantic.tu/cleanup-index-metadata! semantic.tu/db semantic.tu/mock-index-metadata)
      (search/init-index! {:force-reset? false, :re-populate? false})
      (is (search.engine/supported-engine? :search.engine/appdb)))))
