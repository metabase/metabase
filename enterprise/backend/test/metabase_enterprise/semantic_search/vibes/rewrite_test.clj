(ns metabase-enterprise.semantic-search.vibes.rewrite-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.vibes.rewrite :as rewrite]))

(set! *warn-on-reflection* true)

(def ^:private labels ["id" "name" "description"])

(defn- rewrite [sql]
  (rewrite/rewrite-rerank sql (constantly labels)))

(defn- squash [s]
  (str/replace s #"\s+" " "))

(deftest ^:parallel no-clause-test
  (is (nil? (rewrite "SELECT * FROM t ORDER BY id LIMIT 3"))))

(deftest ^:parallel candidate-prefilter-test
  (is (false? (rewrite/candidate? "SELECT * FROM t")))
  (is (true? (rewrite/candidate? "select * from t rerank based on vibes")))
  (is (false? (rewrite/candidate? nil))))

(deftest ^:parallel plain-select-test
  (is (= (squash (str "WITH __vibes_cand AS MATERIALIZED (SELECT row_number() OVER () AS __vibes_id, * FROM (SELECT * FROM t)), "
                      "__vibes_roster AS MATERIALIZED (SELECT json_group_object(__vibes_id, json_object('id', \"id\", 'name', \"name\", "
                      "'description', \"description\")) AS j FROM __vibes_cand) "
                      "SELECT \"id\", \"name\", \"description\" FROM __vibes_cand, __vibes_roster "
                      "ORDER BY vibes(?, __vibes_id, __vibes_roster.j) DESC, __vibes_id ASC"))
         (squash (rewrite "SELECT * FROM t RERANK BASED ON VIBES(?)")))))

(deftest ^:parallel with-clause-splice-test
  (let [out (rewrite "WITH a AS (SELECT 1 AS x), b AS (SELECT 2 AS y) SELECT * FROM a, b RERANK BASED ON VIBES('q')")]
    (is (str/starts-with? out "WITH a AS (SELECT 1 AS x), b AS (SELECT 2 AS y),"))
    (is (str/includes? out "FROM (SELECT * FROM a, b)"))
    (is (str/includes? out "ORDER BY vibes('q', __vibes_id, __vibes_roster.j) DESC"))))

(deftest ^:parallel with-recursive-test
  (let [out (rewrite "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 5) SELECT x FROM n RERANK BASED ON VIBES(?)")]
    (is (str/starts-with? out "WITH n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 5),"))))

(deftest ^:parallel bare-vibes-uses-user-prompt-test
  (let [out (rewrite "WITH user_prompt AS (SELECT 'monthly revenue' AS prompt) SELECT * FROM t RERANK BASED ON VIBES")]
    (is (str/includes? out "ORDER BY vibes((SELECT prompt FROM user_prompt), __vibes_id, __vibes_roster.j) DESC"))))

(deftest ^:parallel direction-test
  (testing "default DESC"
    (is (str/includes? (rewrite "SELECT * FROM t RERANK BASED ON VIBES(?)") "__vibes_roster.j) DESC, __vibes_id ASC")))
  (testing "ASC"
    (is (str/includes? (rewrite "SELECT * FROM t RERANK BASED ON VIBES(?) asc") "__vibes_roster.j) ASC, __vibes_id ASC")))
  (testing "DESC"
    (is (str/includes? (rewrite "SELECT * FROM t RERANK BASED ON VIBES(?) DESC") "__vibes_roster.j) DESC, __vibes_id ASC"))))

(deftest ^:parallel limit-offset-passthrough-test
  (is (str/ends-with? (rewrite "SELECT * FROM t RERANK BASED ON VIBES(?) DESC LIMIT 5 OFFSET 10") "\nLIMIT 5 OFFSET 10"))
  (is (str/ends-with? (rewrite "SELECT * FROM t RERANK BASED ON VIBES(?) LIMIT ?") "\nLIMIT ?")))

(deftest ^:parallel param-order-test
  (let [out (rewrite "SELECT * FROM t WHERE a = ? AND b = ? RERANK BASED ON VIBES(?) LIMIT ?")]
    (is (< (str/index-of out "a = ?") (str/index-of out "b = ?") (str/index-of out "vibes(?") (str/index-of out "LIMIT ?")))))

(deftest ^:parallel string-literal-decoy-test
  (is (nil? (rewrite "SELECT * FROM t WHERE name = 'RERANK BASED ON VIBES'")))
  (is (nil? (rewrite "SELECT * FROM t WHERE name = \"rerank\"")))
  (is (nil? (rewrite "SELECT * FROM t WHERE name = [rerank]"))))

(deftest ^:parallel comment-decoy-test
  (is (nil? (rewrite "SELECT * FROM t -- RERANK BASED ON VIBES\nORDER BY id")))
  (is (nil? (rewrite "SELECT * FROM t /* RERANK BASED ON VIBES */ ORDER BY id"))))

(deftest ^:parallel nested-rerank-is-not-top-level-test
  (is (nil? (rewrite "SELECT * FROM (SELECT * FROM t RERANK BASED ON VIBES(?)) sub"))))

(deftest ^:parallel trailing-semicolon-test
  (let [out (rewrite "SELECT * FROM t RERANK BASED ON VIBES(?) ;")]
    (is (not (str/includes? out ";")))))

(deftest ^:parallel quoted-labels-test
  (let [out (rewrite/rewrite-rerank "SELECT * FROM t RERANK BASED ON VIBES(?)" (constantly ["a \"b\"" "name:1"]))]
    (is (str/includes? out "json_object('a \"b\"', \"a \"\"b\"\"\", 'name:1', \"name:1\")"))
    (is (str/includes? out "SELECT \"a \"\"b\"\"\", \"name:1\""))))

(deftest ^:parallel subquery-prompt-test
  (is (str/includes? (rewrite "SELECT * FROM t RERANK BASED ON VIBES((SELECT p FROM q WHERE x = ')'))")
                     "vibes((SELECT p FROM q WHERE x = ')'), __vibes_id")))

(deftest ^:parallel bad-clause-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid RERANK clause: expected RERANK BASED ON VIBES"
                        (rewrite "SELECT * FROM t RERANK BY VIBES")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid RERANK clause: unbalanced parentheses in the prompt expression"
                        (rewrite "SELECT * FROM t RERANK BASED ON VIBES(? DESC")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid RERANK clause: unexpected text after VIBES: SIDEWAYS"
                        (rewrite "SELECT * FROM t RERANK BASED ON VIBES(?) SIDEWAYS")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid RERANK clause: nothing to rerank before RERANK"
                        (rewrite "RERANK BASED ON VIBES(?)")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid RERANK clause: empty prompt expression"
                        (rewrite "SELECT * FROM t RERANK BASED ON VIBES()")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"RERANK: the select has no output columns"
                        (rewrite/rewrite-rerank "SELECT * FROM t RERANK BASED ON VIBES(?)" (constantly [])))))

(deftest ^:parallel parse-rerank-test
  (is (= {:select "SELECT * FROM t" :prompt-expr "?" :direction "DESC" :limit "LIMIT 3"}
         (rewrite/parse-rerank "SELECT * FROM t RERANK BASED ON VIBES(?) DESC LIMIT 3")))
  (is (= {:select "SELECT * FROM t" :prompt-expr "(SELECT prompt FROM user_prompt)" :direction "ASC" :limit nil}
         (rewrite/parse-rerank "SELECT * FROM t rerank based on vibes asc;"))))

(deftest ^:parallel split-with-clause-test
  (is (= [nil "SELECT 1"] (rewrite/split-with-clause "SELECT 1")))
  (is (= ["a AS (SELECT 1)" "SELECT * FROM a"] (rewrite/split-with-clause "WITH a AS (SELECT 1) SELECT * FROM a")))
  (is (= ["a AS (WITH b AS (SELECT 1) SELECT * FROM b)" "SELECT * FROM a"]
         (rewrite/split-with-clause "WITH a AS (WITH b AS (SELECT 1) SELECT * FROM b) SELECT * FROM a"))))
