(ns metabase.search.query-expr-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.error :as me]
   [malli.json-schema :as mjs]
   [metabase.app-db.core :as mdb]
   [metabase.search.impl :as search.impl]
   [metabase.search.query-expr :as query-expr]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn- valid? [ops expr] (mr/validate (query-expr/schema ops) expr))

(def ^:private revenue-query
  {:op   "and"
   :args ["revenue"
          {:op "or" :args ["forecast" "projection"]}
          {:op "not" :args [{:op "phrase" :text "gross margin"}]}]})

(deftest ^:parallel schema-test
  (testing "the full operator set accepts nested and/or/not over terms, phrases and prefixes"
    (is (valid? query-expr/all-ops revenue-query))
    (is (valid? query-expr/all-ops "revenue"))
    (is (valid? query-expr/all-ops {:op "prefix" :text "quart"})))
  (testing "a leaf is one term"
    (is (not (valid? query-expr/all-ops "customer churn")))
    (is (re-find #"single term with no spaces"
                 (str (me/humanize (mr/explain (query-expr/schema query-expr/all-ops) "customer churn"))))))
  (testing "and/or need two args, not exactly one"
    (is (not (valid? query-expr/all-ops {:op "and" :args ["revenue"]})))
    (is (not (valid? query-expr/all-ops {:op "not" :args ["a" "b"]}))))
  (testing "operators nest at most max-depth levels"
    (let [nest (fn [n] (nth (iterate (fn [e] {:op "or" :args [e "x"]}) "y") n))]
      (is (valid? query-expr/all-ops (nest query-expr/max-depth)))
      (is (not (valid? query-expr/all-ops (nest (inc query-expr/max-depth)))))))
  (testing "a backend's schema only accepts the operators it runs"
    (is (valid? #{"or"} {:op "or" :args ["revenue" "income"]}))
    (is (not (valid? #{"or"} {:op "and" :args ["revenue" "income"]})))
    (is (not (valid? #{"and"} {:op "phrase" :text "gross margin"})))))

(deftest ^:parallel json-schema-test
  (testing "the schema renders without $ref, with a const per operator the model can pick"
    (let [js (mjs/transform (query-expr/schema query-expr/all-ops))
          s  (pr-str js)]
      (is (not (str/includes? s "$ref")))
      (doseq [op query-expr/all-ops]
        (is (str/includes? s (pr-str {:const op})) op)))))

(deftest ^:parallel leaves-and-strings-test
  (is (= ["revenue" "forecast" "projection" {:op "phrase" :text "gross margin"}]
         (query-expr/leaves revenue-query)))
  (testing "the search string skips negated leaves"
    (is (= "revenue forecast projection" (query-expr/search-string revenue-query))))
  (testing "leaf limit"
    (is (nil? (query-expr/limit-error revenue-query)))
    (is (re-find #"17 leaves; the most is 16"
                 (query-expr/limit-error {:op "or" :args (mapv #(str "t" %) (range 17))})))))

(deftest ^:parallel name-scoring-texts-test
  (is (= ["revenue"] (query-expr/name-scoring-texts "revenue")))
  (is (= ["gross margin"] (query-expr/name-scoring-texts {:op "phrase" :text "gross margin"})))
  (is (= ["monthly revenue"] (query-expr/name-scoring-texts {:op "and" :args ["monthly" "revenue"]})))
  (testing "a flat or scores each alternative"
    (is (= ["revenue" "income"] (query-expr/name-scoring-texts {:op "or" :args ["revenue" "income"]}))))
  (testing "anything deeper gets no name boost"
    (is (= [] (query-expr/name-scoring-texts revenue-query)))
    (is (= [] (query-expr/name-scoring-texts {:op "not" :args ["revenue"]})))))

(defn- matches? [text expr]
  (:m (t2/query-one {:select [[[:ts_match_vq
                                [:to_tsvector ^:allow-raw-sql [:inline "simple"] text]
                                (query-expr/->tsquery expr "simple")]
                               :m]]})))

(deftest tsquery-matching-test
  (when (= :postgres (mdb/db-type))
    (testing "compiled queries match the way their tree says"
      (is (matches? "monthly revenue report" {:op "and" :args ["monthly" "revenue"]}))
      (is (not (matches? "monthly report" {:op "and" :args ["monthly" "revenue"]})))
      (is (matches? "income statement" {:op "or" :args ["revenue" "income"]}))
      (is (not (matches? "gross margin by region" {:op "and" :args ["region" {:op "not" :args [{:op "phrase" :text "gross margin"}]}]})))
      (is (matches? "margin gross by region" {:op "and" :args ["region" {:op "not" :args [{:op "phrase" :text "gross margin"}]}]}))
      (is (matches? "quarterly totals" {:op "prefix" :text "quart"}))
      (is (not (matches? "quarterly totals" "quart"))))
    (testing "a leaf is literal: operator syntax inside it is just text"
      (is (not (matches? "revenue" "revenue|income")))
      (is (not (matches? "revenue" "!income"))))))

(deftest problems-test
  (when (= :postgres (mdb/db-type))
    (testing "a clean query has no problems"
      (is (= {:empty-leaves [] :unrestricted? false}
             (search.impl/query-expr-problems revenue-query "english"))))
    (testing "a leaf that is only stopwords normalizes to nothing"
      (is (= ["the and"]
             (:empty-leaves (search.impl/query-expr-problems {:op "and" :args ["revenue" {:op "not" :args [{:op "phrase" :text "the and"}]}]}
                                                             "english")))))
    (testing "a query that can't restrict the index"
      (is (:unrestricted? (search.impl/query-expr-problems {:op "or" :args ["revenue" {:op "not" :args ["archive"]}]} "english"))))))
