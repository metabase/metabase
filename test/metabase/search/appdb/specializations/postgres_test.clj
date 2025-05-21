(ns metabase.search.appdb.specializations.postgres-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.specialization.postgres :as search.postgres]
   [metabase.test.util :as tu]
   [metabase.util.i18n :as i18n]))

(def search-expr #'search.postgres/to-tsquery-expr)

(deftest to-tsquery-expr-test
  (is (= "'a' & 'b' & 'c':*"
         (search-expr "a b c")))

  (is (= "'a' & 'b' & 'c':*"
         (search-expr "a AND b AND c")))

  (is (= "'a' & 'b' & 'c'"
         (search-expr "a b \"c\"")))

  (is (= "'a' & 'b' | 'c':*"
         (search-expr "a b or c")))

  (is (= "'this' & !'that':*"
         (search-expr "this -that")))

  (testing "hyphens"
    (is (= "'[ops' & 'monitoring]' & '-' & 'available':*"
           (search-expr "[ops monitoring] - available")))
    (is (= "'[ops' & 'monitoring]' & '--' & 'available':*"
           (search-expr "[ops monitoring] -- available")))
    (is (= "'[ops' & 'monitoring]' & 'not-available':*"
           (search-expr "[ops monitoring] not-available"))))

  (is (= "'a' & 'b' & 'c' <-> 'd' & 'e' | 'b' & 'e':*"
         (search-expr "a b \" c d\" e or b e")))

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
           (search-expr "you're")))))

(deftest available-tsv-languages
  (when (= :postgres (mdb/db-type))
    (let [available @#'search.postgres/available-tsv-languages]
      (is (= :english (:en available)))
      (is (= :german (:de available)))
      (is (nil? (:ko available))))))

(deftest tsv-language
  (when (= :postgres (mdb/db-type))
    (binding [i18n/*site-locale-override* "en"]
      (is (= "english" (#'search.postgres/tsv-language))))
    (binding [i18n/*site-locale-override* "de"]
      (is (= "german" (#'search.postgres/tsv-language))))
    (binding [i18n/*site-locale-override* "pt_BR"]
      (is (= "portuguese" (#'search.postgres/tsv-language))))
    (binding [i18n/*site-locale-override* "ko"]
      (is (= "simple" (#'search.postgres/tsv-language))))
    (tu/with-temporary-setting-values [search-language "custom-value"]
      (is (= "custom-value" (#'search.postgres/tsv-language))))))
