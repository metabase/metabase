(ns metabase.search.appdb.specializations.postgres-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.appdb.specialization.postgres :as search.postgres]))

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

  (testing "single quotes"
    (is (= "'you''re':*"
           (search-expr "you're")))))
