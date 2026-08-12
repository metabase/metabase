(ns metabase.driver.sql.normalize-test
  (:require
   [clojure.test :refer [deftest is testing]]
   ;; loaded for its `normalize-unquoted-name` implementation, which is one of the two this asserts over
   [metabase.driver.h2]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.util :as u]))

(def ^:private sample-names
  ["orders" "PRODUCTS" "MixedCase" "École" "snake_case_1" "x"])

(deftest normalize-unquoted-name-is-a-pure-case-fold-test
  (testing "Every implementation must only change a name's case.

           `metabase.lib-be.metadata.jvm/tables-by-name` narrows a table lookup with SQL `lower(name)` and then lets
           `metabase.sql-tools.common/find-table-or-transform` decide using this multimethod. That is only sound while
           the narrowed set is a superset of what the precise match accepts, which holds exactly when normalization is
           a pure case fold: anything else -- trimming, stripping characters, substituting them -- makes the prefilter
           drop rows that would have matched, and a dependency silently disappears.

           Each implementation is invoked directly rather than through driver dispatch, so this needs no driver to be
           registered or initialised and covers every impl loaded in the run."
    (let [impls (methods sql.normalize/normalize-unquoted-name)]
      (testing "the implementations under test were actually loaded, so this cannot pass by covering nothing"
        (is (<= 2 (count impls)))
        (is (= #{:sql :h2} (set (keys impls)))
            "a new implementation appeared: confirm it is a pure case fold, then extend this assertion"))
      (doseq [[dispatch-value impl] impls
              name*                 sample-names]
        (testing (format "%s with %s" dispatch-value (pr-str name*))
          (is (= (u/lower-case-en name*)
                 (u/lower-case-en (impl dispatch-value name*)))
              "normalization changed more than the name's case, so tables-by-name will silently drop matches"))))))
