(ns metabase-enterprise.semantic-search.vibes.engine-grammar-test
  "`RERANK BASED ON VIBES` parsed by the SQLite engine itself: the patched sqlite-jdbc library built by
  `native/sqlite-vibes/build.sh`. The functions are registered on a raw connection, so nothing is rewritten on the
  JDBC side. Every test here is a no-op on the stock library; to run them, start the JVM with

      JDK_JAVA_OPTIONS='-Dorg.sqlite.lib.path=native/sqlite-vibes/out/darwin-aarch64 -Dorg.sqlite.lib.name=libsqlitejdbc.dylib'"
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.vibes.jev :as jev]
   [metabase-enterprise.semantic-search.vibes.sqlite :as vibes.sqlite]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.sql Connection DriverManager SQLException)))

(set! *warn-on-reflection* true)

(defn- engine-parses-rerank?
  "Asked of a fresh connection, not through [[vibes.sqlite/native-rerank?]], which tests may redefine."
  []
  (with-open [conn (DriverManager/getConnection "jdbc:sqlite::memory:")]
    (= [{:v 1}] (jdbc/execute! conn ["SELECT sqlite_compileoption_used('VIBES_RERANK') AS v"]
                               {:builder-fn jdbc.rs/as-unqualified-maps}))))

(defn- do-with-raw-conn! [f]
  (vibes.sqlite/reset-cache!)
  (with-open [conn (DriverManager/getConnection "jdbc:sqlite::memory:")]
    (vibes.sqlite/register-vibes! conn :rows)
    (jdbc/execute! conn ["CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)"])
    (doseq [i (range 1 11)]
      (jdbc/execute! conn ["INSERT INTO t (id, name) VALUES (?, ?)" i (str "item " i)]))
    (jdbc/execute! conn ["CREATE TABLE prompts (p TEXT)"])
    (jdbc/execute! conn ["INSERT INTO prompts VALUES ('p1'), ('p2'), ('p3')"])
    (f conn)))

(defmacro ^:private with-raw-conn!
  "Run `body` with `conn` bound to an in-memory SQLite connection with only the vibes functions registered (no
  rewriting proxy), a 10-row table `t(id, name)` and a 3-row table `prompts(p)`. No-op on the stock engine."
  [[conn] & body]
  `(when (engine-parses-rerank?)
     (do-with-raw-conn! (fn [~(vary-meta conn assoc :tag `Connection)] ~@body))))

(defn- q [conn sql & params]
  (jdbc/execute! conn (into [sql] params) {:builder-fn jdbc.rs/as-unqualified-maps}))

(defn- names [rows]
  (map :name rows))

(defn- stub-scores
  "A `score-candidates!` stub scoring every candidate by the number in its name (item 10 → 0.10), recording
  `[prompt roster]` in `calls`."
  [calls]
  (fn [prompt roster _opts]
    (swap! calls conj [prompt roster])
    (update-vals roster #(/ (double (parse-long (re-find #"\d+" (str (get % "name"))))) 100.0))))

(defmacro ^:private with-vibes
  "Run `body` with vibes enabled and `score-candidates!` replaced by `stub`."
  [stub & body]
  `(mt/with-temporary-setting-values [~'vibes-enabled true ~'vibes-api-key "test-key"]
     (mt/with-dynamic-fn-redefs [jev/score-candidates! ~stub]
       ~@body)))

(deftest engine-grammar-detected-test
  (with-raw-conn! [conn]
    (testing "the connection hook sees the grammar and leaves the connection unwrapped"
      (is (true? (vibes.sqlite/native-rerank? conn)))
      (is (identical? conn (vibes.sqlite/install! conn))))
    (testing "vibes_rewrite has nothing to rewrite"
      (let [sql "SELECT name FROM t RERANK BASED ON VIBES('q') LIMIT 2"]
        (is (= [{:r sql}] (q conn "SELECT vibes_rewrite(?) AS r" sql)))))))

(deftest top-level-rerank-test
  (let [calls (atom [])]
    (with-raw-conn! [conn]
      (with-vibes (stub-scores calls)
        (testing "default DESC, one Jev call for the statement"
          (is (= ["item 10" "item 9" "item 8"] (names (q conn "SELECT name FROM t RERANK BASED ON VIBES('best') LIMIT 3"))))
          (is (= ["best"] (map first @calls))))
        (testing "the roster is keyed by candidate number and holds the selected columns"
          (is (= {"1" {"name" "item 1"}} (select-keys (second (first @calls)) ["1"])))
          (is (= 10 (count (second (first @calls))))))
        (testing "ASC with OFFSET"
          (is (= ["item 2" "item 3"] (names (q conn "SELECT name FROM t RERANK BASED ON VIBES('best') ASC LIMIT 2 OFFSET 1")))))
        (testing "the select's parameters come first, then the prompt's, then LIMIT's"
          (is (= ["item 4"] (names (q conn "SELECT name FROM t WHERE id < ? RERANK BASED ON VIBES(?) LIMIT ?" 5 "best" 1)))))
        (testing "bare VIBES reads the user_prompt CTE, after the SQL editor's comment"
          (is (= ["item 10"] (names (q conn (str "-- Metabase:: userID: 1\n"
                                                 "WITH user_prompt AS (SELECT 'from cte' AS prompt) "
                                                 "SELECT name FROM t RERANK BASED ON VIBES LIMIT 1")))))
          (is (= "from cte" (first (last @calls)))))
        (testing "result columns keep their labels"
          (is (= [{:name "item 10" :twice 20}] (q conn "SELECT name, id * 2 AS twice FROM t RERANK BASED ON VIBES('best') LIMIT 1"))))))))

(deftest rerank-in-subqueries-test
  (let [calls (atom [])]
    (with-raw-conn! [conn]
      (with-vibes (stub-scores calls)
        (testing "subquery in FROM"
          (is (= [{:n 2}] (q conn "SELECT count(*) AS n FROM (SELECT name FROM t RERANK BASED ON VIBES('best') LIMIT 2)"))))
        (testing "IN (subquery)"
          (is (= ["item 10" "item 9"]
                 (names (q conn (str "SELECT name FROM t WHERE name IN "
                                     "(SELECT name FROM t RERANK BASED ON VIBES('best') LIMIT 2) "
                                     "ORDER BY id DESC"))))))
        (testing "CTE body"
          (is (= ["item 10" "item 9"]
                 (names (q conn "WITH top AS (SELECT name FROM t RERANK BASED ON VIBES('best') LIMIT 2) SELECT name FROM top")))))
        (testing "compound select"
          (is (= ["item 99" "item 10"]
                 (names (q conn "SELECT name FROM t UNION ALL SELECT 'item 99' RERANK BASED ON VIBES('best') LIMIT 2")))))
        (testing "INSERT ... SELECT and CREATE TABLE ... AS SELECT"
          (q conn "CREATE TABLE best (name TEXT)")
          (q conn "INSERT INTO best SELECT name FROM t RERANK BASED ON VIBES('best') LIMIT 2")
          (q conn "CREATE TABLE best2 AS SELECT name FROM t RERANK BASED ON VIBES('best') ASC LIMIT 1")
          (is (= ["item 10" "item 9" "item 1"] (names (q conn "SELECT name FROM best UNION ALL SELECT name FROM best2")))))))))

(deftest correlated-prompt-test
  (let [calls (atom [])]
    (with-raw-conn! [conn]
      (with-vibes (stub-scores calls)
        (is (= [{:p "p1" :best "item 10"} {:p "p2" :best "item 10"} {:p "p3" :best "item 10"}]
               (q conn (str "SELECT p, (SELECT name FROM t RERANK BASED ON VIBES(prompts.p) LIMIT 1) AS best "
                            "FROM prompts ORDER BY p"))))
        (testing "one Jev call per outer row's prompt"
          (is (= ["p1" "p2" "p3"] (sort (map first @calls)))))))))

(deftest rerank-errors-test
  (with-raw-conn! [conn]
    (testing "a malformed clause is SQLite's syntax error"
      (is (thrown-with-msg? SQLException #"near \"SIDEWAYS\": syntax error"
                            (q conn "SELECT * FROM t RERANK BASED ON VIBES('x') SIDEWAYS"))))
    (testing "views can't rerank"
      (is (thrown-with-msg? SQLException #"RERANK BASED ON VIBES is not allowed in a view"
                            (q conn "CREATE VIEW v AS SELECT * FROM t RERANK BASED ON VIBES('x')"))))
    (testing "bare VIBES without a user_prompt CTE"
      (is (thrown-with-msg? SQLException #"no such table: user_prompt"
                            (q conn "SELECT * FROM t RERANK BASED ON VIBES"))))))

(deftest keywords-remain-identifiers-test
  (with-raw-conn! [conn]
    (q conn "CREATE TABLE rerank (based TEXT, vibes TEXT)")
    (q conn "INSERT INTO rerank VALUES ('b', 'v')")
    (is (= [{:based "b" :vibes "v"}] (q conn "SELECT based, vibes FROM rerank")))
    (is (= [{:based "b"}] (q conn "SELECT rerank.based FROM rerank rerank")))
    (testing "decoys in strings and comments"
      (is (= [{:n 0}] (q conn "SELECT count(*) AS n FROM t WHERE name = 'RERANK BASED ON VIBES' -- RERANK BASED ON VIBES"))))))
