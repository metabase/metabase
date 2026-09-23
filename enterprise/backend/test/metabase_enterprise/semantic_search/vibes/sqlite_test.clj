(ns metabase-enterprise.semantic-search.vibes.sqlite-test
  "The `vibes` SQLite functions and the RERANK rewrite hook on a plain in-memory SQLite connection (no vec1)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.vibes.jev :as jev]
   [metabase-enterprise.semantic-search.vibes.sqlite :as vibes.sqlite]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.sql Connection DriverManager)))

(set! *warn-on-reflection* true)

(defn- do-with-conn! [f]
  (vibes.sqlite/reset-cache!)
  (with-open [raw (DriverManager/getConnection "jdbc:sqlite::memory:")]
    (let [conn (vibes.sqlite/install! raw)]
      (jdbc/execute! conn ["CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, description TEXT)"])
      (doseq [i (range 1 21)]
        (jdbc/execute! conn ["INSERT INTO t (id, name, description) VALUES (?, ?, ?)" i (str "item " i) (str "about " i)]))
      (f conn))))

(defmacro ^:private with-conn!
  "Run `body` with `conn` bound to a fresh in-memory SQLite connection with the vibes functions installed and a
  20-row table `t(id, name, description)`. The score cache is cleared first."
  [[conn] & body]
  `(do-with-conn! (fn [~(vary-meta conn assoc :tag `Connection)] ~@body)))

(defmacro ^:private with-jdbc-rewrite
  "Run `body` with the RERANK clause rewritten on the connection, as with the stock SQLite library, even when the
  patched engine (see `engine-grammar-test`) is loaded."
  [& body]
  `(mt/with-dynamic-fn-redefs [vibes.sqlite/native-rerank? (constantly false)]
     ~@body))

(defn- q [conn sql & params]
  (jdbc/execute! conn (into [sql] params) {:builder-fn jdbc.rs/as-unqualified-maps}))

(defn- stub-scores
  "A `score-candidates!` stub scoring every candidate by the number in its name (item 20 → 0.20), counting calls in
  `calls`."
  [calls]
  (fn [prompt roster _opts]
    (swap! calls conj [prompt (count roster)])
    (update-vals roster (fn [c] (/ (double (parse-long (re-find #"\d+" (str (get c "name") (get c "text"))))) 100.0)))))

(defmacro ^:private with-vibes
  "Run `body` with vibes enabled and `score-candidates!` replaced by `stub`."
  [stub & body]
  `(mt/with-temporary-setting-values [~'vibes-enabled true ~'vibes-api-key "test-key"]
     (mt/with-dynamic-fn-redefs [jev/score-candidates! ~stub]
       ~@body)))

(def ^:private canonical
  "The batched form: the roster CTE is passed to every row's call byte-identical."
  (str "WITH roster AS MATERIALIZED (SELECT json_group_object(id, json_object('name', name, 'description', description)) AS j FROM t)"
       " SELECT t.name, vibes(?, t.id, roster.j) AS vibe FROM t, roster ORDER BY vibe DESC, t.id ASC LIMIT ?"))

(deftest canonical-query-batches-test
  (let [calls (atom [])]
    (with-conn! [conn]
      (with-vibes (stub-scores calls)
        (is (= ["item 20" "item 19" "item 18"] (map :name (q conn canonical "best" 3))))
        (testing "one Jev call for the statement, whatever the LIMIT"
          (is (= [["best" 20]] @calls)))))))

(deftest identical-statement-is-cached-test
  (let [calls (atom [])]
    (with-conn! [conn]
      (with-vibes (stub-scores calls)
        (q conn canonical "best" 3)
        (q conn canonical "best" 5)
        (is (= 1 (count @calls)))
        (testing "a different prompt is a new call"
          (q conn canonical "worst" 3)
          (is (= 2 (count @calls))))))))

(deftest cache-expiry-test
  (let [calls (atom [])
        now   (atom (System/currentTimeMillis))]
    (with-conn! [conn]
      (mt/with-dynamic-fn-redefs [vibes.sqlite/now-ms (fn [] @now)]
        (with-vibes (stub-scores calls)
          (q conn canonical "best" 3)
          (swap! now + (* 4 60 1000))
          (q conn canonical "best" 3)
          (is (= 1 (count @calls)))
          (swap! now + (* 2 60 1000))
          (q conn canonical "best" 3)
          (testing "after the 5 minute TTL the roster is scored again"
            (is (= 2 (count @calls)))))))))

(deftest reranker-down-is-null-test
  (with-conn! [conn]
    (with-vibes (fn [& _] nil)
      (let [rows (q conn canonical "best" 20)]
        (is (every? nil? (map :vibe rows)))
        (testing "tiebreak order (the original one) survives"
          (is (= (map #(str "item " %) (range 1 21)) (map :name rows))))))))

(deftest reranker-down-is-not-cached-test
  (let [calls (atom 0)]
    (with-conn! [conn]
      (with-vibes (fn [& _] (swap! calls inc) nil)
        (q conn "SELECT name FROM t RERANK BASED ON VIBES('best')")
        (testing "the rows of one RERANK statement share the failed attempt"
          (is (= 1 @calls)))
        (q conn "SELECT name FROM t RERANK BASED ON VIBES('best')")
        (testing "the next statement asks Jev again"
          (is (= 2 @calls)))
        (is (=? {:failures 2 :entries 0} (vibes.sqlite/info)))))))

(deftest reranker-down-without-nonce-test
  (let [calls (atom 0)]
    (with-conn! [conn]
      (with-vibes (fn [& _] (swap! calls inc) nil)
        (testing "a hand-written 3-argument vibes() has no statement to share a failure with: one attempt per row"
          (q conn canonical "best" 20)
          (is (= 20 @calls)))))))

(deftest recovery-after-failure-test
  (let [down? (atom true)]
    (with-conn! [conn]
      (with-vibes (fn [prompt roster opts]
                    (when-not @down? ((stub-scores (atom [])) prompt roster opts)))
        (is (= [{:name "item 1"}] (q conn "SELECT name FROM t RERANK BASED ON VIBES('best') LIMIT 1")))
        (reset! down? false)
        (testing "once Jev is back, the same statement is scored right away"
          (is (= [{:name "item 20"}] (q conn "SELECT name FROM t RERANK BASED ON VIBES('best') LIMIT 1"))))))))

(deftest partial-scoring-is-not-cached-test
  (let [calls (atom 0)]
    (with-conn! [conn]
      (with-vibes (fn [_ roster _]
                    (swap! calls inc)
                    (with-meta (select-keys (update-vals roster (constantly 0.5)) ["1"]) {::jev/incomplete true}))
        (testing "the scores that did come back are used"
          (is (= "item 1" (:name (first (q conn "SELECT name FROM t RERANK BASED ON VIBES('best')")))))
          (is (= 1 @calls)))
        (q conn "SELECT name FROM t RERANK BASED ON VIBES('best')")
        (testing "but not cached"
          (is (= 2 @calls)))))))

(deftest question-kind-per-connection-test
  (let [questions (atom [])
        stub      (fn [_ roster opts] (swap! questions conj (:question opts)) (update-vals roster (constantly 0.5)))]
    (with-conn! [conn]
      (with-vibes stub
        (q conn "SELECT vibes('p', 'x') AS v")
        (testing "installed connections ask the :rows question by default"
          (is (= [:rows] @questions)))
        (with-open [raw (DriverManager/getConnection "jdbc:sqlite::memory:")]
          (let [search-conn (vibes.sqlite/install! raw :question :search)]
            (q search-conn "SELECT vibes('p', 'x') AS v")
            (testing "the search store's connection asks the :search question, cached separately"
              (is (= [:rows :search] @questions)))))))))

(deftest reranker-throws-is-null-test
  (with-conn! [conn]
    (with-vibes (fn [& _] (throw (ex-info "boom" {})))
      (is (every? nil? (map :vibe (q conn canonical "best" 20)))))))

(deftest disabled-is-null-test
  (let [calls (atom 0)]
    (with-conn! [conn]
      (mt/with-temporary-setting-values [vibes-enabled false]
        (mt/with-dynamic-fn-redefs [jev/score-candidates! (fn [& _] (swap! calls inc) {})]
          (is (every? nil? (map :vibe (q conn canonical "best" 20))))
          (is (zero? @calls)))))))

(deftest id-missing-from-answers-test
  (with-conn! [conn]
    (with-vibes (fn [_ roster _] (select-keys (update-vals roster (constantly 0.5)) ["1" "2"]))
      (let [rows (q conn canonical "best" 20)]
        (is (= [0.5 0.5] (map :vibe (take 2 rows))))
        (is (every? nil? (map :vibe (drop 2 rows))))))))

(deftest malformed-roster-test
  (let [calls (atom 0)]
    (with-conn! [conn]
      (with-vibes (fn [& _] (swap! calls inc) {})
        (is (= [{:v nil}] (q conn "SELECT vibes('p', 1, 'not json') AS v")))
        (is (= [{:v nil}] (q conn "SELECT vibes('p', 1, '[1, 2]') AS v")))
        (is (= [{:v nil}] (q conn "SELECT vibes('p', 1, '{\"1\": 3}') AS v")))
        (is (zero? @calls))))))

(deftest empty-roster-test
  (with-conn! [conn]
    (with-vibes (fn [& _] {})
      (is (= [{:v nil}] (q conn "SELECT vibes('p', 1, '{}') AS v"))))))

(deftest null-arguments-test
  (let [calls (atom 0)]
    (with-conn! [conn]
      (with-vibes (fn [& _] (swap! calls inc) {"1" 0.5})
        (is (= [{:v nil}] (q conn "SELECT vibes(NULL, 1, '{\"1\": {\"name\": \"x\"}}') AS v")))
        (is (= [{:v nil}] (q conn "SELECT vibes('p', 1, NULL) AS v")))
        (is (= [{:v nil}] (q conn "SELECT vibes('p', NULL, '{\"1\": {\"name\": \"x\"}}') AS v")))
        (is (zero? @calls))))))

(deftest integer-and-text-ids-match-roster-keys-test
  (with-conn! [conn]
    (with-vibes (fn [_ roster _] (update-vals roster (constantly 0.75)))
      (is (= [{:a 0.75 :b 0.75}]
             (q conn "SELECT vibes('p', 7, '{\"7\": {\"name\": \"x\"}}') AS a, vibes('p', '7', '{\"7\": {\"name\": \"x\"}}') AS b"))))))

(deftest pointwise-arity-test
  (let [calls (atom [])]
    (with-conn! [conn]
      (with-vibes (stub-scores calls)
        (is (= [["item 20" 0.2] ["item 19" 0.19]]
               (map (juxt :name :v) (q conn "SELECT name, vibes('p', name) AS v FROM t ORDER BY v DESC LIMIT 2"))))
        (testing "one call per distinct text"
          (is (= 20 (count @calls))))
        (testing "memoised"
          (q conn "SELECT vibes('p', name) AS v FROM t")
          (is (= 20 (count @calls))))
        (is (= [{:v nil}] (q conn "SELECT vibes('p', NULL) AS v")))))))

(deftest vibes-info-test
  (with-conn! [conn]
    (with-vibes (fn [_ roster _] (update-vals roster (constantly 0.5)))
      (q conn canonical "best" 3)
      (is (=? {:enabled true :model "jev-latest" :version "v2" :entries 1 :calls 1 :misses 1 :hits 19 :failures 0}
              (json/decode+kw (:i (first (q conn "SELECT vibes_info() AS i")))))))))

(deftest rerank-clause-through-the-connection-test
  (let [calls (atom [])]
    (with-jdbc-rewrite
      (with-conn! [conn]
        (with-vibes (stub-scores calls)
          (testing "prepared statement"
            (is (= ["item 20" "item 19" "item 18"]
                   (map :name (q conn "SELECT * FROM t RERANK BASED ON VIBES(?) DESC LIMIT 3" "best"))))
            (is (= [["best" 20]] @calls)))
          (testing "ASC, bare VIBES with the user_prompt CTE, and the select's own params first"
            (is (= ["item 2" "item 3"]
                   (map :name (q conn (str "WITH user_prompt AS (SELECT 'q' AS prompt)"
                                           " SELECT name FROM t WHERE id > ? RERANK BASED ON VIBES ASC LIMIT 2") 1))))
            (is (= [["best" 20] ["q" 19]] @calls)))
          (testing "plain Statement"
            (with-open [stmt (.createStatement conn)]
              (let [rs (.executeQuery stmt "SELECT name FROM t RERANK BASED ON VIBES('best') LIMIT 1")]
                (is (true? (.next rs)))
                (is (= "item 20" (.getString rs 1))))))
          (testing "column labels of a join with * are resolved"
            (is (= [{:name "item 20" :description "about 20"}]
                   (q conn "SELECT a.name, b.description FROM t a JOIN t b ON a.id = b.id RERANK BASED ON VIBES('best') LIMIT 1"))))
          (testing "no clause: passes through untouched"
            (is (= ["item 1"] (map :name (q conn "SELECT name FROM t WHERE name = 'RERANK BASED ON VIBES' OR id = 1")))))
          (testing "a bad clause is a clear error"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid RERANK clause"
                                  (q conn "SELECT * FROM t RERANK BASED ON VIBES(?) SIDEWAYS" "x")))))))))

(deftest vibes-rewrite-function-test
  (with-jdbc-rewrite
    (with-conn! [conn]
      (let [r (:r (first (q conn "SELECT vibes_rewrite('SELECT id, name FROM t RERANK BASED ON VIBES(''q'') LIMIT 2') AS r")))]
        (is (str/starts-with? r "WITH __vibes_cand AS MATERIALIZED"))
        (is (str/includes? r "json_object('id', \"id\", 'name', \"name\")"))
        (is (str/ends-with? r "LIMIT 2")))
      (is (= "SELECT 1" (:r (first (q conn "SELECT vibes_rewrite('SELECT 1') AS r")))))
      (is (str/starts-with? (:r (first (q conn "SELECT vibes_rewrite('SELECT 1 RERANK BY VIBES') AS r"))) "ERROR: ")))))

(deftest install-wraps-only-without-engine-grammar-test
  (with-open [raw (DriverManager/getConnection "jdbc:sqlite::memory:")]
    (testing "stock engine: the connection is wrapped for the RERANK rewrite"
      (with-jdbc-rewrite
        (is (not (identical? raw (vibes.sqlite/install! raw))))))
    (testing "patched engine: the statement goes to SQLite untouched"
      (mt/with-dynamic-fn-redefs [vibes.sqlite/native-rerank? (constantly true)]
        (is (identical? raw (vibes.sqlite/install! raw)))
        (is (= "SELECT 1 RERANK BASED ON VIBES" (vibes.sqlite/rewrite raw "SELECT 1 RERANK BASED ON VIBES")))))))

(deftest native-rerank-matches-engine-test
  (with-open [raw (DriverManager/getConnection "jdbc:sqlite::memory:")]
    (is (= (= [{:v 1}] (q raw "SELECT sqlite_compileoption_used('VIBES_RERANK') AS v"))
           (vibes.sqlite/native-rerank? raw)))))

(deftest per-connection-registration-test
  (with-open [other (DriverManager/getConnection "jdbc:sqlite::memory:")]
    (is (thrown-with-msg? Exception #"no such function: vibes"
                          (q other "SELECT vibes('p', 'x') AS v")))))
