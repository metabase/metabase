(ns metabase.search.in-place.legacy-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.in-place.legacy :as legacy]))

(deftest table-projection-includes-data-authority-test
  (testing "the in-place table projection selects the real data_authority column (not a NULL pad) so it
            reaches search results on the no-index fallback path (BOT-1570)"
    (is (some #{[:table.data_authority :data_authority]}
              (#'legacy/select-clause-for-model "table")))))
