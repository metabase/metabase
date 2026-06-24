(ns metabase.agent-lib.representations.repair-test
  "Tests for the LLM-input repair pass."
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.agent-lib.representations :as repr]
   [metabase.agent-lib.representations.repair :as repair]
   [metabase.lib.test-util :as lib.tu]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Mock metadata providers
;;; ============================================================

(def ^:private trivial-mp
  "A metadata provider with a single database, no tables. Sufficient to satisfy the repair
  signature for shape-only tests - the implicit-join pass will no-op because it can't resolve
  the source-table."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}}))

(def ^:private mp-fks
  "3-table MP: ORDERS → PRODUCTS, ORDERS → USERS."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}
               {:id 30 :name "USERS"    :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"         :table-id 10 :base-type :type/Integer}
               {:id 101 :name "PRODUCT_ID" :table-id 10 :base-type :type/Integer :fk-target-field-id 200}
               {:id 102 :name "USER_ID"    :table-id 10 :base-type :type/Integer :fk-target-field-id 300}
               {:id 200 :name "ID"         :table-id 20 :base-type :type/Integer}
               {:id 201 :name "CATEGORY"   :table-id 20 :base-type :type/Text}
               {:id 300 :name "ID"         :table-id 30 :base-type :type/Integer}
               {:id 301 :name "NAME"       :table-id 30 :base-type :type/Text}]}))

(def ^:private mp-ambiguous
  "Two FKs from ORDERS to PRODUCTS."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"             :table-id 10 :base-type :type/Integer}
               {:id 101 :name "PRODUCT_ID"     :table-id 10 :base-type :type/Integer :fk-target-field-id 200}
               {:id 103 :name "ALT_PRODUCT_ID" :table-id 10 :base-type :type/Integer :fk-target-field-id 200}
               {:id 200 :name "ID"             :table-id 20 :base-type :type/Integer}
               {:id 201 :name "CATEGORY"       :table-id 20 :base-type :type/Text}]}))

(def ^:private mp-no-fk
  "ORDERS + PRODUCTS exist but with no FK between them."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"       :table-id 10 :base-type :type/Integer}
               {:id 200 :name "ID"       :table-id 20 :base-type :type/Integer}
               {:id 201 :name "CATEGORY" :table-id 20 :base-type :type/Text}]}))

(def ^:private mp-via-join
  "3-table MP with a hop-through-PRODUCTS shape:
     ORDERS  (no FK to CATEGORIES)
     PRODUCTS → CATEGORIES via PRODUCTS.CATEGORY_ID
     CATEGORIES.NAME
   ORDERS → PRODUCTS exists too (so the prompt's PRODUCTS join makes sense). Used to exercise
   Pass 3.5 (`source-field-join-alias` auto-fill)."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"     :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS"   :schema "PUBLIC" :db-id 1}
               {:id 40 :name "CATEGORIES" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"          :table-id 10 :base-type :type/Integer}
               {:id 101 :name "PRODUCT_ID"  :table-id 10 :base-type :type/Integer :fk-target-field-id 200}
               {:id 200 :name "ID"          :table-id 20 :base-type :type/Integer}
               {:id 202 :name "CATEGORY_ID" :table-id 20 :base-type :type/Integer :fk-target-field-id 400}
               {:id 400 :name "ID"          :table-id 40 :base-type :type/Integer}
               {:id 401 :name "NAME"        :table-id 40 :base-type :type/Text}]}))

(def ^:private mp-via-two-joins
  "Variant of `mp-via-join` where TWO different joined tables (PRODUCTS and PRODUCTS_ALT) each
   reach CATEGORIES via a single FK. Used to exercise the `:ambiguous-fk-via-join` error
   path."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"       :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS"     :schema "PUBLIC" :db-id 1}
               {:id 21 :name "PRODUCTS_ALT" :schema "PUBLIC" :db-id 1}
               {:id 40 :name "CATEGORIES"   :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"          :table-id 10 :base-type :type/Integer}
               {:id 200 :name "ID"          :table-id 20 :base-type :type/Integer}
               {:id 202 :name "CATEGORY_ID" :table-id 20 :base-type :type/Integer :fk-target-field-id 400}
               {:id 210 :name "ID"          :table-id 21 :base-type :type/Integer}
               {:id 212 :name "CATEGORY_ID" :table-id 21 :base-type :type/Integer :fk-target-field-id 400}
               {:id 400 :name "ID"          :table-id 40 :base-type :type/Integer}
               {:id 401 :name "NAME"        :table-id 40 :base-type :type/Text}]}))

;;; ============================================================
;;; Pass 1 - insert `{}` options on clauses
;;; ============================================================

(deftest ^:parallel insert-options-on-bare-clause-test
  (testing "clause without options gets {} inserted"
    (is (= ["count" {}]
           (repair/repair trivial-mp ["count"])))
    (is (= ["sum" {} ["field" {} ["Sample" "S" "T" "F"]]]
           (repair/repair trivial-mp ["sum" ["field" ["Sample" "S" "T" "F"]]])))))

(deftest ^:parallel do-not-corrupt-fk-paths-test
  (testing "FK paths (all-string vectors) are left alone"
    (let [fk ["Sample" "PUBLIC" "TBL" "COL"]]
      (is (= fk (repair/repair trivial-mp fk))))
    (let [fk ["Sample" nil "TBL" "COL"]]
      (is (= fk (repair/repair trivial-mp fk)))))
  (testing "clause containing an FK in its arg position doesn't touch the FK shape"
    (let [input  ["field" ["Sample" "PUBLIC" "TBL" "COL"]]
          output (repair/repair trivial-mp input)]
      (is (= ["field" {} ["Sample" "PUBLIC" "TBL" "COL"]] output)))))

(deftest ^:parallel nested-clause-repair-test
  (testing "options filled in at every nesting level"
    (let [input  ["and"
                  ["="
                   ["field" ["Sample" "S" "T" "A"]]
                   10]
                  [">"
                   ["field" ["Sample" "S" "T" "B"]]
                   5]]
          output (repair/repair trivial-mp input)]
      (is (= ["and" {}
              ["=" {} ["field" {} ["Sample" "S" "T" "A"]] 10]
              [">" {} ["field" {} ["Sample" "S" "T" "B"]] 5]]
             output)))))

(deftest ^:parallel nil-options-replaced-test
  (testing "nil in options slot is replaced with {}"
    ;; clj-yaml sometimes hands us nil for `~` where we'd want {}
    (is (= ["count" {}] (repair/repair trivial-mp ["count" nil])))))

;;; ============================================================
;;; Pass 1.7 - unwrap nested `[field ... [field ... FK]]` clauses
;;;
;;; LLMs sometimes write a field clause *wrapping another field clause*, e.g.
;;;
;;;   ["field" {"temporal-unit" "month"} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
;;;
;;; thinking of it as "apply granularity to this field". The intent is always a single
;;; `field` clause with the merged options (outer wins on conflicts). We collapse such
;;; nests into one clause so downstream FK resolution sees a flat
;;; `["field" {<merged opts>} [<FK>]]`.
;;; ============================================================

(deftest ^:parallel unwrap-nested-field-test
  (testing "outer field wrapping an inner field with an FK is collapsed"
    (let [input  ["field" {"temporal-unit" "month"}
                  ["field" {} ["Sample" "PUBLIC" "ACCOUNTS" "CANCELED_AT"]]]
          output (repair/repair trivial-mp input)]
      (is (= ["field" {"temporal-unit" "month"}
              ["Sample" "PUBLIC" "ACCOUNTS" "CANCELED_AT"]]
             output)))))

(deftest ^:parallel unwrap-nested-field-test-2
  (testing "outer options win on conflict (outer temporal-unit overrides inner)"
    (let [input  ["field" {"temporal-unit" "month"}
                  ["field" {"temporal-unit" "day"} ["Sample" "PUBLIC" "T" "COL"]]]
          output (repair/repair trivial-mp input)]
      (is (= ["field" {"temporal-unit" "month"} ["Sample" "PUBLIC" "T" "COL"]]
             output)))))

(deftest ^:parallel unwrap-nested-field-test-3
  (testing "inner-only options are preserved when outer doesn't set them"
    (let [input  ["field" {"temporal-unit" "month"}
                  ["field" {"source-field" ["Sample" "PUBLIC" "T" "FK"]}
                   ["Sample" "PUBLIC" "T" "COL"]]]
          output (repair/repair trivial-mp input)]
      (is (= ["field" {"temporal-unit" "month"
                       "source-field" ["Sample" "PUBLIC" "T" "FK"]}
              ["Sample" "PUBLIC" "T" "COL"]]
             output)))))

(deftest ^:parallel unwrap-nested-field-test-4
  (testing "outer empty opts + nested field: outer gets inner's opts"
    (let [input  ["field" {}
                  ["field" {"temporal-unit" "day"} ["Sample" "PUBLIC" "T" "COL"]]]
          output (repair/repair trivial-mp input)]
      (is (= ["field" {"temporal-unit" "day"} ["Sample" "PUBLIC" "T" "COL"]]
             output)))))

(deftest ^:parallel unwrap-nested-field-test-5
  (testing "nested inside a larger clause (e.g. breakout of a stage) is collapsed"
    (let [input  ["and" {}
                  ["=" {}
                   ["field" {"temporal-unit" "month"}
                    ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
                   "Bikes"]]
          output (repair/repair trivial-mp input)]
      (is (= ["and" {}
              ["=" {}
               ["field" {"temporal-unit" "month"} ["Sample" "PUBLIC" "T" "COL"]]
               "Bikes"]]
             output)))))

(deftest ^:parallel unwrap-nested-field-test-6
  (testing "triple-nested field collapses to one"
    (let [input  ["field" {"temporal-unit" "month"}
                  ["field" {}
                   ["field" {"source-field" ["Sample" "PUBLIC" "T" "FK"]}
                    ["Sample" "PUBLIC" "T" "COL"]]]]
          output (repair/repair trivial-mp input)]
      (is (= ["field" {"temporal-unit" "month"
                       "source-field" ["Sample" "PUBLIC" "T" "FK"]}
              ["Sample" "PUBLIC" "T" "COL"]]
             output)))))

(deftest ^:parallel unwrap-nested-field-test-7
  (testing "non-nested `field` clauses are left alone"
    (let [input  ["field" {"temporal-unit" "month"} ["Sample" "PUBLIC" "T" "COL"]]]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel unwrap-nested-field-test-8
  (testing "cross-stage string-column field inside outer field is preserved"
    ;; [field {temporal-unit ...} [field {} "some-col-name"]] is the same bug pattern but
    ;; with a cross-stage (string) target. Still unwrap.
    (let [input  ["field" {"temporal-unit" "month"}
                  ["field" {} "MY_COLUMN"]]
          output (repair/repair trivial-mp input)]
      (is (= ["field" {"temporal-unit" "month"} "MY_COLUMN"]
             output)))))

;;; ============================================================
;;; Pass 1.75 - strip stray double-quotes from field-reference targets
;;; ============================================================

(deftest ^:parallel dequote-portable-fk-column-test
  (testing "a double-quoted column segment in a portable FK is stripped"
    (let [input  ["field" {} ["Sample" "PUBLIC" "ORDERS" "\"STATUS\""]]
          output (repair/repair trivial-mp input)]
      (is (= ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] output)))))

(deftest ^:parallel dequote-leaves-cross-stage-strings-to-resolution-aware-pass-test
  (testing "a bare cross-stage string target is NOT touched by this pass (the resolution-aware
           cross-stage pass owns that case and only strips when it resolves)"
    (let [input  ["field" {} "\"campaign_name\""]
          output (repair/repair trivial-mp input)]
      (is (= ["field" {} "\"campaign_name\""] output)))))

(deftest ^:parallel dequote-leaves-filter-literals-untouched-test
  (testing "only field targets are dequoted; a quoted filter literal is preserved verbatim"
    (let [input  ["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "\"STATUS\""]] "\"paid\""]
          output (repair/repair trivial-mp input)]
      (is (= ["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "\"paid\""] output)))))

(deftest ^:parallel dequote-is-idempotent-test
  (testing "dequoting is a fixed point"
    (let [input ["field" {} ["Sample" "PUBLIC" "ORDERS" "\"STATUS\""]]
          once  (repair/repair trivial-mp input)]
      (is (= once (repair/repair trivial-mp once)))))
  (testing "an already-bare name is left alone"
    (let [input ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]]]
      (is (= input (repair/repair trivial-mp input))))))

;;; ============================================================
;;; Pass 1.81 - rewrite operator-name aliases to canonical lib heads
;;; ============================================================

(deftest ^:parallel rewrite-shell-style-comparison-aliases-test
  (testing "shell-style comparison operators rewrite to canonical"
    (let [field ["field" {} ["Sample" "PUBLIC" "X" "A"]]]
      (doseq [[alias canonical] [["eq"  "="]
                                 ["ne"  "!="]
                                 ["lt"  "<"]
                                 ["le"  "<="]
                                 ["lte" "<="]
                                 ["gt"  ">"]
                                 ["ge"  ">="]
                                 ["gte" ">="]]]
        (is (= [canonical {} field 10]
               (repair/repair trivial-mp [alias {} field 10]))
            (str alias " -> " canonical))))))

(deftest ^:parallel rewrite-verbose-comparison-aliases-test
  (testing "verbose comparison spellings"
    (let [field ["field" {} ["Sample" "PUBLIC" "X" "A"]]]
      (is (= ["=" {} field 10]
             (repair/repair trivial-mp ["equals" {} field 10])))
      (is (= ["!=" {} field 10]
             (repair/repair trivial-mp ["not-equals" {} field 10]))))))

(deftest ^:parallel rewrite-aggregation-aliases-test
  (testing "aggregation lib-renames"
    (let [field ["field" {} ["Sample" "PUBLIC" "X" "A"]]
          pred  ["=" {} field 1]]
      (is (= ["count-where" {} pred]
             (repair/repair trivial-mp ["count-if" {} pred])))
      (is (= ["var" {} field]
             (repair/repair trivial-mp ["variance" {} field])))
      (is (= ["stddev" {} field]
             (repair/repair trivial-mp ["stddev-pop" {} field])))
      (is (= ["distinct" {} field]
             (repair/repair trivial-mp ["count-distinct" {} field])))
      (is (= ["distinct" {} field]
             (repair/repair trivial-mp ["distinct-count" {} field]))))))

(deftest ^:parallel rewrite-temporal-and-null-aliases-test
  (testing "temporal & null lib-renames"
    (let [field ["field" {} ["Sample" "PUBLIC" "X" "DATE"]]]
      (is (= ["relative-datetime" {} -7 "day"]
             (repair/repair trivial-mp ["relative-date" {} -7 "day"])))
      (is (= ["datetime-diff" {} field field "day"]
             (repair/repair trivial-mp ["temporal-diff" {} field field "day"])))
      (is (= ["not-null" {} field]
             (repair/repair trivial-mp ["is-not-null" {} field]))))))

(deftest ^:parallel operator-alias-case-insensitive-test
  (testing "alias matching is case-insensitive"
    (let [field ["field" {} ["Sample" "PUBLIC" "X" "A"]]]
      (doseq [variant ["EQ" "Eq" "EQUALS" "Equals"]]
        (is (= ["=" {} field 10]
               (repair/repair trivial-mp [variant {} field 10]))
            variant)))))

(deftest ^:parallel operator-alias-canonical-untouched-test
  (testing "already-canonical heads are not double-rewritten (cheap idempotency)"
    (let [field ["field" {} ["Sample" "PUBLIC" "X" "A"]]]
      (doseq [canonical ["=" "!=" "<" "<=" ">" ">="]]
        (let [input [canonical {} field 10]]
          (is (= input (repair/repair trivial-mp input)) canonical))))))

(deftest ^:parallel operator-alias-nested-test
  (testing "alias nested deep inside a tree gets rewritten"
    (let [field ["field" {} ["Sample" "PUBLIC" "X" "A"]]
          input ["and" {}
                 ["eq" {} field 1]
                 ["gt" {} field 5]]]
      (is (= ["and" {}
              ["=" {} field 1]
              [">" {} field 5]]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel operator-alias-fk-path-untouched-test
  (testing "a column literally named 'eq' or 'gt' inside an FK path is NOT rewritten"
    (is (= ["field" {} ["Sample" "PUBLIC" "T" "eq"]]
           (repair/repair trivial-mp ["field" {} ["Sample" "PUBLIC" "T" "eq"]])))
    (is (= ["field" {} ["Sample" "PUBLIC" "T" "gt"]]
           (repair/repair trivial-mp ["field" {} ["Sample" "PUBLIC" "T" "gt"]])))))

;;; ============================================================
;;; Pass 1.8 - rewrite temporal-bucket-extraction aliases to canonical names
;;; ============================================================

(deftest ^:parallel rewrite-temporal-bucket-aliases-test
  (testing "each alias rewrites to its canonical lib head"
    (doseq [[alias canonical] [["dayofweek"       "get-day-of-week"]
                               ["day-of-week"     "get-day-of-week"]
                               ["hour-of-day"     "get-hour"]
                               ["month-of-year"   "get-month"]
                               ["quarter-of-year" "get-quarter"]]]
      (let [input  [alias {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]]
        (is (= [canonical {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
               (repair/repair trivial-mp input))
            (str alias " -> " canonical)))))
  (testing "alias appearing nested inside another clause is rewritten too"
    (let [input  ["=" {}
                  ["day-of-week" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
                  3]]
      (is (= ["=" {}
              ["get-day-of-week" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
              3]
             (repair/repair trivial-mp input)))))
  (testing "canonical heads are left alone (not double-rewritten)"
    (let [input  ["get-day-of-week" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]]
      (is (= input (repair/repair trivial-mp input)))))
  (testing "alias with missing options is also handled (Pass 1 fills the {} first)"
    (let [input  ["day-of-week" ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]]
      (is (= ["get-day-of-week" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
             (repair/repair trivial-mp input)))))
  (testing "unrelated heads matching only by string substring are not touched"
    ;; A column named "day-of-week" inside an FK path is not a clause head; we won't
    ;; touch it.
    (let [input  ["field" {} ["Sample" "PUBLIC" "T" "day-of-week"]]]
      (is (= input (repair/repair trivial-mp input))))))

;;; ============================================================
;;; Pass 1.85 - rewrite order-by direction aliases to canonical asc/desc
;;; ============================================================

(deftest ^:parallel rewrite-direction-aliases-test
  (testing "long-form aliases rewrite to canonical short form"
    (is (= ["asc" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
           (repair/repair trivial-mp
                          ["ascending" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]])))
    (is (= ["desc" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
           (repair/repair trivial-mp
                          ["descending" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]))))
  (testing "uppercase / mixed-case variants rewrite to canonical lowercase"
    (doseq [variant ["ASC" "Asc" "ASCENDING" "Ascending"]]
      (is (= ["asc" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
             (repair/repair trivial-mp
                            [variant {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]))
          variant))
    (doseq [variant ["DESC" "Desc" "DESCENDING" "Descending"]]
      (is (= ["desc" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
             (repair/repair trivial-mp
                            [variant {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]))
          variant)))
  (testing "already-canonical asc/desc clauses pass through unchanged"
    (let [asc  ["asc" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]
          desc ["desc" {} ["field" {} ["Sample" "PUBLIC" "T" "COL"]]]]
      (is (= asc  (repair/repair trivial-mp asc)))
      (is (= desc (repair/repair trivial-mp desc)))))
  (testing "alias appearing inside an order-by stage list is rewritten"
    (let [stage  {"lib/type"     "mbql.stage/mbql"
                  "source-table" ["Sample" "PUBLIC" "ORDERS"]
                  "order-by"     [["ASCENDING" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]]
                                  ["descending" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]]]}
          input  {"lib/type" "mbql/query" "database" "Sample" "stages" [stage]}
          output (repair/repair trivial-mp input)
          [a d]  (get-in output ["stages" 0 "order-by"])]
      (is (= "asc"  (first a)))
      (is (= "desc" (first d)))))
  (testing "non-direction strings are not touched"
    ;; A column literally named "asc" inside an FK path stays put.
    (let [input ["field" {} ["Sample" "PUBLIC" "T" "asc"]]]
      (is (= input (repair/repair trivial-mp input))))
    ;; A scalar string "ASC" by itself (not a clause) is untouched.
    (is (= "ASC" (repair/repair trivial-mp "ASC")))))

;;; ============================================================
;;; Pass 1.84 - normalise alternative case / if argument shapes
;;; ============================================================

(deftest ^:parallel case-three-bare-args-test
  (testing "[case {} pred then else] -> canonical pairs + default"
    (let [pred  ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          input ["case" {} pred 100 0]]
      (is (= ["case" {} [[pred 100]] 0]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel case-two-bare-args-test
  (testing "[case {} pred then] (no default) -> canonical pairs only"
    (let [pred  ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          input ["case" {} pred 100]]
      (is (= ["case" {} [[pred 100]]]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel case-branch-pairs-as-separate-args-test
  (testing "branch pairs as separate args + trailing default"
    (let [p1 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          p2 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 2]
          input ["case" {} [p1 100] [p2 200] 0]]
      (is (= ["case" {} [[p1 100] [p2 200]] 0]
             (repair/repair trivial-mp input)))))
  (testing "branch pairs as separate args without default"
    (let [p1 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          p2 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 2]
          input ["case" {} [p1 100] [p2 200]]]
      (is (= ["case" {} [[p1 100] [p2 200]]]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel case-flat-alternating-args-test
  (testing "flat even-arity alternating: [case {} p1 t1 p2 t2]"
    (let [p1 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          p2 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 2]
          input ["case" {} p1 100 p2 200]]
      (is (= ["case" {} [[p1 100] [p2 200]]]
             (repair/repair trivial-mp input)))))
  (testing "flat odd-arity alternating: [case {} p1 t1 p2 t2 default]"
    (let [p1 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          p2 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 2]
          input ["case" {} p1 100 p2 200 0]]
      (is (= ["case" {} [[p1 100] [p2 200]] 0]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel case-trailing-else-branch-test
  (testing "trailing [\"else\" x] inside the pairs vector is stripped, x becomes default"
    (let [p1 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          input ["case" {} [[p1 100] ["else" 0]]]]
      (is (= ["case" {} [[p1 100]] 0]
             (repair/repair trivial-mp input)))))
  (testing "trailing else branch + explicit fallback: pair-trailing-else takes precedence"
    ;; In practice this would be malformed, but we still normalise it without throwing.
    ;; The trailing else inside the vector wins; the explicit fallback is dropped.
    (let [p1 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          input ["case" {} [[p1 100] ["else" 0]] -1]]
      (is (= ["case" {} [[p1 100]] 0]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel case-already-canonical-test
  (testing "canonical [case {} [[p t]]] is unchanged"
    (let [p1 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          input ["case" {} [[p1 100]]]]
      (is (= input (repair/repair trivial-mp input)))))
  (testing "canonical with default unchanged"
    (let [p1 ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          input ["case" {} [[p1 100]] 0]]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel case-if-alias-test
  (testing "`if` alias is normalised the same way as case"
    (let [pred  ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]
          input ["if" {} pred 100 0]]
      (is (= ["if" {} [[pred 100]] 0]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel case-idempotent-test
  (testing "normalisation is idempotent"
    (let [pred ["=" {} ["field" {} ["Sample" "PUBLIC" "X" "A"]] 1]]
      (doseq [input [["case" {} pred 100 0]
                     ["case" {} pred 100]
                     ["case" {} [pred 100] [pred 200] 0]
                     ["case" {} pred 100 pred 200]
                     ["case" {} [[pred 100] ["else" 0]]]]]
        (let [once  (repair/repair trivial-mp input)
              twice (repair/repair trivial-mp once)]
          (is (= once twice) (str "input: " input)))))))

;;; ============================================================
;;; Pass 1.82 - normalise list-valued comparison/in clauses to flat positional args
;;; ============================================================

(deftest ^:parallel splat-in-values-list-test
  (testing "[in {} lhs [v1 v2 v3]] splats values into positional args"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          input ["in" {} field ["alice" "bob" "carol"]]]
      (is (= ["in" {} field "alice" "bob" "carol"]
             (repair/repair trivial-mp input)))))
  (testing "[not-in {} lhs [v1 v2]] splats too"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          input ["not-in" {} field ["banned1" "banned2"]]]
      (is (= ["not-in" {} field "banned1" "banned2"]
             (repair/repair trivial-mp input)))))
  (testing "already-flat in clause is left alone"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          input ["in" {} field "alice" "bob" "carol"]]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel convert-eq-with-list-to-in-test
  (testing "[= {} lhs [v1 v2 v3]] becomes [in {} lhs v1 v2 v3]"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          input ["=" {} field ["alice" "bob"]]]
      (is (= ["in" {} field "alice" "bob"]
             (repair/repair trivial-mp input)))))
  (testing "[!= {} lhs [v1 v2 v3]] becomes [not-in {} lhs v1 v2 v3]"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          input ["!=" {} field ["alice" "bob"]]]
      (is (= ["not-in" {} field "alice" "bob"]
             (repair/repair trivial-mp input)))))
  (testing "[= {} lhs scalar] is left alone"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          input ["=" {} field "alice"]]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel in-with-clause-rhs-untouched-test
  (testing "a clause-shaped rhs (e.g. nested expression) is not splatted"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "CREATED_AT"]]
          abs   ["absolute-datetime" {} "2024-01-01" "day"]
          input ["=" {} field abs]]
      (is (= input (repair/repair trivial-mp input)))))
  (testing "a list containing a clause is not splatted (would corrupt structure)"
    ;; This shouldn't actually happen in practice but is the exact case our \"all entries
    ;; are scalar\" predicate guards against.
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "CREATED_AT"]]
          abs   ["absolute-datetime" {} "2024-01-01" "day"]
          input ["in" {} field [abs]]]
      ;; Untouched because abs is a clause, not a scalar.
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel splat-mixed-scalars-test
  (testing "a values list with mixed scalar types splats correctly"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "AGE"]]
          input ["in" {} field [18 21 65]]]
      (is (= ["in" {} field 18 21 65]
             (repair/repair trivial-mp input))))
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "FLAG"]]
          input ["in" {} field [true false]]]
      (is (= ["in" {} field true false]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel splat-idempotent-test
  (testing "splat is idempotent"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]]
      (doseq [input [["in" {} field ["alice" "bob"]]
                     ["not-in" {} field ["x" "y"]]
                     ["=" {} field ["a" "b"]]
                     ["!=" {} field ["a" "b"]]]]
        (let [once  (repair/repair trivial-mp input)
              twice (repair/repair trivial-mp once)]
          (is (= once twice) (str "input: " input)))))))

;;; ============================================================
;;; Pass 1.83 - unwrap boolean wrapper clauses
;;; ============================================================

(deftest ^:parallel unwrap-boolean-wrapper-true-test
  (testing "[true {} x] unwraps to x"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          inner ["=" {} field "alice"]
          input ["true" {} inner]]
      (is (= inner (repair/repair trivial-mp input)))))
  (testing "[true {} <bare-clause-without-options>] still unwraps after Pass 1 fills the
           inner options"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          ;; before repair: ["true" ["=" field "alice"]] (Pass 1 fills both options).
          input ["true" ["=" field "alice"]]]
      (is (= ["=" {} field "alice"] (repair/repair trivial-mp input))))))

(deftest ^:parallel unwrap-boolean-wrapper-false-test
  (testing "[false {} x] rewrites to [not {} x]"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          inner ["=" {} field "alice"]
          input ["false" {} inner]]
      (is (= ["not" {} inner]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel boolean-literal-clauses-untouched-test
  (testing "[true {}] (0-arg boolean literal) is left alone"
    (is (= ["true" {}] (repair/repair trivial-mp ["true" {}]))))
  (testing "[false {}] (0-arg boolean literal) is left alone"
    (is (= ["false" {}] (repair/repair trivial-mp ["false" {}])))))

(deftest ^:parallel boolean-wrapper-mixed-case-test
  (testing "case-insensitive head matching"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          inner ["=" {} field "alice"]]
      (doseq [variant ["TRUE" "True"]]
        (is (= inner (repair/repair trivial-mp [variant {} inner]))
            variant))
      (doseq [variant ["FALSE" "False"]]
        (is (= ["not" {} inner] (repair/repair trivial-mp [variant {} inner]))
            variant)))))

(deftest ^:parallel boolean-wrapper-nested-test
  (testing "nested wrapper clauses unwrap from the inside out"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          inner ["=" {} field "alice"]
          input ["true" {} ["true" {} ["true" {} inner]]]]
      (is (= inner (repair/repair trivial-mp input)))))
  (testing "[false {} [true {} x]] -> [not {} x]"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          inner ["=" {} field "alice"]
          input ["false" {} ["true" {} inner]]]
      (is (= ["not" {} inner] (repair/repair trivial-mp input))))))

;;; ============================================================
;;; Pass 1.86 - wrap bare ISO-date strings as absolute-datetime in between
;;; ============================================================

(deftest ^:parallel wrap-iso-date-bounds-both-bare-test
  (testing "both bounds are bare yyyy-mm-dd strings: both get wrapped"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          input ["between" {} field "2024-01-01" "2024-12-31"]]
      (is (= ["between" {}
              field
              ["absolute-datetime" {} "2024-01-01" "day"]
              ["absolute-datetime" {} "2024-12-31" "day"]]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel wrap-iso-date-bounds-mixed-test
  (testing "one bound already absolute-datetime, the other a bare string: bare side
           gets wrapped"
    (let [field   ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          wrapped ["absolute-datetime" {} "2024-01-01" "day"]
          input   ["between" {} field wrapped "2024-12-31"]]
      (is (= ["between" {}
              field
              wrapped
              ["absolute-datetime" {} "2024-12-31" "day"]]
             (repair/repair trivial-mp input)))))
  (testing "one bound a relative-datetime, the other a bare ISO string: bare side gets
           wrapped (presence of temporal sibling triggers the rule)"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          rel   ["relative-datetime" {} -7 "day"]
          input ["between" {} field rel "2024-12-31"]]
      (is (= ["between" {} field rel
              ["absolute-datetime" {} "2024-12-31" "day"]]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel wrap-iso-date-bounds-numeric-untouched-test
  (testing "both bounds numeric: not wrapped (between also works for numbers)"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
          input ["between" {} field 10 100]]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel wrap-iso-date-bounds-with-time-portion-test
  (testing "yyyy-mm-ddThh:mm:ss bounds also get wrapped"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          input ["between" {} field "2024-06-15T09:00:00" "2024-06-15T18:00:00"]]
      (is (= ["between" {}
              field
              ["absolute-datetime" {} "2024-06-15T09:00:00" "day"]
              ["absolute-datetime" {} "2024-06-15T18:00:00" "day"]]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel wrap-iso-date-bounds-idempotent-test
  (testing "wrapping is idempotent: two wraps == one wrap"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          input ["between" {} field "2024-01-01" "2024-12-31"]
          once  (repair/repair trivial-mp input)
          twice (repair/repair trivial-mp once)]
      (is (= once twice)))))

(deftest ^:parallel wrap-iso-date-bounds-then-swap-test
  (testing "wrap + swap compose: out-of-order bare ISO strings wrap then swap"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          input ["between" {} field "2024-12-31" "2024-01-01"]]
      (is (= ["between" {}
              field
              ["absolute-datetime" {} "2024-01-01" "day"]
              ["absolute-datetime" {} "2024-12-31" "day"]]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel wrap-iso-date-bounds-non-iso-untouched-test
  (testing "random strings (not yyyy-mm-dd shaped) are left alone"
    (let [field ["field" {} ["Sample" "PUBLIC" "X"]]
          input ["between" {} field "hello" "world"]]
      (is (= input (repair/repair trivial-mp input))))))

;;; ============================================================
;;; Pass 1.865 - wrap bare "now" literals in temporal-comparison contexts
;;; ============================================================

(deftest ^:parallel wrap-now-literals-comparison-test
  (testing "`<` between a temporal-bucketed field and bare 'now': now gets wrapped"
    (let [field-with-unit ["field" {"temporal-unit" "day"}
                           ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          input  ["<" {} field-with-unit "now"]]
      (is (= ["<" {} field-with-unit ["now" {}]]
             (repair/repair trivial-mp input)))))
  (testing "`>=` between an absolute-datetime and bare 'now': now gets wrapped"
    (let [abs   ["absolute-datetime" {} "2024-01-01" "day"]
          input [">=" {} abs "now"]]
      (is (= [">=" {} abs ["now" {}]]
             (repair/repair trivial-mp input)))))
  (testing "case-insensitive 'NOW' / mixed case / whitespace get wrapped"
    (let [abs ["absolute-datetime" {} "2024-01-01" "day"]]
      (doseq [variant ["NOW" "Now" " now " "now\n"]]
        (is (= ["=" {} abs ["now" {}]]
               (repair/repair trivial-mp ["=" {} abs variant]))
            variant))))
  (testing "bare 'now' in a non-temporal context (no other temporal operand) is left alone"
    (let [field ["field" {} ["Sample" "PUBLIC" "USERS" "NAME"]]
          input ["=" {} field "now"]]
      (is (= input (repair/repair trivial-mp input)))))
  (testing "already-canonical [now {}] is left alone (idempotency)"
    (let [abs   ["absolute-datetime" {} "2024-01-01" "day"]
          input ["<" {} abs ["now" {}]]]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel wrap-now-literals-between-test
  (testing "between(<temporal-field>, ISO-string, 'now') wraps both bounds"
    (let [field-with-unit ["field" {"temporal-unit" "day"}
                           ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          input  ["between" {} field-with-unit "2024-01-01" "now"]]
      ;; ISO date wrapped (Pass 1.86), bare 'now' wrapped (Pass 1.865).
      (is (= ["between" {}
              field-with-unit
              ["absolute-datetime" {} "2024-01-01" "day"]
              ["now" {}]]
             (repair/repair trivial-mp input)))))
  (testing "between(<numeric-field>, 'now', 'now'): no temporal sibling, leave alone"
    ;; The expression's column is non-temporal and bare 'now' is the only thing in sight;
    ;; we don't have evidence this is a temporal context.
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
          input ["between" {} field "now" "now"]]
      (is (= input (repair/repair trivial-mp input))))))

;;; ============================================================
;;; Pass 1.87 - swap out-of-order between bounds (literal scalars only)
;;; ============================================================

(deftest ^:parallel swap-between-bounds-numeric-test
  (testing "numeric lower > upper is swapped"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
          input ["between" {} field 100 10]]
      (is (= ["between" {} field 10 100]
             (repair/repair trivial-mp input)))))
  (testing "numeric lower < upper is left alone"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
          input ["between" {} field 10 100]]
      (is (= input (repair/repair trivial-mp input)))))
  (testing "numeric lower == upper is left alone"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
          input ["between" {} field 42 42]]
      (is (= input (repair/repair trivial-mp input)))))
  (testing "swap is idempotent"
    (let [field   ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
          input   ["between" {} field 100 10]
          once    (repair/repair trivial-mp input)
          twice   (repair/repair trivial-mp once)]
      (is (= once twice)))))

(deftest ^:parallel swap-between-bounds-iso-string-test
  ;; Note: bare ISO strings are wrapped by Pass 1.86 ("wrap-iso-date-bounds*") *before*
  ;; this swap pass runs, so the canonical post-repair form has \"[absolute-datetime ...]\"
  ;; bounds. The swap still proceeds because \"swap-between-bounds*\" knows how to extract
  ;; the inner ISO string for comparison.
  (testing "ISO-8601 date strings ordered chronologically: wrapped + swapped"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          input ["between" {} field "2024-12-31" "2024-01-01"]]
      (is (= ["between" {}
              field
              ["absolute-datetime" {} "2024-01-01" "day"]
              ["absolute-datetime" {} "2024-12-31" "day"]]
             (repair/repair trivial-mp input)))))
  (testing "ISO-8601 datetime strings: wrapped + swapped"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          input ["between" {} field "2024-06-15T18:00:00" "2024-06-15T09:00:00"]]
      (is (= ["between" {}
              field
              ["absolute-datetime" {} "2024-06-15T09:00:00" "day"]
              ["absolute-datetime" {} "2024-06-15T18:00:00" "day"]]
             (repair/repair trivial-mp input)))))
  (testing "in-order ISO strings: wrapped, no swap"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          input ["between" {} field "2024-01-01" "2024-12-31"]]
      (is (= ["between" {}
              field
              ["absolute-datetime" {} "2024-01-01" "day"]
              ["absolute-datetime" {} "2024-12-31" "day"]]
             (repair/repair trivial-mp input))))))

(deftest ^:parallel swap-between-bounds-absolute-datetime-test
  (testing "out-of-order absolute-datetime clauses: swap by inner ISO string"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          hi    ["absolute-datetime" {} "2024-12-31" "day"]
          lo    ["absolute-datetime" {} "2024-01-01" "day"]
          input ["between" {} field hi lo]]
      (is (= ["between" {} field lo hi]
             (repair/repair trivial-mp input)))))
  (testing "in-order absolute-datetime clauses are left alone"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          lo    ["absolute-datetime" {} "2024-01-01" "day"]
          hi    ["absolute-datetime" {} "2024-12-31" "day"]
          input ["between" {} field lo hi]]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel swap-between-bounds-non-literal-untouched-test
  (testing "non-literal bound (a relative-datetime clause) is left alone - we can't
           compare without execution"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          rel   ["relative-datetime" {} -7 "day"]
          abs   ["absolute-datetime" {} "2024-01-01" "day"]
          input ["between" {} field rel abs]]
      (is (= input (repair/repair trivial-mp input)))))
  (testing "a `field` ref bound is left alone"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
          other ["field" {} ["Sample" "PUBLIC" "ORDERS" "OTHER"]]
          input ["between" {} field other 100]]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel swap-between-bounds-mixed-types-untouched-test
  (testing "mixed-kind bounds (number vs string) are left alone"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "X"]]
          input ["between" {} field 10 "hello"]]
      (is (= input (repair/repair trivial-mp input))))))

;;; ============================================================
;;; Pass 1.55 - normalise `fields:` to sequential-of-clause when given a single clause
;;; ============================================================

(deftest ^:parallel normalise-fields-on-stage-test
  (testing "single clause as `fields:` value gets wrapped in a one-element list"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]
          input {"lib/type"     "mbql/query"
                 "database"     "Sample"
                 "stages"       [{"lib/type"     "mbql.stage/mbql"
                                  "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                  "fields"       field}]}
          output (repair/repair trivial-mp input)]
      (is (= [field] (get-in output ["stages" 0 "fields"])))))
  (testing "sequential `fields:` is left alone"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]
          input {"lib/type"     "mbql/query"
                 "database"     "Sample"
                 "stages"       [{"lib/type"     "mbql.stage/mbql"
                                  "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                  "fields"       [field]}]}
          output (repair/repair trivial-mp input)]
      (is (= [field] (get-in output ["stages" 0 "fields"]))))))

(deftest ^:parallel normalise-fields-on-join-test
  (testing "single clause as join `fields:` gets wrapped"
    (let [field ["field" {} ["Sample" "PUBLIC" "PRODUCTS" "NAME"]]
          stage {"lib/type"     "mbql.stage/mbql"
                 "source-table" ["Sample" "PUBLIC" "PRODUCTS"]}
          join  {"lib/type"   "mbql/join"
                 "alias"      "P"
                 "stages"     [stage]
                 "conditions" [["=" {}
                                ["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                                ["field" {} ["Sample" "PUBLIC" "PRODUCTS" "ID"]]]]
                 "fields"     field}
          input {"lib/type" "mbql/query"
                 "database" "Sample"
                 "stages"   [{"lib/type"     "mbql.stage/mbql"
                              "source-table" ["Sample" "PUBLIC" "ORDERS"]
                              "joins"        [join]}]}
          output (repair/repair trivial-mp input)]
      (is (= [field] (get-in output ["stages" 0 "joins" 0 "fields"])))))
  (testing "join `fields:` enum value (\"all\" / \"none\") is left alone"
    (doseq [enum-value ["all" "none"]]
      (let [stage {"lib/type"     "mbql.stage/mbql"
                   "source-table" ["Sample" "PUBLIC" "PRODUCTS"]}
            join  {"lib/type"   "mbql/join"
                   "alias"      "P"
                   "stages"     [stage]
                   "conditions" [["=" {}
                                  ["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                                  ["field" {} ["Sample" "PUBLIC" "PRODUCTS" "ID"]]]]
                   "fields"     enum-value}
            input {"lib/type" "mbql/query"
                   "database" "Sample"
                   "stages"   [{"lib/type"     "mbql.stage/mbql"
                                "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                "joins"        [join]}]}
            output (repair/repair trivial-mp input)]
        (is (= enum-value (get-in output ["stages" 0 "joins" 0 "fields"]))
            enum-value)))))

(deftest ^:parallel normalise-fields-idempotent-test
  (testing "after wrap, second pass is a no-op"
    (let [field ["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]
          input {"lib/type"     "mbql/query"
                 "database"     "Sample"
                 "stages"       [{"lib/type"     "mbql.stage/mbql"
                                  "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                  "fields"       field}]}
          once  (repair/repair trivial-mp input)
          twice (repair/repair trivial-mp once)]
      (is (= once twice)))))

;;; ============================================================
;;; Pass 1.87 - rewrite misspelled `lib/type` aliases
;;; ============================================================

(def ^:private lib-type-join-query
  "ORDERS with an explicit join to PRODUCTS. The join `lib/type` is filled in by each test."
  {"lib/type" "mbql/query"
   "database" "Sample"
   "stages"   [{"lib/type"     "mbql.stage/mbql"
                "source-table" ["Sample" "PUBLIC" "ORDERS"]
                "joins"        [{"alias"      "P"
                                 "fields"     "none"
                                 "conditions" [["=" {}
                                                ["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                                                ["field" {"join-alias" "P"} ["Sample" "PUBLIC" "PRODUCTS" "ID"]]]]
                                 "stages"     [{"lib/type"     "mbql.stage/mbql"
                                                "source-table" ["Sample" "PUBLIC" "PRODUCTS"]}]}]}]})

(defn- join-lib-type [q]
  (get-in q ["stages" 0 "joins" 0 "lib/type"]))

(defn- with-join-lib-type [v]
  (assoc-in lib-type-join-query ["stages" 0 "joins" 0 "lib/type"] v))

(deftest ^:parallel rewrite-join-lib-type-test
  (testing "a join with the misspelled `mbql.join/join` marker is rewritten to `mbql/join`"
    (let [output (repair/repair trivial-mp (with-join-lib-type "mbql.join/join"))]
      (is (= "mbql/join" (join-lib-type output))))))

(deftest ^:parallel rewrite-join-lib-type-preserves-canonical-test
  (testing "a join that already has the canonical `mbql/join` marker is left unchanged"
    (let [output (repair/repair trivial-mp (with-join-lib-type "mbql/join"))]
      (is (= "mbql/join" (join-lib-type output))))))

(deftest ^:parallel rewrite-join-lib-type-idempotent-test
  (testing "join `lib/type` correction is a fixed point"
    (let [once  (repair/repair trivial-mp (with-join-lib-type "mbql.join/join"))
          twice (repair/repair trivial-mp once)]
      (is (= once twice)))))

;;; ============================================================
;;; Pass 2 - fill in missing `lib/type`
;;; ============================================================

(deftest ^:parallel add-query-lib-type-test
  (testing "top-level query without lib/type gets mbql/query"
    (let [input  {"database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]}]}
          output (repair/repair trivial-mp input)]
      (is (= "mbql/query" (get output "lib/type")))))
  (testing "existing lib/type preserved"
    (let [input {"lib/type" "mbql/query"
                 "database" "Sample"
                 "stages"   [{"lib/type"     "mbql.stage/mbql"
                              "source-table" ["Sample" "PUBLIC" "ORDERS"]}]}]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel add-stage-lib-type-test
  (testing "stage without lib/type gets mbql.stage/mbql"
    (let [input  {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" {}]]}]}
          output (repair/repair trivial-mp input)]
      (is (= "mbql.stage/mbql" (get-in output ["stages" 0 "lib/type"])))))
  (testing "a random non-stage map without stage-body keys is untouched"
    (let [input {"foo" "bar"}]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel add-join-lib-type-test
  (testing "a join with no lib/type gets mbql/join"
    (let [output (repair/repair trivial-mp (update-in lib-type-join-query ["stages" 0 "joins" 0] dissoc "lib/type"))]
      (is (= "mbql/join" (join-lib-type output))))))

;;; ============================================================
;;; Pass 1.9 - stamp top-level `database:` from the first stage's source
;;;
;;; Introduced in the `repr-plan.md` step-14 follow-up: the LLM-facing tool contract no
;;; longer asks the model to author `database:`. Instead the construct pipeline derives the
;;; database-id from `stages[0].source-table[0]` (or `source-card` entity_id), builds an MP,
;;; and this repair pass stamps `database:` from the MP into the parsed YAML so the repr
;;; spec / lib.schema are happy downstream.
;;;
;;; The previous `rewrite-database-name*` pass (deleted in step 13) served a related but
;;; different role - reconciling a Sample / Sample-Database mismatch. Its concern is
;;; structurally prevented now: if the user writes the wrong DB name in `source-table[0]`,
;;; the DB lookup fails at `resolve-database-id-from-first-stage` with `:unknown-database`
;;; before this repair pass even runs.
;;; ============================================================

(deftest ^:parallel stamp-top-level-database-from-source-table-test
  (testing "Pass 1.9 stamps `database:` onto a query that doesn't have one, using the MP name."
    (let [input  {"lib/type" "mbql/query"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" {}]]}]}
          output (repair/repair mp-fks input)]
      (is (= "Sample" (get output "database"))))))

(deftest ^:parallel stamp-top-level-database-overwrites-mismatch-test
  (testing "Pass 1.9 silently overwrites a stale / wrong `database:` with the MP's canonical name."
    (let [input  {"lib/type" "mbql/query"
                  "database" "DatabaseFormerlyKnownAsSample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" {}]]}]}
          output (repair/repair mp-fks input)]
      (is (= "Sample" (get output "database"))))))

(deftest ^:parallel stamp-top-level-database-idempotent-test
  (testing "Pass 1.9 is a fixed point: running it twice gives the same output."
    (let [input  {"lib/type" "mbql/query"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" {}]]}]}
          once   (repair/repair mp-fks input)
          twice  (repair/repair mp-fks once)]
      (is (= once twice)))))

(deftest ^:parallel stamp-top-level-database-no-mp-fallback-test
  (testing "With no MP we still use the raw `source-table[0]` string as a fallback (unit-test isolation path)."
    (let [input  {"lib/type" "mbql/query"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["WarehouseX" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" {}]]}]}
          output (repair/repair nil input)]
      (is (= "WarehouseX" (get output "database"))))))

;;; ============================================================
;;; Pass 2.7 - rewrite inline aggregations in `order-by` to aggregation refs
;;;
;;; The LLM tends to write `order-by: [[desc, {}, [sum, {}, [field, {}, FK]]]]`, re-stating
;;; the aggregation expression inline. The lib stack accepts this in MBQL 5 form but the
;;; legacy round-trip (which happens whenever the chart is later re-loaded) rejects it.
;;; Repair detects the pattern and rewrites it to a UUID-based aggregation reference,
;;; stamping the matching aggregation's `lib/uuid` if needed.
;;; ============================================================

(defn- uuid-string? [x]
  (and (string? x)
       (try (java.util.UUID/fromString x) true (catch Exception _ false))))

(defn- agg-uuid-of [stage idx]
  (get-in stage ["aggregation" idx 1 "lib/uuid"]))

(deftest ^:parallel rewrite-order-by-inline-agg-happy-path-test
  (testing "inline aggregation in order-by gets rewritten to an aggregation ref"
    (let [input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["sum" {}
                                                  ["field" {}
                                                   ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                                 "order-by"     [["desc" {}
                                                  ["sum" {}
                                                   ["field" {}
                                                    ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
          repaired (repair/repair trivial-mp input)
          stage    (get-in repaired ["stages" 0])
          agg-uuid (agg-uuid-of stage 0)]
      (testing "the matched aggregation got a lib/uuid stamped into its options"
        (is (uuid-string? agg-uuid)))
      (testing "order-by inner clause is now [\"aggregation\" {} <that-uuid>]"
        (is (= ["aggregation" {} agg-uuid]
               (get-in stage ["order-by" 0 2])))))))

(deftest ^:parallel rewrite-order-by-multiple-aggregations-test
  (testing "order-by entries match the right aggregation by structural equality"
    (let [input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["sum" {}
                                                  ["field" {}
                                                   ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
                                                 ["count" {}]]
                                 "order-by"     [["desc" {} ["count" {}]]
                                                 ["asc" {}
                                                  ["sum" {}
                                                   ["field" {}
                                                    ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
          repaired (repair/repair trivial-mp input)
          stage    (get-in repaired ["stages" 0])
          sum-uuid (agg-uuid-of stage 0)
          cnt-uuid (agg-uuid-of stage 1)]
      (is (uuid-string? sum-uuid))
      (is (uuid-string? cnt-uuid))
      (is (not= sum-uuid cnt-uuid) "each aggregation gets its own uuid")
      (is (= ["aggregation" {} cnt-uuid] (get-in stage ["order-by" 0 2]))
          "first order-by (count) refers to the count aggregation")
      (is (= ["aggregation" {} sum-uuid] (get-in stage ["order-by" 1 2]))
          "second order-by (sum TOTAL) refers to the sum aggregation"))))

(deftest ^:parallel rewrite-order-by-reuses-existing-uuid-test
  (testing "if the matching aggregation already has a lib/uuid, reuse it"
    (let [existing-uuid "11111111-2222-3333-4444-555555555555"
          input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["sum" {"lib/uuid" existing-uuid}
                                                  ["field" {}
                                                   ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                                 "order-by"     [["desc" {}
                                                  ["sum" {}
                                                   ["field" {}
                                                    ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
          repaired (repair/repair trivial-mp input)
          stage    (get-in repaired ["stages" 0])]
      (is (= existing-uuid (agg-uuid-of stage 0))
          "the pre-existing uuid is preserved")
      (is (= ["aggregation" {} existing-uuid] (get-in stage ["order-by" 0 2]))))))

(deftest ^:parallel rewrite-order-by-leaves-existing-aggregation-ref-alone-test
  (testing "an order-by that already uses [\"aggregation\" {} <uuid>] is left alone"
    (let [agg-uuid "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
          input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["sum" {"lib/uuid" agg-uuid}
                                                  ["field" {}
                                                   ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                                 "order-by"     [["desc" {}
                                                  ["aggregation" {} agg-uuid]]]}]}]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel rewrite-order-by-leaves-non-aggregation-orderings-alone-test
  (testing "order-by on a plain field is left alone"
    (let [input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["count" {}]]
                                 "order-by"     [["asc" {}
                                                  ["field" {}
                                                   ["Sample" "PUBLIC" "ORDERS" "ID"]]]]}]}]
      (is (= input (repair/repair trivial-mp input))))))

(deftest ^:parallel rewrite-order-by-leaves-non-matching-aggregation-alone-test
  (testing (str "if the inline order-by aggregation does NOT match any aggregation in the\n"
                "stage, leave it alone (let validation/normalize surface the real error)")
    (let [input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["count" {}]]
                                 "order-by"     [["desc" {}
                                                  ["sum" {}
                                                   ["field" {}
                                                    ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
          repaired (repair/repair trivial-mp input)]
      (is (= ["sum" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
             (get-in repaired ["stages" 0 "order-by" 0 2]))))))

(deftest ^:parallel rewrite-order-by-idempotent-test
  (testing "running repair twice produces the same result (UUID is stable across runs)"
    (let [input  {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["sum" {}
                                                ["field" {}
                                                 ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                               "order-by"     [["desc" {}
                                                ["sum" {}
                                                 ["field" {}
                                                  ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
          once   (repair/repair trivial-mp input)
          twice  (repair/repair trivial-mp once)]
      (is (= once twice)))))

;;; ============================================================
;;; End-to-end repair against an LLM shortcut shape
;;; ============================================================

(deftest ^:parallel end-to-end-shortcut-repair-test
  (testing "LLM-style shortcut missing both lib/types and options maps still validates after repair"
    ;; The `:lib.schema/external-query` validation at the API boundary rejects this shape, but
    ;; the repair pipeline itself is still expected to handle it for callers that bypass
    ;; boundary validation (tests, programmatic invocations).
    (let [parsed   {"database" "Sample"
                    "stages"   [{"source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["count"]]}]}
          repaired (repair/repair trivial-mp parsed)]
      (is (= "mbql/query" (get repaired "lib/type")))
      (is (= "mbql.stage/mbql" (get-in repaired ["stages" 0 "lib/type"])))
      (is (= [["count" {}]] (get-in repaired ["stages" 0 "aggregation"])))
      ;; repaired form should now pass the schema validator
      (is (= repaired (repr/validate-query repaired))))))

;;; ============================================================
;;; Idempotency - unit + property based
;;; ============================================================

(deftest ^:parallel idempotency-happy-path-test
  (testing "a fully-valid query is a fixed point"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {"temporal-unit" "month"}
                                           ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]]}]}]
      (is (= q (repair/repair trivial-mp q)))
      (is (= (repair/repair trivial-mp q) (repair/repair trivial-mp (repair/repair trivial-mp q)))))))

(deftest ^:parallel idempotency-degenerate-test
  (testing "repair(repair(x)) == repair(x) for a broken LLM input"
    (let [broken {"database" "Sample"
                  "stages"   [{"source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count"]]
                               "breakout"     [["field" ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]]}]}
          once (repair/repair trivial-mp broken)
          twice (repair/repair trivial-mp once)]
      (is (= once twice)))))

(deftest ^:parallel idempotency-unwrapped-boolean-wrapper-test
  (testing "unwrapping a boolean wrapper that is the sole element of a parent vector stays idempotent"
    ;; Regression for a non-idempotency the generative idempotency-property-test surfaced:
    ;; `["true" {} x]` unwraps to `x`. For a scalar `x`, `unwrap-boolean-wrapper` emits a clause
    ;; `[x {}]` rather than the bare scalar, so a sole-element parent stays `[[x {}]]` instead of
    ;; collapsing to `[x]` - which a later `repair` pass would otherwise "fix" to `[x {}]`, breaking
    ;; the fixed point. Any non-blank scalar triggered it (the shrunk counterexample minimised `x`
    ;; to a single NUL char).
    (let [once (repair/repair trivial-mp [["true" {} "x"]])]
      (is (= [["x" {}]] once)
          "the wrapped scalar is emitted as a clause, leaving the parent vector intact")
      (is (= once (repair/repair trivial-mp once))
          "and the result is a fixed point"))))

;;; Property-based fuzz: randomly-shaped inputs go through repair twice and must equal on pass 2.

(def ^:private gen-scalar
  (gen/one-of [gen/string gen/small-integer gen/boolean (gen/return nil)]))

;;; Op-name generator covers every head with a repair pass attached, so adversarial
;;; combinations (e.g. `eq` mixed with `between`, `if` with stray `else` branches, etc.)
;;; have a chance to be sampled.
(def ^:private gen-op-name
  (gen/elements
   [;; structural
    "field" "expression" "aggregation" "and" "or" "not"
    ;; comparison + aliases (1.1)
    "=" "!=" "<" ">" "<=" ">=" "eq" "ne" "lt" "gt" "le" "ge" "lte" "gte"
    "equals" "not-equals"
    ;; list-membership (1.10)
    "in" "not-in"
    ;; boolean wrappers (1.4)
    "true" "false"
    ;; null checks + alias (1.1)
    "is-null" "not-null" "is-not-null"
    ;; temporal range / literals (1.5/1.6/1.7)
    "between" "now" "relative-datetime" "absolute-datetime" "relative-date"
    ;; temporal-bucket extraction + aliases (1.2)
    "get-day-of-week" "get-hour" "get-month" "get-quarter"
    "dayofweek" "day-of-week" "hour-of-day" "month-of-year" "quarter-of-year"
    ;; direction (1.3)
    "asc" "desc" "ascending" "descending" "ASC" "DESC"
    ;; conditional (1.8) — `case`/`if`/`else` deliberately omitted from the chaos
    ;; generator because Pass 1.84 wraps pairs as `[[pred then]]`, and Pass 1 then
    ;; mis-classifies a bare 2-element string-pair `[s1 s2]` as a clause and inserts `{}`
    ;; between them. In real LLM output `pred` is always a clause (e.g. `[\"=\" {} field
    ;; val]`), so this collision doesn't fire; the realistic-query generator below
    ;; exercises canonical case shapes with proper clause preds.
    ;; aggregations + lib renames (1.1)
    "count" "sum" "avg" "min" "max" "distinct" "stddev" "var"
    "count-where" "count-if" "variance" "stddev-pop" "count-distinct" "distinct-count"
    "datetime-diff" "temporal-diff"
    ;; metric (resists auto-split column-name extraction; § 1.11 diagnostic path)
    "metric"]))

(def ^:private gen-fk-segment (gen/elements ["DB" "PUBLIC" "ORDERS" "PRODUCTS" "ID" "TOTAL" nil]))

(def ^:private gen-fk-vector
  (gen/fmap vec (gen/vector gen-fk-segment 3 6)))

(defn- gen-clause [depth]
  (if (zero? depth)
    (gen/tuple gen-op-name
               (gen/one-of [(gen/return {}) (gen/return nil) (gen/return :absent)]))
    (gen/bind (gen/tuple gen-op-name
                         (gen/one-of [(gen/return {}) (gen/return nil) (gen/return :absent)])
                         (gen/vector (gen/one-of [gen-scalar gen-fk-vector]) 0 3))
              (fn [[op opts args]]
                (gen/return
                 (cond-> [op]
                   (not= opts :absent) (conj opts)
                   :always             (into args)))))))

(defn- gen-map-of [k-gen v-gen]
  (gen/fmap (fn [pairs] (into {} pairs))
            (gen/vector (gen/tuple k-gen v-gen) 0 4)))

(def ^:private gen-tree
  (gen/recursive-gen
   (fn [inner] (gen/one-of [(gen-clause 1)
                            (gen/vector inner 0 4)
                            (gen-map-of gen/string-alphanumeric inner)]))
   (gen/one-of [gen-scalar (gen-clause 0) gen-fk-vector])))

(defspec idempotency-property-test 200
  (prop/for-all [tree gen-tree]
    (= (repair/repair trivial-mp tree)
       (repair/repair trivial-mp (repair/repair trivial-mp tree)))))

;;; ----------------------------------------------------------------
;;; Realistic-shape fuzz: generate query-shaped maps (top-level `stages` vector with
;;; aggregation / breakout / filter / order-by / joins / multi-stage) so we stress the
;;; structural passes (Pass 2 lib-types, Pass 2.7 inline-aggs, Pass 2.8 int-ref resolution,
;;; Pass 2.9 post-agg split, Pass 5 cross-stage type inference, etc.) on inputs that look
;;; like what an LLM might emit, not pure tree chaos.
;;; ----------------------------------------------------------------

(def ^:private gen-fk-target
  (gen/elements [["Sample" "PUBLIC" "ORDERS" "ID"]
                 ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]
                 ["Sample" "PUBLIC" "ORDERS" "TOTAL"]
                 ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]
                 ["Sample" "PUBLIC" "ORDERS" "STATUS"]
                 ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]))

(def ^:private gen-source-table
  (gen/elements [["Sample" "PUBLIC" "ORDERS"]
                 ["Sample" "PUBLIC" "PRODUCTS"]]))

(def ^:private gen-field-clause
  (gen/fmap (fn [target] ["field" {} target]) gen-fk-target))

(def ^:private gen-field-clause-with-temporal
  (gen/fmap (fn [[target unit]] ["field" {"temporal-unit" unit} target])
            (gen/tuple gen-fk-target
                       (gen/elements ["day" "week" "month" "quarter" "year"]))))

(def ^:private gen-aggregation-clause
  ;; Mix simple and arg-taking aggs. Some LLM-flavoured aliases (count-distinct, count-if,
  ;; variance) ride along to exercise Pass 1.81's rewrite.
  (gen/one-of
   [(gen/return ["count" {}])
    (gen/return ["cum-count" {}])
    (gen/fmap (fn [f] ["sum" {} f]) gen-field-clause)
    (gen/fmap (fn [f] ["avg" {} f]) gen-field-clause)
    (gen/fmap (fn [f] ["max" {} f]) gen-field-clause)
    (gen/fmap (fn [f] ["distinct" {} f]) gen-field-clause)
    (gen/fmap (fn [f] ["count-distinct" {} f]) gen-field-clause)
    (gen/fmap (fn [f] ["variance" {} f]) gen-field-clause)]))

(def ^:private gen-filter-clause
  ;; A filter that touches one of the heads with a repair pass attached.
  (gen/one-of
   [(gen/fmap (fn [[f v]] ["="  {} f v]) (gen/tuple gen-field-clause gen-scalar))
    (gen/fmap (fn [[f v]] ["!=" {} f v]) (gen/tuple gen-field-clause gen-scalar))
    (gen/fmap (fn [[f v]] ["eq" {} f v]) (gen/tuple gen-field-clause gen-scalar))
    (gen/fmap (fn [[f v]] ["gt" {} f v]) (gen/tuple gen-field-clause gen/small-integer))
    (gen/fmap (fn [[f v]] [">=" {} f v]) (gen/tuple gen-field-clause gen/small-integer))
    (gen/fmap (fn [[f vs]] (into ["in" {} f] vs))
              (gen/tuple gen-field-clause (gen/vector gen/string-alphanumeric 1 4)))
    ;; deliberately wrap values in a vector to trigger Pass 1.82
    (gen/fmap (fn [[f vs]] ["in" {} f vs])
              (gen/tuple gen-field-clause (gen/vector gen/string-alphanumeric 1 4)))
    ;; between with maybe-out-of-order ISO date strings (Pass 1.86 + 1.87)
    (gen/fmap (fn [[f a b]] ["between" {} f a b])
              (gen/tuple gen-field-clause-with-temporal
                         (gen/elements ["2024-01-01" "2024-06-30" "2024-12-31"])
                         (gen/elements ["2023-01-01" "2024-12-31" "now"])))
    ;; post-aggregation filter that triggers Pass 2.9 split
    (gen/fmap (fn [n] [">" {} ["aggregation" {} 0] n])
              gen/small-integer)]))

(def ^:private gen-direction-head
  (gen/elements ["asc" "desc" "ascending" "descending" "ASC" "DESC"]))

(def ^:private gen-order-by-clause
  (gen/fmap (fn [[dir f]] [dir {} f])
            (gen/tuple gen-direction-head gen-field-clause)))

(def ^:private gen-case-clause
  ;; Build canonical and not-yet-canonical case shapes. preds are always clause-shaped
  ;; (an `=` filter), thens are scalars - this matches real LLM output. Exercises Pass 1.84
  ;; (`normalise-case-clauses*`) on the alternative argument shapes it's designed to
  ;; recognise.
  (gen/let [pred-clause gen-filter-clause
            then-val    gen-scalar
            shape       (gen/elements [:canonical :three-bare :pairs-as-args])]
    (case shape
      :canonical     ["case" {} [[pred-clause then-val]] then-val]
      :three-bare    ["case" {} pred-clause then-val then-val]
      :pairs-as-args ["case" {} [pred-clause then-val] [pred-clause then-val] then-val])))

(def ^:private gen-expression-clause
  (gen/one-of
   [gen-case-clause
    (gen/fmap (fn [[a b]] ["+" {} a b])
              (gen/tuple gen-field-clause gen/small-integer))
    (gen/fmap (fn [[a b]] ["datetime-diff" {} a b "day"])
              (gen/tuple gen-field-clause gen-field-clause))]))

(def ^:private gen-stage
  (gen/let [src       gen-source-table
            aggs      (gen/vector gen-aggregation-clause 0 2)
            breakouts (gen/vector gen-field-clause 0 2)
            filters   (gen/vector gen-filter-clause 0 3)
            order-bys (gen/vector gen-order-by-clause 0 2)
            exprs     (gen/vector gen-expression-clause 0 2)
            limit     (gen/one-of [(gen/return nil) (gen/elements [5 10 50])])]
    (cond-> {"lib/type"     "mbql.stage/mbql"
             "source-table" src}
      (seq aggs)      (assoc "aggregation" (vec aggs))
      (seq breakouts) (assoc "breakout"    (vec breakouts))
      (seq filters)   (assoc "filters"     (vec filters))
      (seq order-bys) (assoc "order-by"    (vec order-bys))
      (seq exprs)     (assoc "expressions" (vec exprs))
      (some? limit)   (assoc "limit"       limit))))

(def ^:private gen-realistic-query
  (gen/let [stage gen-stage]
    {"lib/type" "mbql/query"
     "database" "Sample"
     "stages"   [stage]}))

(defn- repair-or-agent-error
  "Returns `[:ok result]` on success, `[:agent-error data]` on agent-flagged ex-info,
  or `[:bug ex]` on anything else (test should fail). Keeps the exception escape-channel
  narrow: only `:agent-error? true` ex-info is acceptable."
  [tree]
  (try
    [:ok (repair/repair trivial-mp tree)]
    (catch clojure.lang.ExceptionInfo e
      (if (true? (:agent-error? (ex-data e)))
        [:agent-error (ex-data e)]
        [:bug e]))
    (catch Throwable e
      [:bug e])))

(defspec realistic-query-idempotency-property-test 200
  (prop/for-all [q gen-realistic-query]
    (let [[outcome r1] (repair-or-agent-error q)]
      (case outcome
        :ok          (let [[outcome2 r2] (repair-or-agent-error r1)]
                       (and (= :ok outcome2) (= r1 r2)))
        :agent-error true                  ; clean diagnostic - acceptable
        :bug         false))))

(defspec realistic-query-no-bug-exceptions-test 200
  (prop/for-all [q gen-realistic-query]
    (let [[outcome _] (repair-or-agent-error q)]
      (not= outcome :bug))))

;;; ============================================================
;;; Pass 3 - implicit-join `source-field` auto-wiring
;;; ============================================================

(def ^:private base-query
  "LLM-style query with a cross-table breakout on PRODUCTS.CATEGORY from source-table ORDERS."
  {"lib/type" "mbql/query"
   "database" "Sample"
   "stages"   [{"lib/type"     "mbql.stage/mbql"
                "source-table" ["Sample" "PUBLIC" "ORDERS"]
                "aggregation"  [["count" {}]]
                "breakout"     [["field" {}
                                 ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]}]})

(deftest ^:parallel implicit-join-happy-path-test
  (testing "cross-table field gets `source-field` auto-filled to the unique FK path"
    (let [out (repair/repair mp-fks base-query)
          field-opts (get-in out ["stages" 0 "breakout" 0 1])]
      (is (= ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]
             (get field-opts "source-field"))))))

(deftest ^:parallel implicit-join-preserves-existing-source-field-test
  (testing "if the clause already has source-field, leave it alone"
    (let [q (assoc-in base-query
                      ["stages" 0 "breakout" 0 1]
                      {"source-field" ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]})
          out (repair/repair mp-fks q)]
      (is (= {"source-field" ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]}
             (get-in out ["stages" 0 "breakout" 0 1]))))))

(deftest ^:parallel implicit-join-skips-join-alias-test
  (testing "field with join-alias is treated as an explicit-join reference and untouched"
    (let [q (assoc-in base-query
                      ["stages" 0 "breakout" 0 1]
                      {"join-alias" "Products"})
          out (repair/repair mp-fks q)]
      (is (= {"join-alias" "Products"}
             (get-in out ["stages" 0 "breakout" 0 1]))))))

(deftest ^:parallel implicit-join-skips-source-field-name-test
  (testing (str "a field clause carrying `source-field-name` (multi-stage implicit-join via a "
                "previous-stage column name) is left alone - we don't auto-fill `source-field`, "
                "even though the target table is otherwise reachable via a unique FK")
    (let [opts {"source-field-name" "PRODUCT_ID"}
          q    (assoc-in base-query ["stages" 0 "breakout" 0 1] opts)
          out  (repair/repair mp-fks q)
          out-opts (get-in out ["stages" 0 "breakout" 0 1])]
      (is (= opts out-opts))
      (is (not (contains? out-opts "source-field"))))))

(deftest ^:parallel implicit-join-skips-source-field-join-alias-test
  (testing (str "a field clause carrying `source-field-join-alias` (implicit-join where the FK "
                "column lives on an explicitly-joined table) is left alone")
    (let [opts {"source-field-join-alias" "Orders_A"}
          q    (assoc-in base-query ["stages" 0 "breakout" 0 1] opts)
          out  (repair/repair mp-fks q)
          out-opts (get-in out ["stages" 0 "breakout" 0 1])]
      (is (= opts out-opts))
      (is (not (contains? out-opts "source-field"))))))

(deftest ^:parallel implicit-join-skips-field-on-source-table-test
  (testing "field that already lives on source-table doesn't get source-field added"
    (let [q (assoc-in base-query
                      ["stages" 0 "breakout"]
                      [["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]])
          out (repair/repair mp-fks q)]
      (is (= {} (get-in out ["stages" 0 "breakout" 0 1]))))))

(deftest ^:parallel implicit-join-no-fk-path-test
  (testing "throws :no-fk-path when the target table isn't reachable via any FK"
    (try
      (repair/repair mp-no-fk base-query)
      (is false "expected throw")
      (catch clojure.lang.ExceptionInfo e
        (let [d (ex-data e)]
          (is (= :no-fk-path (:error d)))
          (is (true? (:agent-error? d)))
          (is (re-find #"no foreign key" (ex-message e))))))))

(deftest ^:parallel implicit-join-ambiguous-fk-test
  (testing (str "throws :ambiguous-fk when multiple FKs exist, and does NOT enumerate the "
                "candidate FK column names (parity with the S1 info-leak strip: the "
                "un-sandboxed metadata provider could otherwise surface bridge-table "
                "column names the caller cannot see)")
    (try
      (repair/repair mp-ambiguous base-query)
      (is false "expected throw")
      (catch clojure.lang.ExceptionInfo e
        (let [d   (ex-data e)
              msg (ex-message e)]
          (is (= :ambiguous-fk (:error d)))
          (is (true? (:agent-error? d)))
          (testing "ex-data carries no candidate FK column paths"
            (is (nil? (:candidates d))))
          (testing "message must not name the FK columns (PRODUCT_ID / ALT_PRODUCT_ID)"
            (is (not (re-find #"PRODUCT_ID" msg)))
            (is (not (re-find #"ALT_PRODUCT_ID" msg))))
          (testing "message tells the LLM how to disambiguate via `source-field`"
            (is (re-find #"source-field" msg))))))))

(deftest ^:parallel implicit-join-skips-joins-subtree-test
  (testing "field references inside explicit joins are not auto-wired with source-field"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "joins"        [{"alias"    "P"
                                           "strategy" "left-join"
                                           "stages"   [{"lib/type"     "mbql.stage/mbql"
                                                        "source-table" ["Sample" "PUBLIC" "PRODUCTS"]}]
                                           "conditions"
                                           [["=" {}
                                             ["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                                             ["field" {"join-alias" "P"}
                                              ["Sample" "PUBLIC" "PRODUCTS" "ID"]]]]}]
                          "breakout"     [["field" {"join-alias" "P"}
                                           ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]}]}
          out (repair/repair mp-fks q)
          join-field-opts (get-in out ["stages" 0 "joins" 0 "conditions" 0 3 1])
          breakout-opts   (get-in out ["stages" 0 "breakout" 0 1])]
      (testing "field in join conditions (not on source-table) is NOT given source-field"
        (is (not (contains? join-field-opts "source-field"))))
      (testing "breakout field with join-alias is preserved as-is"
        (is (= {"join-alias" "P"} breakout-opts))))))

(deftest ^:parallel implicit-join-idempotent-test
  (testing "implicit-join repair is idempotent"
    (let [once  (repair/repair mp-fks base-query)
          twice (repair/repair mp-fks once)]
      (is (= once twice)))))

(deftest ^:parallel implicit-join-no-op-when-mp-cannot-resolve-source-table-test
  (testing "when the MP can't resolve the source-table, the pass is a no-op (let later stages report)"
    ;; trivial-mp has only a Database, no tables. Source-table resolution fails silently.
    (let [out (repair/repair trivial-mp base-query)]
      (is (= {} (get-in out ["stages" 0 "breakout" 0 1]))))))

;;; ============================================================
;;; Pass 3.5 - `source-field-join-alias` auto-wiring through an explicit join (step 12, partial)
;;; ============================================================

(def ^:private join-base-query
  "LLM-style query: source-table=ORDERS, explicit join of PRODUCTS as `P`, breakout on
  CATEGORIES.NAME (which is reachable from PRODUCTS via PRODUCTS.CATEGORY_ID, but NOT from
  ORDERS)."
  {"lib/type" "mbql/query"
   "database" "Sample"
   "stages"   [{"lib/type"     "mbql.stage/mbql"
                "source-table" ["Sample" "PUBLIC" "ORDERS"]
                "joins"        [{"alias"      "P"
                                 "strategy"   "left-join"
                                 "stages"     [{"lib/type"     "mbql.stage/mbql"
                                                "source-table" ["Sample" "PUBLIC" "PRODUCTS"]}]
                                 "conditions" [["=" {}
                                                ["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                                                ["field" {"join-alias" "P"}
                                                 ["Sample" "PUBLIC" "PRODUCTS" "ID"]]]]}]
                "aggregation"  [["count" {}]]
                "breakout"     [["field" {}
                                 ["Sample" "PUBLIC" "CATEGORIES" "NAME"]]]}]})

(deftest ^:parallel source-field-join-alias-happy-path-test
  (testing (str "a field whose target is reachable through exactly one explicit join via a "
                "single FK gets both `source-field-join-alias` and the matching portable "
                "`source-field` filled in")
    (let [out (repair/repair mp-via-join join-base-query)
          field-opts (get-in out ["stages" 0 "breakout" 0 1])]
      (is (= "P" (get field-opts "source-field-join-alias")))
      (is (= ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY_ID"]
             (get field-opts "source-field"))))))

(deftest ^:parallel source-field-join-alias-idempotent-test
  (testing "running repair twice produces the same query (Pass 3.5 is idempotent)"
    (let [once  (repair/repair mp-via-join join-base-query)
          twice (repair/repair mp-via-join once)]
      (is (= once twice)))))

(deftest ^:parallel source-field-join-alias-preserves-existing-disambiguators-test
  (testing "if the clause already carries `source-field-join-alias`, leave it alone"
    (let [q (assoc-in join-base-query ["stages" 0 "breakout" 0 1]
                      {"source-field-join-alias" "P"
                       "source-field"            ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY_ID"]})
          out (repair/repair mp-via-join q)]
      (is (= {"source-field-join-alias" "P"
              "source-field"            ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY_ID"]}
             (get-in out ["stages" 0 "breakout" 0 1])))))
  (testing "if the clause has `source-field-name` (multi-stage variant), leave it alone"
    (let [q (assoc-in join-base-query ["stages" 0 "breakout" 0 1]
                      {"source-field-name" "PRODUCT_ID"})
          out (repair/repair mp-via-join q)]
      (is (= {"source-field-name" "PRODUCT_ID"}
             (get-in out ["stages" 0 "breakout" 0 1]))))))

(deftest ^:parallel source-field-join-alias-defers-to-pass-4-when-source-table-can-reach-target-test
  (testing (str "if the field's target is reachable directly from `source-table`, Pass 3.5 "
                "backs off and lets the basic implicit-join pass (Pass 4) handle it - we get "
                "a plain `source-field`, NOT `source-field-join-alias`")
    ;; mp-fks: ORDERS → PRODUCTS directly. Reuse `base-query` (breakout on PRODUCTS.CATEGORY).
    (let [q (assoc-in base-query ["stages" 0 "joins"]
                      [{"alias"      "P"
                        "strategy"   "left-join"
                        "stages"     [{"lib/type"     "mbql.stage/mbql"
                                       "source-table" ["Sample" "PUBLIC" "PRODUCTS"]}]
                        "conditions" [["=" {}
                                       ["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                                       ["field" {"join-alias" "P"}
                                        ["Sample" "PUBLIC" "PRODUCTS" "ID"]]]]}])
          out  (repair/repair mp-fks q)
          opts (get-in out ["stages" 0 "breakout" 0 1])]
      (is (= ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"] (get opts "source-field")))
      (is (not (contains? opts "source-field-join-alias"))))))

(deftest ^:parallel source-field-join-alias-no-op-when-no-joins-test
  (testing "when the stage has no `joins:`, Pass 3.5 doesn't touch anything; Pass 4 reports as usual"
    ;; CATEGORIES isn't reachable from ORDERS - no joins available either - so Pass 4 raises
    ;; :no-fk-path. We're asserting Pass 3.5 didn't get in the way.
    (try
      (repair/repair mp-via-join {"lib/type" "mbql/query"
                                  "database" "Sample"
                                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                               "aggregation"  [["count" {}]]
                                               "breakout"     [["field" {}
                                                                ["Sample" "PUBLIC"
                                                                 "CATEGORIES" "NAME"]]]}]})
      (is false "expected throw from Pass 4")
      (catch clojure.lang.ExceptionInfo e
        (is (= :no-fk-path (:error (ex-data e))))))))

(deftest ^:parallel source-field-join-alias-ambiguous-error-test
  (testing "raises :ambiguous-fk-via-join when the target is reachable through multiple distinct join aliases"
    (let [q (assoc-in join-base-query ["stages" 0 "joins"]
                      [{"alias"      "P"
                        "strategy"   "left-join"
                        "stages"     [{"lib/type"     "mbql.stage/mbql"
                                       "source-table" ["Sample" "PUBLIC" "PRODUCTS"]}]
                        "conditions" [["=" {}
                                       ["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]
                                       ["field" {"join-alias" "P"}
                                        ["Sample" "PUBLIC" "PRODUCTS" "ID"]]]]}
                       {"alias"      "PA"
                        "strategy"   "left-join"
                        "stages"     [{"lib/type"     "mbql.stage/mbql"
                                       "source-table" ["Sample" "PUBLIC" "PRODUCTS_ALT"]}]
                        "conditions" [["=" {}
                                       ["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]
                                       ["field" {"join-alias" "PA"}
                                        ["Sample" "PUBLIC" "PRODUCTS_ALT" "ID"]]]]}])]
      (try
        (repair/repair mp-via-two-joins q)
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d   (ex-data e)
                msg (ex-message e)]
            (is (= :ambiguous-fk-via-join (:error d)))
            (is (true? (:agent-error? d)))
            (testing "alias names ARE surfaced (they came from the LLM's own joins:)"
              (is (= #{"P" "PA"} (set (:aliases d))))
              (is (re-find #"\"P\"" msg))
              (is (re-find #"\"PA\"" msg)))
            (testing "FK column portables are NOT surfaced (un-sandboxed MP info-leak guard)"
              (is (nil? (:candidates d)))
              (is (not (re-find #"PRODUCTS_ALT" msg))))
            (testing "message tells the LLM how to disambiguate via `source-field-join-alias`"
              (is (re-find #"source-field-join-alias" msg)))))))))

(deftest ^:parallel source-field-join-alias-skips-joins-subtree-test
  (testing (str "a field clause inside an explicit join's `conditions:` is NOT touched - those "
                "clauses live in the join's own resolution context")
    (let [out (repair/repair mp-via-join join-base-query)
          ;; The condition LHS sits on ORDERS.PRODUCT_ID (no extra disambiguator needed); the
          ;; condition RHS already has `join-alias`. Neither should pick up
          ;; `source-field-join-alias`.
          lhs (get-in out ["stages" 0 "joins" 0 "conditions" 0 2 1])
          rhs (get-in out ["stages" 0 "joins" 0 "conditions" 0 3 1])]
      (is (not (contains? lhs "source-field-join-alias")))
      (is (not (contains? rhs "source-field-join-alias"))))))

;;; ============================================================
;;; Pass 4 -- cross-stage field-type inference (repr-plan step 8)
;;;
;;; When a later stage references a column from an earlier stage by name
;;; (`["field" {} "<column-name>"]`), the `lib.schema/query` validator requires the options
;;; map to carry `"base-type"` (and, by convention, `"effective-type"`). LLMs routinely
;;; forget this. This pass resolves the earlier stages enough to learn each column's name
;;; and base-type, then stamps the inferred types into the options map of every string-named
;;; cross-stage field ref in later stages.
;;; ============================================================

(def ^:private multi-stage-base-query
  "Two-stage query: aggregate orders by product id in stage 0, filter on count in stage 1.
  The stage-1 filter references the aggregation output by name (`count`) - an LLM that
  knows it has to filter an aggregate will typically write this shape and forget the
  `base-type`."
  {"lib/type" "mbql/query"
   "database" "Sample"
   "stages"   [{"lib/type"     "mbql.stage/mbql"
                "source-table" ["Sample" "PUBLIC" "ORDERS"]
                "aggregation"  [["count" {}]]
                "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]]}
               {"lib/type" "mbql.stage/mbql"
                "filters"  [[">" {} ["field" {} "count"] 10]]}]})

(deftest ^:parallel cross-stage-field-type-inference-happy-path-test
  (testing "String-named cross-stage field ref gets `base-type` + `effective-type` inferred
           from the previous stage's `lib/returned-columns`."
    (let [out (repair/repair mp-fks multi-stage-base-query)
          field-clause (get-in out ["stages" 1 "filters" 0 2])
          opts (nth field-clause 1)]
      (testing "base-type / effective-type are populated"
        (is (= "type/Integer" (get opts "base-type")))
        (is (= "type/Integer" (get opts "effective-type"))))
      (testing "the string column name in position 2 is preserved"
        (is (= "count" (nth field-clause 2)))))))

(deftest ^:parallel cross-stage-field-type-preserves-existing-base-type-test
  (testing "If the LLM actually wrote `base-type`, we don't overwrite it."
    (let [q (assoc-in multi-stage-base-query
                      ["stages" 1 "filters" 0 2 1]
                      {"base-type" "type/Text" "effective-type" "type/Text"})
          out (repair/repair mp-fks q)
          opts (get-in out ["stages" 1 "filters" 0 2 1])]
      (is (= "type/Text" (get opts "base-type")))
      (is (= "type/Text" (get opts "effective-type"))))))

(deftest ^:parallel cross-stage-field-type-breakout-column-test
  (testing "A later stage can reference a BREAKOUT column from the previous stage by name;
           repair infers its base-type from the source column's metadata."
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]]}
                         {"lib/type"  "mbql.stage/mbql"
                          "order-by" [["asc" {} ["field" {} "ID"]]]}]}
          out (repair/repair mp-fks q)
          opts (get-in out ["stages" 1 "order-by" 0 2 1])]
      (is (= "type/Integer" (get opts "base-type"))))))

(deftest ^:parallel cross-stage-field-type-leaves-vector-field-fks-alone-test
  (testing "A field clause that uses a portable FK path (vector in position 2) is a normal
           cross-table reference, not a cross-stage one - do not touch it."
    (let [out (repair/repair mp-fks multi-stage-base-query)
          stage-0-breakout-field (get-in out ["stages" 0 "breakout" 0])]
      (testing "stage-0 breakout is untouched by the cross-stage pass"
        ;; It may or may not have been touched by implicit-join; but the base-type should
        ;; NOT have been stamped in by the cross-stage pass (different code path).
        (is (vector? (nth stage-0-breakout-field 2)))))))

(deftest ^:parallel cross-stage-field-type-no-previous-stage-test
  (testing "String-named field in stage 0 has no previous stage to look at - we can't
           infer, so we leave the clause alone (the schema validator will surface the error)."
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type" "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "filters" [[">" {} ["field" {} "count"] 10]]}]}
          out (repair/repair mp-fks q)
          opts (get-in out ["stages" 0 "filters" 0 2 1])]
      (is (not (contains? opts "base-type"))))))

(deftest ^:parallel cross-stage-field-type-unknown-column-name-test
  (testing "If the referenced name isn't produced by the previous stage, leave the clause
           alone (the resolver will surface :unknown-column or similar with a better message)."
    (let [q (assoc-in multi-stage-base-query
                      ["stages" 1 "filters" 0 2 2] "no_such_column")
          out (repair/repair mp-fks q)
          opts (get-in out ["stages" 1 "filters" 0 2 1])]
      (is (not (contains? opts "base-type"))))))

(deftest ^:parallel cross-stage-field-type-strips-surrounding-double-quotes-test
  (testing (str "BOT-1587: when the LLM quotes a cross-stage column name like a SQL identifier\n"
                "(`\"count\"` instead of `count`), repair strips the surrounding double-quotes so\n"
                "the name matches the previous stage's output, rewrites the ref to the canonical\n"
                "name, and stamps `base-type`. Without this the typeless, mis-named ref reaches\n"
                "the FE and crashes display-info calculation.")
    (let [q   (assoc-in multi-stage-base-query
                        ["stages" 1 "filters" 0 2 2] "\"count\"")
          out (repair/repair mp-fks q)
          field-clause (get-in out ["stages" 1 "filters" 0 2])
          opts (nth field-clause 1)]
      (testing "name canonicalised (quotes stripped)"
        (is (= "count" (nth field-clause 2))))
      (testing "base-type / effective-type stamped from the previous stage"
        (is (= "type/Integer" (get opts "base-type")))
        (is (= "type/Integer" (get opts "effective-type")))))))

(deftest ^:parallel cross-stage-field-type-unmatched-quoted-name-left-alone-test
  (testing (str "Quote-stripping only rewrites when the stripped name matches a real column.\n"
                "A quoted name whose stripped form still isn't produced by the previous stage is\n"
                "left verbatim (the resolver surfaces the real error with a better message).")
    (let [q   (assoc-in multi-stage-base-query
                        ["stages" 1 "filters" 0 2 2] "\"no_such_column\"")
          out (repair/repair mp-fks q)
          field-clause (get-in out ["stages" 1 "filters" 0 2])
          opts (nth field-clause 1)]
      (is (= "\"no_such_column\"" (nth field-clause 2)) "name left untouched")
      (is (not (contains? opts "base-type"))))))

(deftest ^:parallel cross-stage-field-type-idempotent-test
  (testing "cross-stage field-type inference is idempotent"
    (let [once  (repair/repair mp-fks multi-stage-base-query)
          twice (repair/repair mp-fks once)]
      (is (= once twice)))))

(deftest ^:parallel cross-stage-field-type-quoted-name-idempotent-test
  (testing "the quote-stripping rewrite is also idempotent"
    (let [q     (assoc-in multi-stage-base-query
                          ["stages" 1 "filters" 0 2 2] "\"count\"")
          once  (repair/repair mp-fks q)
          twice (repair/repair mp-fks once)]
      (is (= once twice)))))

(deftest ^:parallel cross-stage-loose-name-remap-test
  (testing "a hyphenated cross-stage ref (`count-where`) is remapped to the canonical
           underscore output column (`count_where`) the aggregation actually produces"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count-where" {}
                                           [">" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]] 5]]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]}
                         {"lib/type" "mbql.stage/mbql"
                          "filters"  [[">" {} ["field" {} "count-where"] 0]]}]}
          out (repair/repair mp-fks q)
          field-clause (get-in out ["stages" 1 "filters" 0 2])]
      (testing "the name is canonicalised to the real output column"
        (is (= "count_where" (nth field-clause 2))))
      (testing "and base-type is stamped from the resolved prefix column"
        (is (contains? (nth field-clause 1) "base-type")))
      (testing "idempotent"
        (is (= out (repair/repair mp-fks out))))))
  (testing "a loose key matching no real column is left untouched for the resolver"
    (let [out (repair/repair mp-fks
                             (assoc-in multi-stage-base-query
                                       ["stages" 1 "filters" 0 2 2] "totally-unknown"))]
      (is (= "totally-unknown" (get-in out ["stages" 1 "filters" 0 2 2])))))
  (testing "a loose key colliding with two columns is left for the resolver (the hits>1 guard)"
    ;; `normalize-col-key` folds case and hyphen/space to underscore, so `Count Where` and
    ;; `count-where` both normalize to `count_where`. Real lib output names don't collide like this,
    ;; so exercise the guard directly on the private matcher.
    (is (nil? (#'repair/match-cross-stage-column
               {"Count Where" {"base-type" "type/Integer"}
                "count-where" {"base-type" "type/Integer"}}
               "count_where")))
    (testing "but a single loose hit still resolves"
      (is (= ["count_where" {"base-type" "type/Integer"}]
             (#'repair/match-cross-stage-column
              {"count_where" {"base-type" "type/Integer"}}
              "Count-Where"))))))

(deftest ^:parallel cross-stage-field-type-end-to-end-resolve-test
  (testing (str "End-to-end: a multi-stage YAML with a stage-1 cross-stage ref lacking\n"
                "base-type is repaired and then `resolve-query` + `lib/query` accept the\n"
                "result without a validation error.")
    ;; This is the exact failure mode that motivated this pass: pre-repair, lib/query throws
    ;; "Invalid output: {:stages [nil {:filters [[nil nil [nil {:base-type ...missing...}]]]}]}"
    (let [repaired (repair/repair mp-fks multi-stage-base-query)
          ;; We can't run the resolver on `mp-fks` (it's a lib mock, not an application-DB MP),
          ;; but we CAN assert that the stage-1 cross-stage ref now carries a base-type -
          ;; that's the structural repair the downstream needs. The actual end-to-end resolve
          ;; is tested against a real application DB in construct_representations_test.
          opts (get-in repaired ["stages" 1 "filters" 0 2 1])]
      (is (= "type/Integer" (get opts "base-type"))))))

;;; ============================================================
;;; Pass 1.5 - expressions shape normalisation (repr-plan step 9)
;;; ============================================================

(deftest ^:parallel expressions-map-shape-normalised-to-sequential-test
  (testing "map-form `expressions:` is converted to a vector of clauses with `lib/expression-name` stamped from the key"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"   "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions" {"Subtotal" ["+" {}
                                                     ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                                     ["field" {} ["Sample" "PUBLIC" "ORDERS" "TAX"]]]}}]}
          repaired (repair/repair trivial-mp q)
          exprs    (get-in repaired ["stages" 0 "expressions"])]
      (is (vector? exprs))
      (is (= 1 (count exprs)))
      (let [clause (first exprs)
            opts   (nth clause 1)]
        (is (= "+" (first clause)))
        (is (= "Subtotal" (get opts "lib/expression-name")))))))

(deftest ^:parallel expressions-sequential-shape-passes-through-test
  (testing "sequential-form `expressions:` is left alone when each clause already carries `lib/expression-name`"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"   "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions" [["+" {"lib/expression-name" "Subtotal"}
                                          ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                          ["field" {} ["Sample" "PUBLIC" "ORDERS" "TAX"]]]]}]}
          repaired (repair/repair trivial-mp q)]
      (is (= (get-in q ["stages" 0 "expressions"])
             (get-in repaired ["stages" 0 "expressions"]))))))

(deftest ^:parallel expressions-sequential-without-name-left-alone-test
  (testing (str "sequential-form without `lib/expression-name` is left as-is; schema\n"
                "validation will surface the missing-name error rather than us making one up.")
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"   "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions" [["+" {}
                                          ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                          ["field" {} ["Sample" "PUBLIC" "ORDERS" "TAX"]]]]}]}
          repaired (repair/repair trivial-mp q)
          opts     (get-in repaired ["stages" 0 "expressions" 0 1])]
      (is (not (contains? opts "lib/expression-name"))))))

(deftest ^:parallel expressions-map-with-existing-name-in-options-preserved-test
  (testing (str "if a map-form entry's clause already has `lib/expression-name` in its options,\n"
                "authored metadata wins and we don't overwrite it.")
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"   "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions" {"FromKey" ["+"
                                                    {"lib/expression-name" "FromOpts"}
                                                    ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                                    1]}}]}
          repaired (repair/repair trivial-mp q)
          clause   (get-in repaired ["stages" 0 "expressions" 0])]
      (is (= "FromOpts" (get-in clause [1 "lib/expression-name"]))))))

(deftest ^:parallel expressions-absent-no-op-test
  (testing "stages without `expressions:` are left alone"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]}]}
          repaired (repair/repair trivial-mp q)]
      (is (= (get-in q ["stages" 0])
             (get-in repaired ["stages" 0]))))))

(deftest ^:parallel expressions-idempotent-test
  (testing "repair is idempotent on expressions: applying twice equals applying once"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions"  {"Subtotal" ["+" {}
                                                      ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                                      ["field" {} ["Sample" "PUBLIC" "ORDERS" "TAX"]]]}}]}
          once  (repair/repair trivial-mp q)
          twice (repair/repair trivial-mp once)]
      (is (= once twice)))))

(deftest ^:parallel expressions-multi-stage-test
  (testing "expression-name stamping works across multiple stages independently"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions"  {"Subtotal" ["+" {}
                                                      ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                                      ["field" {} ["Sample" "PUBLIC" "ORDERS" "TAX"]]]}
                          "aggregation"  [["sum" {} ["expression" {} "Subtotal"]]]}
                         {"lib/type"     "mbql.stage/mbql"
                          "expressions"  {"Doubled" ["*" {}
                                                     ["field" {"base-type" "type/Integer"} "sum"]
                                                     2]}}]}
          repaired (repair/repair trivial-mp q)]
      (is (= "Subtotal"
             (get-in repaired ["stages" 0 "expressions" 0 1 "lib/expression-name"])))
      (is (= "Doubled"
             (get-in repaired ["stages" 1 "expressions" 0 1 "lib/expression-name"]))))))

;;; ============================================================
;;; Pass 2.8 - integer-index aggregation refs → canonical UUID form (repr-plan step 10)
;;; ============================================================

(deftest ^:parallel aggregation-ref-integer-index-happy-path-test
  (testing "a 0-based integer agg-ref in order-by is rewritten to the canonical UUID form"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["sum" {} ["field" {"base-type" "type/Float"}
                                                     ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
                                          ["count" {}]]
                          "order-by"     [["desc" {} ["aggregation" {} 1]]]}]}
          repaired (repair/repair trivial-mp q)
          count-agg (get-in repaired ["stages" 0 "aggregation" 1])
          ref-clause (get-in repaired ["stages" 0 "order-by" 0 2])]
      (testing "target aggregation clause got a lib/uuid stamped"
        (is (uuid-string? (get-in count-agg [1 "lib/uuid"]))))
      (testing "ref last slot is the same UUID as the target aggregation"
        (is (= (get-in count-agg [1 "lib/uuid"])
               (nth ref-clause 2))))
      (testing "ref options got base-type/effective-type from the aggregation head"
        (is (= "type/BigInteger" (get-in ref-clause [1 "base-type"])))
        (is (= "type/BigInteger" (get-in ref-clause [1 "effective-type"])))))))

(deftest ^:parallel aggregation-ref-preserves-authored-options-test
  (testing "authored base-type / name in the ref's options are not overwritten"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "order-by"     [["desc" {} ["aggregation"
                                                      {"base-type"      "type/Float"
                                                       "effective-type" "type/Float"
                                                       "name"           "custom-name"}
                                                      0]]]}]}
          repaired (repair/repair trivial-mp q)
          opts     (get-in repaired ["stages" 0 "order-by" 0 2 1])]
      (is (= "type/Float"  (get opts "base-type")))
      (is (= "type/Float"  (get opts "effective-type")))
      (is (= "custom-name" (get opts "name"))))))

(deftest ^:parallel aggregation-ref-out-of-range-raises-agent-error-test
  (testing "an index past the stage's aggregation vector surfaces an agent-error"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["sum" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
                                          ["count" {}]]
                          "order-by"     [["desc" {} ["aggregation" {} 5]]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (true? (:agent-error? d)))
            (is (= :aggregation-ref-out-of-range (:error d)))
            (is (= 5 (:index d)))
            (is (= 2 (:available d)))
            (is (re-find #"sum at 0" (ex-message e)))
            (is (re-find #"count at 1" (ex-message e)))))))))

(deftest ^:parallel aggregation-ref-string-uuid-is-idempotent-test
  (testing "a ref whose last slot is already a UUID string is left unchanged"
    (let [uuid "11111111-1111-1111-1111-111111111111"
          q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {"lib/uuid" uuid}]]
                          "order-by"     [["desc" {} ["aggregation"
                                                      {"base-type" "type/BigInteger"
                                                       "effective-type" "type/BigInteger"}
                                                      uuid]]]}]}
          repaired (repair/repair trivial-mp q)]
      (is (= uuid (get-in repaired ["stages" 0 "order-by" 0 2 2])))
      (is (= uuid (get-in repaired ["stages" 0 "aggregation" 0 1 "lib/uuid"]))))))

(deftest ^:parallel aggregation-ref-no-aggregations-in-stage-raises-agent-error-test
  (testing "`[aggregation, {}, 0]` with no `aggregation:` clause in the stage is an agent-error"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "order-by"     [["desc" {} ["aggregation" {} 0]]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (true? (:agent-error? d)))
            (is (= :aggregation-ref-no-aggregations (:error d)))))))))

(deftest ^:parallel aggregation-ref-noop-when-no-int-refs-test
  (testing "a stage without integer-indexed agg-refs is left alone by this pass"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]}]}
          repaired (repair/repair trivial-mp q)]
      ;; aggregation still there; no order-by to rewrite
      (is (= [["count" {}]]
             (get-in repaired ["stages" 0 "aggregation"]))))))

(deftest ^:parallel aggregation-ref-idempotent-test
  (testing "repair is a fixed point under repeated application"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["sum" {} ["field" {"base-type" "type/Float"}
                                                     ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
                                          ["count" {}]]
                          "order-by"     [["desc" {} ["aggregation" {} 0]]
                                          ["asc"  {} ["aggregation" {} 1]]]}]}
          once  (repair/repair trivial-mp q)
          twice (repair/repair trivial-mp once)]
      (is (= once twice)))))

(deftest ^:parallel aggregation-ref-type-inference-by-head-test
  (testing "base-type inference from aggregation head"
    (let [mk (fn [agg-clause]
               {"lib/type" "mbql/query"
                "database" "Sample"
                "stages"   [{"lib/type"     "mbql.stage/mbql"
                             "source-table" ["Sample" "PUBLIC" "ORDERS"]
                             "aggregation"  [agg-clause]
                             "order-by"     [["desc" {} ["aggregation" {} 0]]]}]})
          type-of (fn [agg-clause]
                    (-> (repair/repair trivial-mp (mk agg-clause))
                        (get-in ["stages" 0 "order-by" 0 2 1 "base-type"])))]
      (testing "count / distinct / cum-count / count-where → BigInteger"
        (is (= "type/BigInteger" (type-of ["count" {}])))
        (is (= "type/BigInteger" (type-of ["distinct" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]))))
      (testing "avg / median / stddev / var / share → Float"
        (is (= "type/Float" (type-of ["avg" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]])))
        (is (= "type/Float" (type-of ["median" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]))))
      (testing "sum / min / max inherit from inner field when annotated"
        (is (= "type/Float"
               (type-of ["sum" {} ["field" {"base-type" "type/Float"}
                                   ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]))))
      (testing "unknown head → type/*"
        (is (= "type/*" (type-of ["some-new-agg-fn" {}])))))))

(deftest ^:parallel aggregation-ref-multi-stage-same-stage-ref-test
  (testing "a later stage can use integer agg-ref against its own aggregation list"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]}
                         {"lib/type"    "mbql.stage/mbql"
                          "aggregation" [["avg" {} ["field" {"base-type" "type/BigInteger"} "count"]]]
                          "order-by"    [["desc" {} ["aggregation" {} 0]]]}]}
          repaired (repair/repair trivial-mp q)
          stage1-agg-uuid (get-in repaired ["stages" 1 "aggregation" 0 1 "lib/uuid"])
          stage1-ref-uuid (get-in repaired ["stages" 1 "order-by" 0 2 2])]
      (is (uuid-string? stage1-agg-uuid))
      (is (= stage1-agg-uuid stage1-ref-uuid))
      (is (= "type/Float"
             (get-in repaired ["stages" 1 "order-by" 0 2 1 "base-type"]))))))

;;; ============================================================
;;; Pass 2.9 - auto-split post-aggregation filter into a second stage
;;; ============================================================

(deftest ^:parallel split-post-agg-filter-simple-count-test
  (testing "filter [> count 10] on stage with aggregation [count] is split into two stages"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [[">" {} ["aggregation" {} 0] 10]]}]}
          repaired (repair/repair trivial-mp q)
          stages   (get repaired "stages")]
      (is (= 2 (count stages)) "must produce two stages")
      (testing "stage 0 keeps source/aggregation/breakout, drops the offending filter"
        (is (= ["Sample" "PUBLIC" "ORDERS"] (get-in stages [0 "source-table"])))
        (is (= [["count" (get-in stages [0 "aggregation" 0 1])]]
               (get-in stages [0 "aggregation"])))
        (is (some? (get-in stages [0 "breakout"])))
        (is (not (contains? (nth stages 0) "filters"))))
      (testing "stage 1 has the rewritten filter as cross-stage field ref"
        (is (= "mbql.stage/mbql" (get-in stages [1 "lib/type"])))
        (is (not (contains? (nth stages 1) "source-table")))
        (is (= [[">" {} ["field" {} "count"] 10]]
               (get-in stages [1 "filters"])))))))

(deftest ^:parallel split-post-agg-filter-keeps-pre-agg-filters-test
  (testing "pre-agg filters stay in stage 0; only the post-agg filter moves"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "complete"]
                                          [">" {} ["aggregation" {} 0] 10]]}]}
          stages (get (repair/repair trivial-mp q) "stages")]
      (is (= 2 (count stages)))
      (testing "pre-agg filter stays in stage 0"
        (is (= [["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "complete"]]
               (get-in stages [0 "filters"]))))
      (testing "post-agg filter moves to stage 1 with cross-stage ref"
        (is (= [[">" {} ["field" {} "count"] 10]]
               (get-in stages [1 "filters"])))))))

(deftest ^:parallel split-post-agg-refuses-when-order-by-present-test
  (testing (str "post-agg filter + `order-by` in the same stage is refused with a clean "
                ":agent-error? — auto-relocating ordering is unsafe (the order-by may "
                "reference a pre-agg column that doesn't survive the split, and forcing the "
                "LLM to author two stages explicitly preserves the user's intent)")
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [[">" {} ["aggregation" {} 0] 10]]
                          "order-by"     [["desc" {} ["aggregation" {} 0]]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (true? (:agent-error? data)))
            (is (= :post-agg-filter-with-trailing-clauses (:error data)))
            (testing "diagnostic names the offending stage shape"
              (is (re-find #"order-by" (ex-message e))))))))))

(deftest ^:parallel split-post-agg-refuses-when-limit-present-test
  (testing "post-agg filter + bare `limit` in the same stage is also refused"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [[">" {} ["aggregation" {} 0] 10]]
                          "limit"        5}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= :post-agg-filter-with-trailing-clauses (:error (ex-data e)))))))))

(deftest ^:parallel split-post-agg-refuses-when-fields-present-test
  (testing "post-agg filter + `fields` in the same stage is also refused"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "fields"       [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [[">" {} ["aggregation" {} 0] 10]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= :post-agg-filter-with-trailing-clauses (:error (ex-data e)))))))))

(deftest ^:parallel split-post-agg-refuses-when-raw-column-order-by-test
  (testing (str "specifically the pre-agg `order-by [desc TOTAL]` case the reviewer flagged "
                "as silent-intent-destruction in the prior implementation: TOTAL doesn't "
                "survive aggregation and naively moving it to stage 1 produced either a "
                "'no matching field' error or a silently-wrong row set. Now refused.")
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [[">" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]] 100]
                                          [">" {} ["aggregation" {} 0] 1]]
                          "order-by"     [["desc" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                          "limit"        10}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= :post-agg-filter-with-trailing-clauses (:error (ex-data e)))))))))

(deftest ^:parallel split-post-agg-uses-name-override-when-present-test
  (testing "an aggregation with `name` override produces a cross-stage ref by that name"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {"name" "Total Orders"}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [[">" {} ["aggregation" {} 0] 10]]}]}
          stages (get (repair/repair trivial-mp q) "stages")]
      (is (= 2 (count stages)))
      (is (= [[">" {} ["field" {} "Total Orders"] 10]]
             (get-in stages [1 "filters"]))))))

(deftest ^:parallel split-post-agg-multiple-aggregations-test
  (testing "with multiple aggregations of DIFFERENT heads, each gets its own column-name mapping"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]
                                          ["sum" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [[">" {} ["aggregation" {} 0] 10]
                                          [">" {} ["aggregation" {} 1] 100]]}]}
          stages (get (repair/repair trivial-mp q) "stages")]
      (is (= 2 (count stages)))
      (is (= [[">" {} ["field" {} "count"] 10]
              [">" {} ["field" {} "sum"]   100]]
             (get-in stages [1 "filters"]))))))

(deftest ^:parallel split-post-agg-refuses-on-duplicate-column-names-test
  (testing (str "two `sum` aggregations on different fields would both map to the static "
                "column name \"sum\"; lib's `unique-name-generator` would dedup to "
                "`sum` / `sum_2` based on field order, which our static table cannot "
                "replicate without recreating the generator. We refuse the split with a "
                "clean diagnostic rather than emit a cross-stage `[\"field\" {} \"sum\"]` "
                "ref that filters against whichever column happens to come first.")
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["sum" {"lib/uuid" "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
                                           ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
                                          ["sum" {"lib/uuid" "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}
                                           ["field" {} ["Sample" "PUBLIC" "ORDERS" "TAX"]]]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [[">" {} ["aggregation" {} "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"] 100]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)
                msg  (ex-message e)]
            (is (true? (:agent-error? data)))
            (is (= :post-agg-filter-needs-multi-stage (:error data)))
            (testing "message names the duplicate-column-name failure mode"
              (is (re-find #"same column name" msg)))
            (testing "message offers the `name` opts override as a remedy"
              (is (re-find #"name" msg)))))))))

(deftest ^:parallel split-post-agg-same-head-with-name-overrides-test
  (testing (str "explicit `name` opts override resolves the duplicate-name collision: the "
                "user gets the split they intended.")
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["sum" {"lib/uuid" "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
                                                  "name"     "sum_total"}
                                           ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
                                          ["sum" {"lib/uuid" "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
                                                  "name"     "sum_tax"}
                                           ["field" {} ["Sample" "PUBLIC" "ORDERS" "TAX"]]]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [[">" {} ["aggregation" {} "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"] 100]]}]}
          stages (get (repair/repair trivial-mp q) "stages")]
      (is (= 2 (count stages)))
      (testing "cross-stage ref correctly points at sum_tax (the filtered uuid), NOT sum_total"
        (is (= [[">" {} ["field" {} "sum_tax"] 100]]
               (get-in stages [1 "filters"])))))))

(deftest ^:parallel split-post-agg-metric-emits-diagnostic-test
  (testing "metric aggregation we can't auto-resolve raises clean :agent-error?"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["metric" {"lib/uuid" "11111111-1111-1111-1111-111111111111"} "@card-1"]]
                          "filters"      [[">" {} ["aggregation" {} "11111111-1111-1111-1111-111111111111"] 10]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (true? (:agent-error? (ex-data e))))
          (is (= :post-agg-filter-needs-multi-stage (:error (ex-data e)))))))))

(deftest ^:parallel split-post-agg-no-trigger-when-no-agg-ref-test
  (testing "stage with aggregation but no agg-ref-filter is left alone"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "filters"      [["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "x"]]}]}
          stages (get (repair/repair trivial-mp q) "stages")]
      (is (= 1 (count stages))))))

(deftest ^:parallel split-post-agg-no-trigger-when-no-aggregations-test
  (testing "stage with no aggregations is never split, even if filter has an aggregation-ref shape"
    ;; The agg-ref points to nothing in this stage - resolve-aggregation-ref-indexes will
    ;; have already raised. We just verify split doesn't add a phantom stage on its own.
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "filters"      [["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "x"]]}]}
          stages (get (repair/repair trivial-mp q) "stages")]
      (is (= 1 (count stages))))))

(deftest ^:parallel split-post-agg-idempotent-test
  (testing "repair on an already-split query is a no-op"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "filters"      [[">" {} ["aggregation" {} 0] 10]]}]}
          once  (repair/repair trivial-mp q)
          twice (repair/repair trivial-mp once)]
      (is (= 2 (count (get once "stages"))))
      (is (= once twice)))))

(deftest ^:parallel split-post-agg-handles-distinct-and-count-where-test
  (testing "distinct and count-where get correct lib column names"
    (let [build (fn [agg]
                  {"lib/type" "mbql/query"
                   "database" "Sample"
                   "stages"   [{"lib/type"     "mbql.stage/mbql"
                                "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                "aggregation"  [agg]
                                "filters"      [[">" {} ["aggregation" {} 0] 1]]}]})]
      (testing "distinct → count"
        (is (= [[">" {} ["field" {} "count"] 1]]
               (get-in (repair/repair trivial-mp
                                      (build ["distinct" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]]))
                       ["stages" 1 "filters"]))))
      (testing "count-where → count_where"
        (is (= [[">" {} ["field" {} "count_where"] 1]]
               (get-in (repair/repair trivial-mp
                                      (build ["count-where" {} ["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "x"]]))
                       ["stages" 1 "filters"])))))))

;;; ============================================================
;;; Pass 6 - friendly error messages (E1..E6)
;;; ============================================================

;;; ----- E1: [field, ...] in aggregation block ---------------------------------------

(deftest ^:parallel friendly-error-field-as-aggregation-entry-test
  (testing "a `[field, ...]` directly inside `aggregation:` raises clean :agent-error?"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (true? (:agent-error? data)))
            (is (= :aggregation-entry-not-aggregation (:error data)))
            (is (= 0 (:stage-index data)))
            (is (= 0 (:entry-index data)))
            (is (re-find #"aggregation" (ex-message e)))
            (is (re-find #"breakout" (ex-message e)))))))))

(deftest ^:parallel friendly-error-canonical-aggregation-passes-test
  (testing "canonical aggregation entries (count, sum, avg, metric) do NOT trigger"
    (doseq [agg [["count" {}]
                 ["sum" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
                 ["avg" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
                 ["metric" {} "@card-1"]]]
      (let [q {"lib/type" "mbql/query"
               "database" "Sample"
               "stages"   [{"lib/type"     "mbql.stage/mbql"
                            "source-table" ["Sample" "PUBLIC" "ORDERS"]
                            "aggregation"  [agg]}]}]
        (is (some? (repair/repair trivial-mp q)) (str "should not throw on " agg))))))

(deftest ^:parallel friendly-error-field-nested-inside-aggregation-passes-test
  (testing "a `field` clause NESTED inside an aggregation (its argument) does NOT trigger"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["sum" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]}]}]
      (is (some? (repair/repair trivial-mp q))))))

(deftest ^:parallel friendly-error-multi-stage-stage-index-test
  (testing "multi-stage: error names the correct stage index"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]}
                         {"lib/type"    "mbql.stage/mbql"
                          "aggregation" [["field" {} "count"]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= 1 (:stage-index (ex-data e)))))))))

;;; ----- E2: case/if with "default" in opts ------------------------------------------

(deftest ^:parallel friendly-error-case-default-in-opts-test
  (testing "`case` with `default` in options raises clean :agent-error?"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions"  [["case" {"default" "unknown" "lib/expression-name" "Bucket"}
                                           [[["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]] 0] "zero"]]]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (true? (:agent-error? data)))
            (is (= :case-default-in-opts (:error data)))
            (is (re-find #"third positional argument" (ex-message e))))))))
  (testing "`if` with `default` in options also triggers"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions"  [["if" {"default" "no" "lib/expression-name" "Y"}
                                           [[["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]] 0] "yes"]]]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= :case-default-in-opts (:error (ex-data e)))))))))

(deftest ^:parallel friendly-error-case-canonical-default-passes-test
  (testing "canonical `case` with default as 3rd arg does NOT trigger"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions"  [["case" {"lib/expression-name" "Bucket"}
                                           [[["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]] 0] "zero"]]
                                           "unknown"]]}]}]
      (is (some? (repair/repair trivial-mp q)))))
  (testing "case with no default at all also passes"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions"  [["case" {"lib/expression-name" "Bucket"}
                                           [[["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]] 0] "zero"]]]]}]}]
      (is (some? (repair/repair trivial-mp q))))))

;;; ----- E3: sexp-legacy top-level ops used as clause heads --------------------------

(deftest ^:parallel friendly-error-sexp-legacy-aggregate-test
  (testing "`[aggregate, ...]` as a clause head raises clean :agent-error?"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["aggregate" {} ["count" {}]]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (true? (:agent-error? data)))
            (is (= :sexp-legacy-op-as-clause (:error data)))
            (is (= "aggregate" (:head data)))
            (is (re-find #"top-level operation" (ex-message e)))))))))

(deftest ^:parallel friendly-error-sexp-legacy-filter-test
  (testing "`[filter, ...]` as a clause head triggers"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "filters"      [["filter" {} ["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "x"]]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= "filter" (:head (ex-data e)))))))))

(deftest ^:parallel friendly-error-sexp-legacy-each-op-mentioned-test
  (testing "every legacy op (aggregate/filter/order-by/breakout/limit) is recognised"
    (doseq [head ["aggregate" "filter" "order-by" "breakout" "limit"]]
      (let [q {"lib/type" "mbql/query"
               "database" "Sample"
               "stages"   [{"lib/type"     "mbql.stage/mbql"
                            "source-table" ["Sample" "PUBLIC" "ORDERS"]
                            ;; Stuff a sexp-legacy op clause into expressions to ensure the
                            ;; tree walk reaches it regardless of which stage block we're
                            ;; defending against.
                            "expressions"  [[head {"lib/expression-name" "X"} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]}]}]
        (try
          (repair/repair trivial-mp q)
          (is false (str "should have thrown for " head))
          (catch clojure.lang.ExceptionInfo e
            (is (= head (:head (ex-data e))) (str "head mismatch for " head))))))))

(deftest ^:parallel friendly-error-canonical-stage-keys-pass-test
  (testing "canonical stage-level keys (aggregation:, filters:, etc.) do NOT trigger"
    ;; The sexp-legacy detector targets clause heads (vector slot-0 strings), not stage
    ;; map keys. A perfectly valid stage with `aggregation:` / `filters:` keys passes.
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "filters"      [["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "x"]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
                          "order-by"     [["asc" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]]]
                          "limit"        10}]}]
      (is (some? (repair/repair trivial-mp q))))))

;;; ----- E4: `[measure, ...]` was historically rejected; now a first-class clause -----

(deftest ^:parallel measure-clause-passes-repair-test
  (testing (str "`[measure, {}, <portable_entity_id>]` is a first-class aggregation clause "
                "(was rejected by the now-deleted E4 sexp-legacy-measure-error! check). "
                "Lookup/resolution happens in the resolve layer, not repair.")
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["measure" {} "@card-1"]]}]}]
      (is (some? (repair/repair trivial-mp q))))))

(deftest ^:parallel friendly-error-canonical-metric-passes-test
  (testing "canonical `[metric, {}, <portable_entity_id>]` does NOT trigger E4"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["metric" {} "@card-1"]]}]}]
      (is (some? (repair/repair trivial-mp q))))))

;;; ----- E5: blank [expression, opts, ""] reference ----------------------------------

(deftest ^:parallel friendly-error-blank-expression-ref-test
  (testing "`[expression, {}, \"\"]` blank ref raises clean :agent-error?"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions"  [["+" {"lib/expression-name" "X"}
                                           ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]] 1]]
                          "filters"      [["=" {} ["expression" {} ""] 0]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (true? (:agent-error? data)))
            (is (= :blank-expression-ref (:error data))))))))
  (testing "`[expression, {}, \"   \"]` (whitespace-only) also triggers"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "filters"      [["=" {} ["expression" {} "   "] 0]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= :blank-expression-ref (:error (ex-data e))))))))
  (testing "`[expression, {}, nil]` (non-string) also triggers"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "filters"      [["=" {} ["expression" {} nil] 0]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= :blank-expression-ref (:error (ex-data e)))))))))

(deftest ^:parallel friendly-error-non-blank-expression-ref-passes-test
  (testing "valid `[expression, {}, \"my-expr\"]` does NOT trigger"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "expressions"  [["+" {"lib/expression-name" "my-expr"}
                                           ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]] 1]]
                          "filters"      [["=" {} ["expression" {} "my-expr"] 0]]}]}]
      (is (some? (repair/repair trivial-mp q))))))

;;; ----- E6: numeric [field, opts, 100] (sexp legacy form) ---------------------------

(deftest ^:parallel friendly-error-numeric-field-id-test
  (testing "`[field, {}, 100]` (numeric id) raises clean :agent-error?"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "filters"      [["=" {} ["field" {} 100] 0]]}]}]
      (try
        (repair/repair trivial-mp q)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (true? (:agent-error? data)))
            (is (= :numeric-field-id (:error data)))
            (is (re-find #"portable FK" (ex-message e)))
            (is (re-find #"column-name" (ex-message e)))))))))

(deftest ^:parallel friendly-error-portable-fk-passes-test
  (testing "canonical portable-FK `[field, {}, [Sample, PUBLIC, ORDERS, COL]]` does NOT trigger"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "filters"      [["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "x"]]}]}]
      (is (some? (repair/repair trivial-mp q))))))

(deftest ^:parallel friendly-error-cross-stage-string-col-passes-test
  (testing "cross-stage string column-name `[field, {}, \"count\"]` does NOT trigger"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]}
                         {"lib/type" "mbql.stage/mbql"
                          "filters"  [[">" {} ["field" {} "count"] 10]]}]}]
      (is (some? (repair/repair trivial-mp q))))))

;;; ============================================================
;;; Pass 1.88 - merge trailing options-map into position-1 opts
;;; ============================================================

(deftest ^:parallel merge-trailing-options-time-interval-test
  (testing (str "BOT-1603: when the LLM puts a clause's options at the END of a fixed-arity\n"
                "tuple clause instead of position 1, repair merges the trailing map into the\n"
                "position-1 options and drops the trailing element. The canonical example is\n"
                "`time-interval` with `{include-current true}` written as a 6th element.")
    (let [bug      ["time-interval" {}
                    ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
                    -1 "month" {"include-current" true}]
          repaired (repair/repair trivial-mp bug)]
      (is (= ["time-interval" {"include-current" true}
              ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
              -1 "month"]
             repaired)))))

(deftest ^:parallel merge-trailing-options-other-fixed-arity-test
  (testing "the pass is generic, not time-interval-specific: works for any fixed-arity tuple"
    (testing "during (5-tuple)"
      (is (= ["during" {"foo" "bar"}
              ["field" {} ["S" "P" "T" "C"]]
              "2024-01-01" "day"]
             (repair/repair trivial-mp
                            ["during" {}
                             ["field" {} ["S" "P" "T" "C"]]
                             "2024-01-01" "day" {"foo" "bar"}]))))
    (testing "power (4-tuple)"
      (is (= ["power" {"lib/uuid" "u"} 2 3]
             (repair/repair trivial-mp
                            ["power" {} 2 3 {"lib/uuid" "u"}]))))
    (testing "regex-match-first (4-tuple)"
      (is (= ["regex-match-first" {"case-sensitive" false}
              ["field" {} ["S" "P" "T" "C"]] "x.*"]
             (repair/repair trivial-mp
                            ["regex-match-first" {}
                             ["field" {} ["S" "P" "T" "C"]]
                             "x.*" {"case-sensitive" false}]))))))

(deftest ^:parallel merge-trailing-options-nested-in-filters-test
  (testing (str "the misplaced trailing options can be nested arbitrarily deep - repair's\n"
                "postwalk reaches a time-interval clause nested inside `and` inside the\n"
                "stage's filters: block.")
    (let [q   {"lib/type" "mbql/query"
               "stages"   [{"lib/type"     "mbql.stage/mbql"
                            "source-table" ["Sample" "PUBLIC" "ORDERS"]
                            "filters"      [["and" {}
                                             ["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "x"]
                                             ["time-interval" {}
                                              ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
                                              -1 "month" {"include-current" true}]]]}]}
          out (repair/repair trivial-mp q)
          ti  (get-in out ["stages" 0 "filters" 0 3])]
      (is (= ["time-interval" {"include-current" true}
              ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]
              -1 "month"]
             ti)))))

(deftest ^:parallel merge-trailing-options-trailing-keys-win-test
  (testing (str "when both position-1 opts and the trailing map carry content, trailing keys\n"
                "win on conflict. Rationale: the trailing map is where the LLM wrote\n"
                "deliberate content; position 1 is almost always `{}`.")
    (let [bug      ["time-interval" {"include-current" false "lib/uuid" "stays"}
                    ["field" {} ["S" "P" "T" "C"]]
                    -1 "month" {"include-current" true}]
          repaired (repair/repair trivial-mp bug)]
      (is (= ["time-interval" {"include-current" true "lib/uuid" "stays"}
              ["field" {} ["S" "P" "T" "C"]]
              -1 "month"]
             repaired)))))

(deftest ^:parallel merge-trailing-options-no-op-on-correct-arity-test
  (testing "well-formed clause is unchanged"
    (let [ti ["time-interval" {"include-current" true}
              ["field" {} ["S" "P" "T" "C"]]
              -1 "month"]]
      (is (= ti (repair/repair trivial-mp ti))))))

(deftest ^:parallel merge-trailing-options-skips-variadic-test
  (testing (str "variadic clauses (`and`, `or`, `=`, `in`, `case`, ...) use `:catn` and are\n"
                "excluded from the registry-derived fixed-arity map. A trailing map on a\n"
                "variadic clause might be a legitimate arg (or just bad input the schema will\n"
                "reject) - we don't second-guess.")
    (let [bug ["and" {}
               [">" {} ["field" {} ["S" "P" "T" "X"]] 10]
               [">" {} ["field" {} ["S" "P" "T" "Y"]] 20]
               {"trailing" "stays"}]]
      (is (= bug (repair/repair trivial-mp bug))))))

(deftest ^:parallel merge-trailing-options-skips-off-by-two-test
  (testing (str "the pass only fires when count is exactly `expected + 1`. Two extra\n"
                "elements is too ambiguous - leave it for the schema validator to reject.")
    (let [bug ["time-interval" {}
               ["field" {} ["S" "P" "T" "C"]]
               -1 "month" {"include-current" true} {"extra" 1}]]
      (is (= bug (repair/repair trivial-mp bug))))))

(deftest ^:parallel merge-trailing-options-skips-unknown-clause-test
  (testing "clauses whose head is not in the fixed-arity registry are left alone"
    (let [bug ["totally-made-up-op" {} "arg1" {"trailing" "map"}]]
      (is (= bug (repair/repair trivial-mp bug))))))

(deftest ^:parallel merge-trailing-options-idempotent-test
  (testing "repair(repair(q)) = repair(q)"
    (let [bug   ["time-interval" {}
                 ["field" {} ["S" "P" "T" "C"]]
                 -1 "month" {"include-current" true}]
          once  (repair/repair trivial-mp bug)
          twice (repair/repair trivial-mp once)]
      (is (= once twice)))))

(deftest ^:parallel fixed-arity-clause-counts-populated-test
  (testing (str "registry-derived fixed-arity map is populated and contains the well-known\n"
                "entries. Catches accidents like the schema namespaces not being loaded at the\n"
                "time the namespace initializes the delay.")
    (let [counts (force @#'repair/fixed-arity-clause-element-counts)]
      (is (pos? (count counts)))
      (testing "well-known fixed-arity clauses are in the map with correct counts"
        (is (= 5 (get counts "time-interval")))
        (is (= 5 (get counts "during")))
        (is (= 7 (get counts "relative-time-interval")))
        (is (= 3 (get counts "segment")))
        (is (= 3 (get counts "sum")))
        (is (= 4 (get counts "power"))))
      (testing "variadic clauses are excluded"
        (is (not (contains? counts "and")))
        (is (not (contains? counts "or")))
        (is (not (contains? counts "case")))
        (is (not (contains? counts "coalesce")))))))

;;; ============================================================
;;; Pass 1.89 - merge trailing options-map into position-1 opts on N-ary string filters
;;; ============================================================

(deftest ^:parallel merge-string-filter-trailing-options-test
  (testing (str "N-ary string-search filters carry case-sensitivity in their position-1 options,\n"
                "but LLMs append it as a trailing map. These clauses are variadic, so the\n"
                "fixed-arity merge-trailing-options pass skips them; this pass merges the trailing\n"
                "map (a string-search value is never a map, so it is unambiguously misplaced opts).")
    (testing "contains"
      (is (= ["contains" {"case-sensitive" false}
              ["field" {} ["S" "P" "T" "EMAIL"]] "@gmail.com"]
             (repair/repair trivial-mp
                            ["contains" {}
                             ["field" {} ["S" "P" "T" "EMAIL"]] "@gmail.com"
                             {"case-sensitive" false}]))))
    (testing "starts-with / ends-with / does-not-contain"
      (doseq [head ["starts-with" "ends-with" "does-not-contain"]]
        (is (= [head {"case-sensitive" false} ["field" {} ["S" "P" "T" "C"]] "x"]
               (repair/repair trivial-mp
                              [head {} ["field" {} ["S" "P" "T" "C"]] "x"
                               {"case-sensitive" false}]))
            head)))))

(deftest ^:parallel merge-string-filter-trailing-options-multi-value-test
  (testing "multiple string values + trailing options: only the trailing map is merged"
    (is (= ["contains" {"case-sensitive" true} ["field" {} ["S" "P" "T" "C"]] "a" "b"]
           (repair/repair trivial-mp
                          ["contains" {} ["field" {} ["S" "P" "T" "C"]] "a" "b"
                           {"case-sensitive" true}])))))

(deftest ^:parallel merge-string-filter-trailing-options-keys-win-test
  (testing "trailing keys win on conflict; existing position-1 keys are preserved"
    (is (= ["contains" {"case-sensitive" false "lib/uuid" "u"} ["field" {} ["S" "P" "T" "C"]] "x"]
           (repair/repair trivial-mp
                          ["contains" {"case-sensitive" true "lib/uuid" "u"}
                           ["field" {} ["S" "P" "T" "C"]] "x"
                           {"case-sensitive" false}])))))

(deftest ^:parallel merge-string-filter-trailing-options-nested-in-and-test
  (testing (str "a contains clause with trailing case-sensitivity options, nested inside `and`\n"
                "inside the stage filters (the gmail-customers repro), is repaired via postwalk")
    (let [q   {"lib/type" "mbql/query"
               "stages"   [{"lib/type"     "mbql.stage/mbql"
                            "source-table" ["Sample" "PUBLIC" "ORDERS"]
                            "filters"      [["and" {}
                                             ["=" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "active"]
                                             ["contains" {}
                                              ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]]
                                              "@gmail.com" {"case-sensitive" false}]]]}]}
          out (repair/repair trivial-mp q)
          ;; and-clause is ["and" {} <=-cond> <contains-cond>]; the contains is at index 3
          c   (get-in out ["stages" 0 "filters" 0 3])]
      (is (= ["contains" {"case-sensitive" false}
              ["field" {} ["Sample" "PUBLIC" "ORDERS" "STATUS"]] "@gmail.com"]
             c)))))

(deftest ^:parallel merge-string-filter-trailing-options-no-op-test
  (testing "well-formed string filters are unchanged"
    (testing "options already in position 1"
      (let [ok ["contains" {"case-sensitive" false} ["field" {} ["S" "P" "T" "C"]] "x"]]
        (is (= ok (repair/repair trivial-mp ok)))))
    (testing "plain contains with no trailing options map"
      (let [ok ["contains" {} ["field" {} ["S" "P" "T" "C"]] "x"]]
        (is (= ok (repair/repair trivial-mp ok)))))))

(deftest ^:parallel merge-string-filter-trailing-options-idempotent-test
  (testing "repair(repair(q)) = repair(q)"
    (let [bug  ["contains" {} ["field" {} ["S" "P" "T" "C"]] "x" {"case-sensitive" false}]
          once (repair/repair trivial-mp bug)]
      (is (= once (repair/repair trivial-mp once))))))
