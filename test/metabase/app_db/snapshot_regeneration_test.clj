(ns metabase.app-db.snapshot-regeneration-test
  "Checks that each checked-in app DB snapshot is the file regenerating it would write today.

  The check is opt-in, with `MB_APP_DB_SNAPSHOT_REGENERATION_TEST=true`, and needs Docker, since regenerating starts the
  server each file is dumped from.
  CI does not run it: the drift test in [[metabase.app-db.snapshot-test]] is what shows a snapshot is still correct.
  Use it when changing the generator or the dumpers.
  The tests of the text helpers it compares files with run everywhere."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.generate :as generate]
   [metabase.config.core :as config]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- regeneration-test-enabled? []
  (= "true" (config/config-str :mb-app-db-snapshot-regeneration-test)))

;;; ------------------------------------------- comparing snapshot files --------------------------------------------

;; A migration that starts seeding some other random value will fail the regeneration check on that value; add it here.
;;
;; The hash and UUID patterns match the value itself, with no surrounding quotes: the auth identity credentials are a
;; JSON column holding both, so in the dump they arrive quoted as JSON rather than as SQL string literals. Each shape is
;; specific enough to stand on its own. Timestamps and entity ids are not, since plain dates and runs of hex digits both
;; turn up in seeded text, so those two are masked only as SQL literals. The backfill in
;; `064/20260723_backfill_entity_ids.yaml` gives the internal user an entity id of 21 random hex characters taken from a
;; UUID.
(def ^:private unstable-literals
  "Values two dumps of the very same migrations disagree on, as `[pattern replacement]` pairs.
  They are the wall-clock times, and the generated hashes, tokens and entity ids the drift test drops when it compares
  rows, masked in the SQL text here since that is what the regeneration check compares."
  [[#"'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}(?::?\d{2})?)?'" "'<timestamp>'"]
   [#"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}"                                           "<password-hash>"]
   [#"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"                 "<uuid>"]
   [#"'[0-9a-f]{21}'"                                                               "'<entity-id>'"]])

(defn- unstable-values-masked
  "The `statement` with every [[unstable-literals]] pattern replaced."
  [statement]
  (reduce (fn [sql [pattern replacement]] (str/replace sql pattern replacement))
          statement
          unstable-literals))

(defn- value-tuples
  "The `(...)` tuples of a `VALUES` list `s`, or nil unless every character of it is accounted for.
  Tuples are split on the paren closing each one rather than on the commas between them, so a value holding a comma,
  a newline or a paren of its own is not read as a boundary.
  With `backslash-escapes?`, as in MySQL dumps, a backslash escapes the character after it inside a string."
  [^String s backslash-escapes?]
  ;; returning nil rather than a guess is what makes it safe for the caller to fall back to leaving a statement alone
  (loop [i 0, depth 0, in-string? false, start nil, acc []]
    (if (<= (.length s) i)
      (when (and (zero? depth) (not in-string?) (nil? start))
        acc)
      (let [c          (.charAt s i)
            separator? (or (= c \,) (= c \;) (Character/isWhitespace c))]
        (cond
          ;; a doubled '' reads as two toggles, which lands back inside the string, the same as escaping it does
          in-string?    (case c
                          \\ (recur (if backslash-escapes? (+ i 2) (inc i)) depth true start acc)
                          \' (recur (inc i) depth false start acc)
                          (recur (inc i) depth true start acc))
          (= c \')      (recur (inc i) depth true start acc)
          (= c \()      (recur (inc i) (inc depth) false (or start i) acc)
          (= c \))      (let [depth (dec depth)]
                          (if (zero? depth)
                            (recur (inc i) depth false nil (conj acc (subs s start (inc i))))
                            (recur (inc i) depth false start acc)))
          ;; outside a tuple only the separators between them and the terminator ending the list may appear;
          ;; anything else means this is not a plain list of tuples and is left alone
          (some? start) (recur (inc i) depth false start acc)
          separator?    (recur (inc i) depth false start acc)
          :else         nil)))))

(defn- single-row-inserts
  "A multi-row `INSERT ... VALUES (...),(...)` split into one statement per row, as a vector.
  Any other statement, or one that cannot be taken apart with certainty, comes back alone and unchanged.
  See [[value-tuples]] for `:backslash-escapes?`."
  [statement & {:keys [backslash-escapes?]}]
  ;; Two dumps of the very same rows can frame them differently: H2's SCRIPT packs rows into multi-row inserts by size,
  ;; so a value one character longer pushes a row into the next statement. That is a difference in batching, not in
  ;; content, and comparing statement by statement would report it as drift.
  (or (when-let [[_ prefix tuples] (re-matches #"(?is)^(.*?\bVALUES\s*)(\(.*)$" statement)]
        (when-let [tuples (value-tuples tuples backslash-escapes?)]
          (when (next tuples)
            (mapv #(str prefix %) tuples))))
      [statement]))

(defn- comparable-statements
  "The statements of a snapshot file for `flavor`, one row per insert and with the [[unstable-literals]] masked."
  [snapshot-text flavor]
  (let [backslash-escapes? (snapshot/backslash-escapes? flavor)]
    (into []
          (comp (mapcat #(single-row-inserts % :backslash-escapes? backslash-escapes?))
                (map unstable-values-masked))
          (snapshot/statements snapshot-text))))

(defn- first-difference
  "The first statement two snapshots of the same dialect disagree on, as `{:index _, :checked-in _, :regenerated _}`.
  When one is a prefix of the other, it is `{:index _, :checked-in-count _, :regenerated-count _}` instead.
  Returns nil when they agree."
  [checked-in regenerated]
  ;; one statement rather than a whole-file diff, because a snapshot runs to thousands of lines and a report of all of
  ;; it says nothing about where to look
  (or (first (keep-indexed (fn [i [in-file fresh]]
                             (when (not= in-file fresh)
                               {:index i, :checked-in in-file, :regenerated fresh}))
                           (map vector checked-in regenerated)))
      (when (not= (count checked-in) (count regenerated))
        {:index             (min (count checked-in) (count regenerated))
         :checked-in-count  (count checked-in)
         :regenerated-count (count regenerated)})))

;;; --------------------------------------------------- the tests ---------------------------------------------------

(deftest snapshot-is-what-generating-it-today-writes-test
  (testing "the checked-in snapshot is the file a regeneration would write"
    ;; Opt-in, and not run in CI. A changeset that lands before the boundary after the snapshot was cut also makes the
    ;; two differ, since regenerating would fold it in, and the drift test already shows that such a snapshot is still
    ;; correct. So a difference here says only that regenerating would change the file. Use it when changing the
    ;; generator or the dumpers.
    ;;
    ;; Every flavor is checked here rather than once per driver in the matrix, because regenerating starts the server
    ;; it dumps -- so which flavors this can speak does not depend on which DB the job it runs in was given. It needs
    ;; a working docker and nothing else.
    (if-not (regeneration-test-enabled?)
      (log/warn "MB_APP_DB_SNAPSHOT_REGENERATION_TEST is not set; skipping app DB snapshot regeneration check")
      (doseq [flavor (sort snapshot/flavors)]
        (testing (name flavor)
          (let [checked-in (io/resource (snapshot/resource-path snapshot/snapshot-version flavor "sql"))]
            (is (some? checked-in)
                (format "a snapshot should be checked in for %s" (name flavor)))
            (when checked-in
              (let [{:keys [content]} (generate/dump-snapshot! flavor)]
                (is (nil? (first-difference (comparable-statements (slurp checked-in) flavor)
                                            (comparable-statements content flavor)))
                    (format (str "regenerating the %s snapshot would change it; if that is intended, run "
                                 "(metabase.app-db.snapshot-test-util.generate/generate! %s)")
                            (name flavor) flavor))))))))))

(deftest single-row-inserts-test
  (are [statement expected] (= expected (single-row-inserts statement))
    ;; one statement per row, each with the full prefix
    "INSERT INTO t VALUES (1, 'a'), (2, 'b')"    ["INSERT INTO t VALUES (1, 'a')" "INSERT INTO t VALUES (2, 'b')"]
    ;; commas, parens and doubled quotes inside a value are not boundaries
    "INSERT INTO t VALUES ('a, (b)'), ('it''s')" ["INSERT INTO t VALUES ('a, (b)')" "INSERT INTO t VALUES ('it''s')"]
    ;; a single row, or anything that is not a plain list of tuples, is left alone
    "INSERT INTO t VALUES (1)"                   ["INSERT INTO t VALUES (1)"]
    "INSERT INTO t VALUES (1), (2) RETURNING *"  ["INSERT INTO t VALUES (1), (2) RETURNING *"]
    "CREATE TABLE t (id INT, name TEXT)"         ["CREATE TABLE t (id INT, name TEXT)"])
  (testing "a value ending in a backslash closes its string, unless the dialect escapes with backslashes"
    (is (= ["INSERT INTO t VALUES ('C:\\')" "INSERT INTO t VALUES ('x')"]
           (single-row-inserts "INSERT INTO t VALUES ('C:\\'), ('x')")))
    (is (= ["INSERT INTO t VALUES ('it\\'s')" "INSERT INTO t VALUES ('x')"]
           (single-row-inserts "INSERT INTO t VALUES ('it\\'s'), ('x')" :backslash-escapes? true)))))

(deftest first-difference-test
  (are [checked-in regenerated expected] (= expected (first-difference checked-in regenerated))
    ["a" "b"] ["a" "b"]     nil
    ["a" "b"] ["a" "c"]     {:index 1, :checked-in "b", :regenerated "c"}
    ["a" "b"] ["a"]         {:index 1, :checked-in-count 2, :regenerated-count 1}
    ["a"]     ["a" "b" "c"] {:index 1, :checked-in-count 1, :regenerated-count 3}))

(deftest unstable-values-masked-test
  (are [statement expected] (= expected (unstable-values-masked statement))
    ;; values two regenerations disagree on
    "VALUES ('2026-11-03 12:00:00.123+00')"             "VALUES ('<timestamp>')"
    "VALUES ('0d305ac41f1d4d0cb247e')"                  "VALUES ('<entity-id>')"
    "{\"id\":\"8f14e45f-ceea-467a-9575-cbd67bb3ef0a\"}" "{\"id\":\"<uuid>\"}"
    ;; shapes that only count as unstable inside a SQL literal, or at full length, are left alone
    "VALUES ('2026-11-03')"                             "VALUES ('2026-11-03')"
    "VALUES ('0d305ac41f1d4d0cb247')"                   "VALUES ('0d305ac41f1d4d0cb247')"
    "{\"key\":\"0d305ac41f1d4d0cb247e\"}"               "{\"key\":\"0d305ac41f1d4d0cb247e\"}")
  (testing "a password hash is masked inside the JSON that holds it"
    (is (= "{\"password_hash\":\"<password-hash>\"}"
           (unstable-values-masked
            "{\"password_hash\":\"$2a$10$fQPgxCCkhVJqnVF57pE.A.YxyghaOC2sqpf3Tdck6GE6Edg6RKS7a\"}")))))
