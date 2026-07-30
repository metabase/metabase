(ns metabase-enterprise.transforms-verification.resolve-card-subgraph-test
  "Pure unit tests for [[resolve-card-subgraph]].

  Synthetic transforms and cards are used throughout — no database required, no
  real SQL preprocessing. `transforms-base.i/table-dependencies` is rebound via
  `with-redefs` to return controlled dep sets for each synthetic transform id.

  DAG under test (all scenarios build subsets of this):

      table-50 → S(id=10, produces table-100)
      table-60 → U(id=30, produces table-150)
      table-100 → T(id=20, produces table-200)
      table-150 → T (also depends on table-150)
      table-999 — raw, no producer

  Cards read from various subsets of {table-100, table-150, table-200, table-999}."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transforms-verification.card-refs :as card-refs]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase-enterprise.transforms-verification.subgraph :as subgraph]
   [metabase.transforms-base.interface :as transforms-base.i]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Synthetic scenario construction helpers
;;; ---------------------------------------------------------------------------

(defn- make-transform
  "Minimal synthetic transform for dependency resolution.

  `id`             — integer transform id.
  `target-table-id` — the table id this transform produces (used by
                      `dependency-producer-map` via `output-table-map`).
  `raw-deps`        — the set of raw-dep maps `table-dependencies` will return,
                      e.g. `#{{:table 50}}`."
  [id target-table-id raw-deps]
  {:id              id
   :target_table_id target-table-id
   :target          {:schema "public" :name (str "t" id "_out") :type "table"}
   :source          {:type :stub}
   ::raw-deps       raw-deps})

(defn- stub-deps-lookup
  "Return a `table-dependencies` fn that looks up raw-deps by transform id from
  a seq of transforms built with [[make-transform]]."
  [all-transforms]
  (let [id->raw-deps (into {} (map (juxt :id ::raw-deps)) all-transforms)]
    (fn [transform]
      (get id->raw-deps (:id transform) #{}))))

(defn- make-card
  "Minimal synthetic card. [[run-fixture!]] stubs `card->tables` to read `::tables`,
  so `:dataset_query` is never parsed — it is inert filler (a real query would drag
  a database into what is a pure, DB-free test)."
  [table-ids]
  {:id            9999
   :dataset_query {}
   ::tables       table-ids})

(defn- run-fixture!
  "Exercise `resolve-card-subgraph` for `card` + `source-ids` over
  `all-transforms`, with `table-dependencies` and `card->tables` both rebound."
  [card source-ids all-transforms]
  (let [deps-fn (stub-deps-lookup all-transforms)]
    (with-redefs [transforms-base.i/table-dependencies deps-fn
                  card-refs/card->tables               ::tables]
      (subgraph/resolve-card-subgraph card source-ids all-transforms))))

;;; ---------------------------------------------------------------------------
;;; S and T transforms used by most tests
;;; ---------------------------------------------------------------------------

;;   S (id=10): {:table 50} → target_table_id=100
;;   T (id=20): {:table 100} {:table 150} → target_table_id=200
;;   U (id=30): {:table 60} → target_table_id=150

(def ^:private s (make-transform 10 100 #{{:table 50}}))
(def ^:private t (make-transform 20 200 #{{:table 100} {:table 150}}))
(def ^:private u (make-transform 30 150 #{{:table 60}}))

;;; ---------------------------------------------------------------------------
;;; Core classification tests
;;; ---------------------------------------------------------------------------

(deftest card-reads-only-raw-table-test
  (testing "card whose tables have no producer → :slice empty, :leaf-deps = #{{:table 999}}"
    (let [card   (make-card #{999})
          result (run-fixture! card #{} [])]
      (is (= #{} (:slice result))
          "no transforms in scope → empty slice")
      (is (= [] (:order result)))
      (is (= #{{:table 999}} (:leaf-deps result))
          "the raw table becomes a leaf-dep fixture"))))

(deftest card-reads-one-transform-produced-table-full-closure-test
  (testing "card reads T's output; sources = S (leaf) → slice = #{S T}, order [S T], fixtures = S's raw input"
    ;; T depends on S (via table 100) and U (via table 150).
    ;; By selecting S as source, we cut at S: S's inputs (table 50) become fixtures,
    ;; and T's other input table-150 (from U, which is NOT selected) becomes a fixture too.
    (let [card   (make-card #{200})
          result (run-fixture! card #{10} [s t u])]
      (is (= #{10 20} (:slice result))
          "S and T are in the slice; U is excluded (not selected)")
      (is (= [10 20] (:order result))
          "S before T")
      ;; T reads {:table 100} (in-slice, satisfied by S) and {:table 150} (U not in slice → leaf).
      ;; S reads {:table 50} (boundary, selected source's input → leaf).
      (is (= #{{:table 50} {:table 150}} (:leaf-deps result))
          "S's raw input + T's dep on U's output (U not in slice)"))))

(deftest card-reads-one-transform-select-target-as-source-test
  (testing "select T itself as source → minimal slice #{T}, T's inputs are all fixtures"
    (let [card   (make-card #{200})
          result (run-fixture! card #{20} [s t u])]
      (is (= #{20} (:slice result))
          "only T is in the slice")
      (is (= [20] (:order result)))
      ;; T reads {:table 100} (producer S not in slice → leaf) and {:table 150} (U not in slice → leaf).
      (is (= #{{:table 100} {:table 150}} (:leaf-deps result))
          "both T inputs are fixtures when T is its own source"))))

(deftest card-reads-mix-of-produced-and-raw-table-test
  (testing "card reads T's output + raw table 999; sources = T → fixtures include both T's inputs and table 999"
    (let [card   (make-card #{200 999})
          result (run-fixture! card #{20} [s t u])]
      (is (= #{20} (:slice result)))
      (is (= [20] (:order result)))
      ;; T's inputs {:table 100} and {:table 150} are leaves (producers not in slice).
      ;; Card's direct raw ref {:table 999} is also a leaf.
      (is (= #{{:table 100} {:table 150} {:table 999}} (:leaf-deps result))
          "T's inputs + card's own raw ref"))))

(deftest card-reads-mix-select-deeper-source-test
  (testing "card reads T's output + raw table 999; sources = S → slice = #{S T}, U excluded"
    (let [card   (make-card #{200 999})
          result (run-fixture! card #{10} [s t u])]
      (is (= #{10 20} (:slice result))
          "S and T; U excluded")
      ;; S's input {:table 50}: leaf (S is selected source).
      ;; T's dep on U's output {:table 150}: U not in slice → leaf.
      ;; Card's raw ref {:table 999}: leaf.
      (is (= #{{:table 50} {:table 150} {:table 999}} (:leaf-deps result))
          "S's raw input + T's dep on absent U + card's raw ref"))))

(deftest shared-producer-dedup-test
  (testing "two card tables produced by the same chain; shared raw input appears once in fixtures"
    ;; S1 (id=10) reads {:table 50} → produces table 100
    ;; S2 (id=11) reads {:table 50} → produces table 101
    ;; card reads both 100 and 101; source = S1 and S2 (both leaves)
    (let [s1    (make-transform 10 100 #{{:table 50}})
          s2    (make-transform 11 101 #{{:table 50}})
          card  (make-card #{100 101})
          result (run-fixture! card #{10 11} [s1 s2])]
      (is (= #{10 11} (:slice result)))
      (is (= [10 11] (:order result)))
      (is (= #{{:table 50}} (:leaf-deps result))
          "table 50 deduplicated — both S1 and S2 read it, only one fixture"))))

(deftest card-over-card-transitivity-test
  (testing "card-over-card: outer card's ::tables simulates the transitive walk result"
    ;; Outer card's card->tables returns #{200} (what the transitive BFS would yield
    ;; for a card that sources an inner card which reads T's output table 200).
    (let [card   (make-card #{200})
          result (run-fixture! card #{20} [s t u])]
      ;; T's inputs are fixtures since T is its own source boundary.
      (is (= #{20} (:slice result)))
      (is (= #{{:table 100} {:table 150}} (:leaf-deps result))
          "T's own inputs become fixtures — transitive walk correctly fed to derivation"))))

(deftest bad-source-not-ancestor-test
  (testing "source transform that does not feed any seed → ::sources-not-ancestors error"
    ;; Card reads T's output (table 200); T's seeds = #{20}.
    ;; Source 99 (does not exist in all-transforms) is not an ancestor of T.
    (let [card (make-card #{200})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"do not feed"
           (run-fixture! card #{99} [s t u])))
      (try
        (run-fixture! card #{99} [s t u])
        (catch clojure.lang.ExceptionInfo e
          (is (= ::errors/sources-not-ancestors
                 (:error-type (ex-data e)))
              "error-type is ::errors/sources-not-ancestors"))))))

(deftest select-mid-graph-source-test
  (testing "selecting mid-graph source (T for card reading T's output) cuts at T"
    ;; Three-level chain: A → B → C; card reads C's output (table 300).
    ;; A (id=1): {:table 10} → produces 100
    ;; B (id=2): {:table 100} → produces 200
    ;; C (id=3): {:table 200} → produces 300
    ;; Select B as source → slice = #{B C}, A excluded; {:table 100} is fixture (B's input).
    (let [a     (make-transform 1 100 #{{:table 10}})
          b     (make-transform 2 200 #{{:table 100}})
          c     (make-transform 3 300 #{{:table 200}})
          card  (make-card #{300})
          result (run-fixture! card #{2} [a b c])]
      (is (= #{2 3} (:slice result))
          "B and C in slice; A excluded")
      (is (= [2 3] (:order result))
          "B before C")
      (is (= #{{:table 100}} (:leaf-deps result))
          "B's raw input (100) is the fixture; C's input (200, from B, in-slice) is not"))))

(deftest card-reads-no-tables-test
  (testing "card with empty table set → no slice, no order, no fixtures"
    (let [card   (make-card #{})
          result (run-fixture! card #{} [])]
      (is (= #{} (:slice result)))
      (is (= [] (:order result)))
      (is (= #{} (:leaf-deps result))))))
