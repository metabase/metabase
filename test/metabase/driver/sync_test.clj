(ns metabase.driver.sync-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.postgres]
   [metabase.driver.sync :as driver.s]
   [metabase.workspaces.core :as workspaces])
  (:import
   (clojure.lang ExceptionInfo)))

(comment metabase.driver.postgres/keep-me) ; this is used by [[schema-filter-NPE-test]] below

(deftest ^:parallel schema-filter-test
  (doseq [[test-kind expect-match? schema-name inclusion-filters exclusion-filters]
          [["nil filters" true "foo" nil nil]
           ["blank filters" true "foo" "" ""]
           ["simple inclusion filter (include)" true "foo" "foo" ""]
           ["simple inclusion filter (exclude)" false "bar" "foo" ""]
           ["wildcard inclusion filter" true "foo" "f*" ""]
           ["simple exclusion filter (include)" true "bar" "" "foo"]
           ["simple exclusion filter (exclude)" false "foo" "" "foo"]
           ["wildcard exclusion filter" true "foo" "" "b*"]
           ["inclusion filter with commas and wildcards (include)" true "foo" "bar,f*,baz" ""]
           ["inclusion filter with commas and wildcards (exclude)" false "ban" "bar,f*,baz" ""]
           ["exclusion filter with commas and wildcards (include)" true "foo" "" "ba*,fob"]
           ["exclusion filter with commas and wildcards (exclude)" false "foo" "" "bar,baz,fo*"]
           ["multiple inclusion with whitespace trimming" true "bar" "  foo  ,  bar \n  ,  \nbaz  " ""]]]
    (testing (str "include-schema? works as expected for " test-kind)
      (is (= expect-match? (driver.s/include-schema? inclusion-filters exclusion-filters schema-name))))
    (testing "include-schema? throws an exception if both patterns are specified"
      (is (thrown-with-msg?
           ExceptionInfo
           #"Inclusion and exclusion patterns cannot both be specified"
           (driver.s/include-schema? "foo" "bar" "whatever"))))))

(deftest ^:parallel schema-filter-NPE-test
  (testing "Schema filter function should not NPE if you pass in a `nil` schema (#38156)"
    (testing "inclusion -- don't include nil schemas"
      (let [db {:lib/type :metadata/database
                :details  {:schema-filters-type     "inclusion"
                           :schema-filters-patterns "x"}
                :engine   :postgres}]
        (is (not (driver.s/include-schema? db nil)))))
    (testing "exclusion -- don't exclude nil schemas"
      (let [db {:lib/type :metadata/database
                :details  {:schema-filters-type     "exclusion"
                           :schema-filters-patterns "x"}
                :engine   :postgres}]
        (is (driver.s/include-schema? db nil))))))

(deftest ^:parallel workspace-isolation-schemas-skipped-on-parent-instance-test
  (testing "On parent (non-workspace-mode) instances, include-schema? rejects mb__isolation_* (GHY-3489)"
    ;; `with-redefs` is unsafe in :parallel, but `workspace-mode?` is an EE
    ;; defenterprise whose OSS fallback returns false. Test ns is OSS, so the
    ;; default already simulates parent-instance behavior without redefs.
    (testing "with no user-configured filters (sync everything)"
      (is (not (driver.s/include-schema? nil nil "mb__isolation_abc_42"))
          "iso schema must be skipped on parent even when no filters are set")
      (is (driver.s/include-schema? nil nil "public")
          "non-iso schemas pass through unchanged"))
    (testing "with broad inclusion filters that WOULD match the iso prefix"
      (is (not (driver.s/include-schema? "mb*" nil "mb__isolation_abc_42"))
          "iso skip overrides an inclusion pattern that would otherwise match")
      (is (driver.s/include-schema? "mb*" nil "mb_user_schema")
          "user schemas starting with `mb_` (but NOT the iso prefix) still pass"))
    (testing "with exclusion filters covering OTHER schemas"
      (is (not (driver.s/include-schema? nil "public" "mb__isolation_abc_42"))
          "iso skip applies in addition to user-configured exclusions")
      (is (driver.s/include-schema? nil "other" "public")
          "non-iso schemas remain subject to user exclusion patterns only"))
    (testing "exact prefix match required"
      ;; The check uses `str/starts-with?` on the exact `mb__isolation_` prefix.
      ;; Customer schemas that happen to start with `mb_` (single underscore) or
      ;; `mb__` are safe -- only the specific iso prefix is skipped.
      (is (driver.s/include-schema? nil nil "mb_isolation_typo")
          "single-underscore variant is NOT the iso prefix; passes through")
      (is (driver.s/include-schema? nil nil "mb__customer_data")
          "double-underscore but different suffix is NOT the iso prefix; passes through"))))

(deftest ^:synchronized workspace-isolation-schemas-synced-on-child-instance-test
  ;; `with-redefs` to flip workspace-mode? to true -- not :parallel-safe.
  ;; Wrapping ns ^:synchronous would be cleaner but this single test stays local.
  (testing "On child (workspace-mode) instances, include-schema? DOES sync mb__isolation_* (GHY-3489)"
    (with-redefs [workspaces/workspace-mode? (constantly true)]
      (is (driver.s/include-schema? nil nil "mb__isolation_abc_42")
          "iso schemas must be synced on child -- table remapping needs them")
      (is (driver.s/include-schema? "mb*" nil "mb__isolation_abc_42")
          "inclusion patterns continue to apply normally on child")
      (is (not (driver.s/include-schema? nil "mb*" "mb__isolation_abc_42"))
          "exclusion patterns continue to apply normally on child -- user can still opt out"))))
