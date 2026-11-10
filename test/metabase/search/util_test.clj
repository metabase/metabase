(ns metabase.search.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.util :as search.util]
   [metabase.test.util :as tu]
   [metabase.util.i18n :as i18n]))

(def ^:private impossible? search.util/impossible-condition?)

(deftest ^:parallel impossible-condition?-test
  (is (not (impossible? [:= "card" :this.type])))
  (is (not (impossible? [:= :that.type :this.type])))
  (is (impossible? [:= "card" "dashboard"]))
  (is (not (impossible? [:= "card" "card"])))
  (is (not (impossible? [:!= "card" "dashboard"])))
  (is (impossible? [:!= "card" "card"]))
  (is (not (impossible? [:and [:= 1 :this.id] [:= "card" :this.type]])))
  (is (impossible? [:and [:= 1 :this.id] [:!= "card" "card"]]))
  (is (not (impossible? [:and [:= 1 :this.id] [:!= "card" "dashboard"]])))
  (is (not (impossible? [:or [:= 1 :this.id] [:!= "card" "dashboard"]])))
  (is (impossible? [:or [:= "oh" "no"] [:= "card" "dashboard"]])))

;;; ============================================================================
;;; Postgres-specific utility tests
;;; ============================================================================

(def search-expr #'search.util/to-tsquery-expr)

(deftest to-tsquery-expr-test
  (is (= "'a' & 'b' & 'c':*"
         (search-expr "a b c")))
  (is (= "'a' & 'b' & 'c':*"
         (search-expr "a AND b AND c")))
  (is (= "'a' & 'b' & 'c'"
         (search-expr "a b \"c\"")))
  (is (= "'a' & 'b' | 'c':*"
         (search-expr "a b or c")))
  (is (= "'a' | 'b':*"
         (search-expr "a or and or b")))
  (is (= "'this' & !'that':*"
         (search-expr "this -that")))
  (testing "hyphens"
    (is (= "'[ops' & 'monitoring]' & '-' & 'available':*"
           (search-expr "[ops monitoring] - available")))
    (is (= "'[ops' & 'monitoring]' & '--' & 'available':*"
           (search-expr "[ops monitoring] -- available")))
    (is (= "'[ops' & 'monitoring]' & 'not-available':*"
           (search-expr "[ops monitoring] not-available"))))
  (is (= "'a' & 'b' & 'c' <-> 'd' & 'e' | 'b' & 'e'"
         (search-expr "a b \" c d\" e or b e"))
      "the final `e` repeats one from the other branch, so it was typed in full")
  (is  (= "'ab' <-> 'and' <-> 'cde' <-> 'f' | !'abc' & 'def' & 'ghi' | 'jkl' <-> 'mno' <-> 'or' <-> 'pqr'"
          (search-expr "\"ab and cde f\" or -abc def AND ghi OR \"jkl mno OR pqr\"")))
  (is (= "'big' & 'data' | 'business' <-> 'intelligence' | 'data' & 'wrangling':*"
         (search-expr "Big Data oR \"Business Intelligence\" OR data and wrangling")))
  (testing "unbalanced quotes"
    (is (= "'big' <-> 'data' & 'big' <-> 'mistake':*"
           (search-expr "\"Big Data\" \"Big Mistake")))
    (is (= "'something'"
           (search-expr "something \""))))
  (is (= "'partial' <-> 'quoted' <-> 'and' <-> 'or' <-> '-split':*"
         (search-expr "\"partial quoted AND OR -split")))
  (testing "dangerous characters"
    (is (= "'you' & '<-' & 'pointing':*"
           (search-expr "you <- pointing"))))
  (testing "backslash"
    (is (= "'test\\\\':*" (search-expr "test\\"))))
  (testing "single quotes"
    (is (= "'you''re':*"
           (search-expr "you're"))))
  (testing "a final word that already appeared earlier was typed in full, so it is not a prefix"
    (is (= "'revenue' & 'revenue'"
           (search-expr "revenue revenue")))
    (is (= "'revenue' & 'dogs' & 'revenue'"
           (search-expr "Revenue dogs revenue")))
    (is (= "'revenue' | 'dogs' | 'revenue'"
           (search-expr "revenue or dogs or revenue")))
    (is (= "'monthly' <-> 'revenue' & 'revenue'"
           (search-expr "\"monthly revenue\" revenue"))
        "a word inside an earlier phrase counts")
    (is (= "!'revenue' & 'revenue'"
           (search-expr "-revenue revenue"))
        "so does a negated word")
    (is (= "'revenue' <-> 'revenue'"
           (search-expr "\"revenue revenue"))
        "within an unfinished phrase too")
    (is (= "'revenue' & 'revenue'"
           (search-expr "revenue revenue and"))
        "a trailing connective is dropped, so the word before it is the final word")
    (is (= "'revenue' & 'rev':*"
           (search-expr "revenue rev"))
        "a different final word still completes")
    (is (= "'revenue' & 'rev':*"
           (search-expr "revenue rev or"))
        "including before a trailing connective"))
  (testing "a closed phrase stays exact when a trailing connective follows it"
    (is (= "'monthly' <-> 'revenue'"
           (search-expr "\"monthly revenue\" and")))
    (is (= "'monthly' <-> 'revenue'"
           (search-expr "\"monthly revenue\" or")))))

(deftest available-tsv-languages-test
  (when (= :postgres (mdb/db-type))
    (let [available (#'search.util/available-tsv-languages)]
      (is (= :english (:en available)))
      (is (= :german (:de available)))
      (is (nil? (:ko available))))))

(deftest tsv-language-test
  (when (= :postgres (mdb/db-type))
    (binding [i18n/*site-locale-override* "en"]
      (is (= "english" (#'search.util/tsv-language))))
    (binding [i18n/*site-locale-override* "de"]
      (is (= "german" (#'search.util/tsv-language))))
    (binding [i18n/*site-locale-override* "pt_BR"]
      (is (= "portuguese" (#'search.util/tsv-language))))
    (binding [i18n/*site-locale-override* "ko"]
      (is (= "simple" (#'search.util/tsv-language))))
    (tu/with-temporary-setting-values [search-language "custom-value"]
      (is (= "custom-value" (#'search.util/tsv-language))))))
