(ns metabase-enterprise.transforms-verification.card-refs
  "Extract a Card's table references for sub-graph derivation in a card-target test
  run. A Card here is any saved query — question, model, or metric.

  Two entry points, immediate and transitive:

  - [[card->immediate-refs]] resolves one card, one layer: the physical tables it
    reads directly, and the source-card ids it defers to the caller.
  - [[card->tables]] walks the source-card graph to its physical leaves — every
    table reachable, with the intervening cards unwound."
  (:require
   [clojure.set :as set]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Internal helpers
;;; ---------------------------------------------------------------------------

(defn- mbql-refs
  "Extract immediate table ids and card ids from an MBQL (non-native) query."
  [query]
  {:tables (into #{}
                 cat
                 [(lib/all-source-table-ids query)
                  (lib/all-implicitly-joined-table-ids query)])
   :cards  (into #{} (lib/all-source-card-ids query))})

(defn- resolve-table-id
  "Resolve a raw `{:schema :table}` name-spec to a table id, or nil when it names
  no table — a CTE, a temp table, an unknown schema."
  [driver tables spec]
  (:table (sql-tools/find-table-or-transform driver tables [] spec)))

(defn- native-refs
  "Immediate table ids of a native (SQL) `query`. A name that resolves to no
  table — a CTE, a temp table, a table-qualified column reference — is logged and
  dropped rather than raising; the SQL parser cannot see past it."
  [query]
  (let [db      (lib.metadata/database query)
        driver  (keyword (:engine db))
        tables  (lib.metadata/tables query)
        raw-sql (lib/raw-native-query query)
        specs   (sql-tools/referenced-tables-raw driver raw-sql)]
    {:tables
     (into #{}
           (keep (fn [spec]
                   (or (resolve-table-id driver tables spec)
                       (do
                         (log/warnf
                          "card->immediate-refs: could not resolve native table ref %s to a Table id (CTE, temp table, or unknown schema). This reference will be ignored for sub-graph derivation."
                          (pr-str spec))
                         nil))))
           specs)
     :cards #{}}))

;;; ---------------------------------------------------------------------------
;;; Public entry point
;;; ---------------------------------------------------------------------------

(defn card->immediate-refs
  "Return the immediate references of `card`'s query as
  `{:tables #{table-id ...} :cards #{card-id ...}}`.

  - `:tables` — physical table ids referenced directly in this card's query
    (MBQL `:source-table`, implicit-join targets, native FROM-clause tables).
  - `:cards`  — source-card ids referenced directly (MBQL `:source-card`,
    template-tag `#N` refs). The *caller* is responsible for recursing into
    these to find their table ids.

  Accepts MBQL and native queries alike.

  `card` must be a `:model/Card` row with a `:dataset_query` key."
  [{:keys [dataset_query] :as _card}]
  {:pre [(some? dataset_query)]}
  (let [db-id (lib/database-id dataset_query)
        mp    (lib-be/application-database-metadata-provider db-id)
        query (lib/query mp dataset_query)]
    (if (lib/native-only-query? query)
      (native-refs query)
      (mbql-refs query))))

;;; ---------------------------------------------------------------------------
;;; Transitive walker
;;; ---------------------------------------------------------------------------

(defn batch-load-cards
  "Load every `:model/Card` whose id is in `ids` in one query.

  Archived cards are included (a lineage may run through an archived intermediate
  model); deleted cards, absent from the table, drop out of the result."
  [ids]
  (t2/select :model/Card :id [:in ids]))

(defn card->tables
  "The set of every physical table id transitively reachable from `card` through
  the card→source-card graph, the source cards unwound to their leaves.

  The walk is breadth-first and batched — one `t2/select :model/Card` per layer,
  not per card. A table reached by several paths is counted once; a cycle
  terminates rather than looping. A referenced card that has been deleted is
  skipped with a warning; an archived one is kept.

  `card` must be a `:model/Card` row with a `:dataset_query` key."
  [card]
  {:pre [(some? (:dataset_query card))]}
  ;; Cache providers across the walk: otherwise every
  ;; application-database-metadata-provider call rebuilds a fresh provider and
  ;; re-pays its metadata round-trips.
  (lib-be/with-metadata-provider-cache
    (let [root-refs (card->immediate-refs card)]
      (loop [tables   (:tables root-refs)
             visited  #{(:id card)}
             frontier (:cards root-refs)]
        (let [new-ids (set/difference frontier visited)]
          (if (empty? new-ids)
            tables
            (let [loaded     (batch-load-cards new-ids)
                  loaded-ids (into #{} (map :id) loaded)
                  missing    (set/difference new-ids loaded-ids)]
              (doseq [id missing]
                (log/warnf "card->tables: card %d not found (deleted?); skipping." id))
              (let [layer-refs  (map card->immediate-refs loaded)
                    new-tables  (into #{} (mapcat :tables) layer-refs)
                    new-cards   (into #{} (mapcat :cards) layer-refs)]
                (recur (into tables new-tables)
                       (into visited new-ids)
                       new-cards)))))))))
