(ns metabase.funnysql.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.funnysql.core :as funnysql]
   [metabase.funnysql.util :as funnysql.util]))

(deftest ^:parallel like-pattern-test
  (are [s expected] (= expected (second (funnysql.util/like-pattern s)))
    "plain"   "plain"
    "a%b_c"   "a!%b!_c"
    "a!b"     "a!!b"
    "%%%%"    "!%!%!%!%")
  (testing "no unescaped LIKE metacharacter survives from the input"
    (doseq [input ["a%b%c%d" "a_b_c_d" "%%%%%%%%" "!%!_" "plain"]]
      (is (empty? (re-seq #"(?<!!)[%_]" (second (funnysql.util/like-pattern input)))) (pr-str input))))
  (testing "wrap is applied to the escaped string and the ESCAPE character is named explicitly"
    (is (= ["SELECT * FROM \"t\" WHERE \"name\" LIKE ? ESCAPE '!'" "a!%b%"]
           (funnysql/format {:select [:*] :from [:t]
                             :where  [:like :name (funnysql.util/like-pattern "a%b" #(str % "%"))]}
                            :postgres))))
  (testing "like-substring lowercases, escapes and wraps in %"
    (is (= ["SELECT * FROM \"t\" WHERE lower(\"name\") LIKE ? ESCAPE '!'" "%a!%b!_c%"]
           (funnysql/format {:select [:*] :from [:t]
                             :where  [:like [:lower :name] (funnysql.util/like-substring "A%b_C")]}
                            :postgres))))
  (testing "like-prefix"
    (is (= ["SELECT * FROM \"t\" WHERE lower(\"name\") LIKE ? ESCAPE '!'" "a!%b%"]
           (funnysql/format {:select [:*] :from [:t]
                             :where  [:like [:lower :name] (funnysql.util/like-prefix "A%b")]}
                            :postgres)))))
