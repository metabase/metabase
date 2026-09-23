(ns dev.vibes
  "REPL playground for \"order by vibes\": the `vibes()` SQLite functions and the `RERANK BASED ON VIBES` rewrite
  over an in-memory SQLite database, with a stubbed or a real Jev behind them.

  Real Jev needs `MB_VIBES_API_KEY` (see `.env.vibes.local`); [[with-stub]] fakes it for offline use.

      (require 'dev.vibes)
      (dev.vibes/demo)                        ; stubbed Jev: scores by the number in the candidate's name
      (dev.vibes/demo :live true)             ; real Jev, vibes-enabled forced on for the call
      (dev.vibes/canonical-query \"monthly revenue by product category\")
      (dev.vibes/rerank \"WITH user_prompt AS (SELECT 'revenue by product' AS prompt)
                          SELECT id, name, description FROM cards RERANK BASED ON VIBES LIMIT 3\")

  With the store open (`MB_SEMANTIC_SEARCH_SQLITE_PATH` set), [[search]] runs the production vibes query."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.sqlite :as store]
   [metabase-enterprise.semantic-search.vibes.jev :as jev]
   [metabase-enterprise.semantic-search.vibes.settings :as vibes.settings]
   [metabase-enterprise.semantic-search.vibes.sqlite :as vibes.sqlite]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.sql Connection DriverManager)))

(set! *warn-on-reflection* true)

(def cards
  "A toy table of confusable saved questions."
  [[1 "Revenue by Product Category"      "Monthly sum of order totals grouped by product category"]
   [2 "Revenue by State"                 "Yearly order revenue per US state"]
   [3 "Orders per Customer"              "Count of orders by customer, all time"]
   [4 "Average Product Rating"           "Mean review rating per product"]
   [5 "Product Category Inventory"       "Units in stock by product category"]
   [6 "Discounts Given per Quarter"      "Total discount amount by quarter"]
   [7 "Customer Satisfaction per Category" "Average review score by product category"]
   [8 "Monthly Active Users"             "Distinct users with at least one login per month"]])

(defn open-conn
  "An in-memory SQLite connection with the vibes functions installed and [[cards]] loaded."
  ^Connection []
  (let [conn (vibes.sqlite/install! (DriverManager/getConnection "jdbc:sqlite::memory:"))]
    (jdbc/execute! conn ["CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, description TEXT)"])
    (doseq [[id name description] cards]
      (jdbc/execute! conn ["INSERT INTO cards (id, name, description) VALUES (?, ?, ?)" id name description]))
    conn))

(defonce ^{:doc "The playground connection (opened lazily)."} conn
  (delay (open-conn)))

(defn q
  "Run `sql` (with `params`) on the playground connection."
  [sql & params]
  (jdbc/execute! @conn (into [sql] params) {:builder-fn jdbc.rs/as-unqualified-maps}))

(defn stub-scores
  "A `score-candidates!` stand-in: the score is the number in the candidate's name (\"item 20\" → 0.20), else the
  fraction of prompt words the candidate's text contains."
  [prompt roster _opts]
  (let [words (set (re-seq #"\w+" (str/lower-case prompt)))]
    (update-vals roster
                 (fn [c]
                   (let [text (str/lower-case (str (get c "name") " " (get c "description") " " (get c "content") " " (get c "text")))]
                     (if-let [n (some-> (re-find #"\d+" (str (get c "name"))) parse-long)]
                       (/ n 100.0)
                       (/ (double (count (filter #(str/includes? text %) words))) (max 1 (count words)))))))))

(defn do-with-stub
  "Run `f` with vibes enabled and Jev replaced by [[stub-scores]]."
  [f]
  (mt/with-temporary-setting-values [vibes-enabled true vibes-api-key "stub"]
    (mt/with-dynamic-fn-redefs [jev/score-candidates! stub-scores]
      (f))))

(defmacro with-stub
  "Evaluate `body` with vibes enabled and Jev replaced by [[stub-scores]]."
  [& body]
  `(do-with-stub (fn [] ~@body)))

(defmacro with-live
  "Evaluate `body` with vibes enabled against the real Jev (needs `vibes-api-key` / `MB_VIBES_API_KEY`)."
  [& body]
  `(mt/with-temporary-setting-values [~'vibes-enabled true]
     ~@body))

(defn canonical-query
  "The hand-written batched form (plan §1.1): one roster CTE, `vibes(prompt, id, roster)` in the select list."
  [prompt & {:keys [limit] :or {limit 5}}]
  (q (str "WITH roster AS MATERIALIZED ("
          "  SELECT json_group_object(id, json_object('name', name, 'description', description)) AS j FROM cards)"
          " SELECT cards.id, cards.name, vibes(?, cards.id, roster.j) AS vibe"
          " FROM cards, roster ORDER BY vibe DESC, cards.id ASC LIMIT ?")
     prompt limit))

(defn rerank
  "Run a `... RERANK BASED ON VIBES ...` statement through the rewriting connection."
  [sql & params]
  (apply q sql params))

(defn rewrite
  "Show what the rewriter makes of `sql`."
  [sql]
  (:r (first (q "SELECT vibes_rewrite(?) AS r" sql))))

(defn info
  "`vibes_info()` as a map."
  []
  (vibes.sqlite/info))

(defn demo
  "Run the canonical query and a RERANK statement over [[cards]]; `:live true` uses the real Jev."
  [& {:keys [live prompt] :or {prompt "how much money do we make from each kind of product"}}]
  (let [run (fn []
              (vibes.sqlite/reset-cache!)
              {:canonical (canonical-query prompt)
               :rerank    (rerank (str "SELECT id, name, description FROM cards RERANK BASED ON VIBES(?) DESC LIMIT 3") prompt)
               :bare      (rerank (str "WITH user_prompt AS (SELECT ? AS prompt)"
                                       " SELECT id, name FROM cards RERANK BASED ON VIBES LIMIT 3") prompt)
               :info      (info)})]
    (if live
      (with-live (run))
      (with-stub (run)))))

(defn search
  "The production vibes query over the open store (needs `MB_SEMANTIC_SEARCH_SQLITE_PATH`, an indexed store and
  an embedding provider): the `k` nearest documents to `text`, reranked against `prompt` (default `text`)."
  [text & {:keys [k prompt] :or {k 20}}]
  (with-live
    (mapv (juxt :name :vibe :distance)
          (:rows (store/search-text text :k k :vibes-prompt (or prompt text) :record-tokens? false)))))

(comment
  (demo)
  (demo :live true)
  (rewrite "SELECT * FROM cards RERANK BASED ON VIBES(?) LIMIT 2")
  (setting/get :vibes-enabled)
  (vibes.settings/vibes-model)
  (search "income by kind of merchandise"))
