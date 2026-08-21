(ns metabase.mcp.v2.query
  "Keyset cursors for the v2 query tools. A cursor is an ordinary query handle whose stored query
   already embeds the page boundary — the same resolved query with a server-derived total order
   and a keyset predicate past the last returned row — so paging is just another query on the
   existing handle store: no page-state column, no content-addressing, no schema change."
  (:require
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.common :as v2.common]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- order-by-specs
  "Map the last stage's order-bys onto positions in `ret-cols` as `[{:idx :dir} …]`, preserving
   order. Returns nil when an order-by targets a column outside the projection — its boundary
   value would be unreadable from the last returned row, so no gap-free cursor is possible."
  [query ret-cols]
  (reduce (fn [specs [dir _opts expr]]
            (let [col (lib/find-matching-column query -1 expr ret-cols)
                  idx (if col (.indexOf ^java.util.List ret-cols col) -1)]
              (if (neg? idx)
                (reduced nil)
                (conj specs {:idx idx :dir dir}))))
          []
          (lib/order-bys query)))

(defn- pk-index
  "Position in `ret-cols` of the source table's PK, when the query sources a table directly and
   the PK is in the projection."
  [resolved-query ret-cols]
  (let [source-table (get-in resolved-query [:stages 0 :source-table])]
    (when (int? source-table)
      (some (fn [[i col]]
              (when (and (= (:semantic-type col) :type/PK)
                         (= (:table-id col) source-table))
                i))
            (map-indexed vector ret-cols)))))

(defn- explicit-join?
  "True when `query-map` carries a non-empty `:joins` anywhere in its tree — a stage's own joins,
   a join's sub-stages, and legacy `:source-query` nesting alike. A whole-tree scan because a
   join at any depth can fan the result out, and the map may be MBQL 5 or a card's still-legacy
   stored query."
  [query-map]
  (boolean (some (fn [node] (and (map? node) (seq (:joins node))))
                 (tree-seq coll? seq query-map))))

(defn- source-card-ids
  "Card ids `query-map` sources at any depth: MBQL 5 `:source-card`, plus the legacy
   `:source-table \"card__<id>\"` spelling a card's own stored query may still use."
  [query-map]
  (let [legacy-id (fn [source-table]
                    (when (string? source-table)
                      (some-> (re-matches #"card__(\d+)" source-table) second parse-long)))]
    (into #{}
          (comp (filter map?)
                (mapcat (juxt :source-card (comp legacy-id :source-table)))
                (filter int?))
          (tree-seq coll? seq query-map))))

(defn- fan-out-join?
  "True when the query — or any saved question it sources, transitively — carries an explicit
   join. Join cardinality isn't knowable from metadata, so every join is assumed able to fan the
   source table out 1:many. Implicit joins (`:source-field` field refs) resolve many:1 against
   the target table's PK and cannot fan out, so they don't count. A sourced card whose stored
   query can't be read counts as a fan-out: an unreadable source can't be shown join-free, and
   the contract here is to refuse rather than page over an unproven shape."
  [metadata-providerable resolved-query]
  (loop [pending (list resolved-query), seen #{}]
    (if-let [query-map (first pending)]
      (or (explicit-join? query-map)
          (let [ids     (vec (remove seen (source-card-ids query-map)))
                sourced (reduce (fn [acc id]
                                  (if-let [stored (:dataset-query (lib.metadata/card metadata-providerable id))]
                                    (conj acc stored)
                                    (reduced nil)))
                                []
                                ids)]
            (if sourced
              (recur (into (rest pending) sourced) (into seen ids))
              true)))
      false)))

(defn- tiebreaker-specs
  "Deterministic tiebreakers to append after the existing order-bys to make the order total:
   the projected source-table PK alone when there is one (unique per result row — the fan-out
   guard in [[next-page-query]] is what upgrades the PK's metadata-level uniqueness to a
   row-level fact — and none at all if it is already ordered), else the full remaining
   projected-column tuple.

   Empty means the query's own order is already total. That is the condition
   [[next-page-query]] mints on and the condition [[with-total-order]] establishes."
  [resolved-query ret-cols ordered-idxs]
  (let [pk-idx (pk-index resolved-query ret-cols)]
    (cond
      (and pk-idx (contains? ordered-idxs pk-idx)) []
      pk-idx                                       [{:idx pk-idx :dir :asc}]
      :else                                        (into []
                                                         (comp (remove ordered-idxs)
                                                               (map (fn [i] {:idx i :dir :asc})))
                                                         (range (count ret-cols))))))

(defn- keyset-filter-clause
  "Lexicographic strictly-past-the-boundary predicate over the key columns:
   `(k₀ cmp v₀) OR (k₀ = v₀ AND k₁ cmp v₁) OR …`, where `cmp` is `>` for `:asc` keys and `<` for
   `:desc`. `values` are the boundary row's values aligned with `specs`."
  [target-cols specs values]
  (let [cmp   (fn [{:keys [idx dir]} v]
                (if (= dir :desc)
                  (lib/< (nth target-cols idx) v)
                  (lib/> (nth target-cols idx) v)))
        eq    (fn [{:keys [idx]} v]
                (lib/= (nth target-cols idx) v))
        terms (map-indexed
               (fn [i spec]
                 (let [eqs (map eq (take i specs) (take i values))]
                   (if (seq eqs)
                     (apply lib/and (concat eqs [(cmp spec (nth values i))]))
                     (cmp spec (nth values i)))))
               specs)]
    (if (= 1 (count terms))
      (first terms)
      (apply lib/or terms))))

(def ^:private exact-temporal-units
  "Truncation units at or coarser than a second. A value truncated this far renders without
   sub-second digits, so the emitted string parses back to exactly the value that was compared."
  #{:second :minute :hour :day :week :month :quarter :year})

(defn- lossy-boundary-col?
  "True when `col`'s emitted row values can't be trusted to round-trip exactly into a comparison
   literal. Raw datetime/time values are the offender: the row carries a formatted string
   (millisecond precision at best, driver-dependent rendering), so a keyset predicate built from
   it can re-include or skip boundary rows. Plain dates and bucket-truncated values render
   exactly and are safe."
  [col]
  (and (isa? (:effective-type col) :type/Temporal)
       (not (isa? (:effective-type col) :type/Date))
       (not (contains? exact-temporal-units (:unit (lib/temporal-bucket col))))))

(defn- row-positions
  "Positions in the result row of the query's projected columns, in projection order. The remap
   middleware can inject display columns anywhere in the row (each marked `:remapped_from`);
   dropping those must leave exactly the projection, verified 1:1 by name. Without the run's
   `result-cols` the row must be exactly the projection. Nil when alignment can't be proven —
   a misaligned read would build a wrong boundary, which is worse than no cursor."
  [ret-cols result-cols last-row]
  (let [positions (if result-cols
                    (into [] (keep-indexed (fn [i col] (when-not (:remapped_from col) i))) result-cols)
                    (vec (range (count ret-cols))))]
    (when (and (= (count positions) (count ret-cols))
               (every? #(< % (count last-row)) positions)
               (if result-cols
                 (every? (fn [[ret-col pos]]
                           (= (:name ret-col) (:name (nth result-cols pos))))
                         (map vector ret-cols positions))
                 (= (count last-row) (count ret-cols))))
      positions)))

(defn- next-page-query
  "The serialized next-page query for `resolved-query` given the truncated page's `last-row`
   (and the run's `result-cols` metadata, used to locate the projected columns in the row), or
   nil when no gap-free cursor can be built.

   An unaggregated last stage takes the order and keyset filter in place — the filter applies
   before the stage's own limit, so an embedded limit still yields exactly the next page. An
   aggregated last stage takes them in an appended stage (an in-stage filter would apply
   pre-aggregation); if that stage also carries its own limit the base set is cut before the
   total order can pin it down, so no cursor.

   Mints only for a query whose own order is already total — an empty [[tiebreaker-specs]]. A
   page served under a partial order broke its ties however the engine happened to, and no
   tiebreaker derived here can agree with an order that execution never ran under: around a
   boundary inside a tie group the two disagree, dropping rows and repeating others.
   [[with-total-order]] is what establishes the condition, by imposing the tiebreakers on the
   execution itself; a query that reaches here without them gets no cursor.

   A query that joins — directly, or through a saved question it sources — gets no cursor even
   with the order imposed. A 1:many join repeats the source-table PK across result rows, so the
   PK tiebreaker isn't unique per row and the order it makes isn't total after all; the
   full-tuple fallback can't be trusted either, since fanned-out rows can be wholly identical.
   A joined query is an explicit dead end rather than paging with silent gaps."
  [resolved-query result-cols last-row]
  (let [mp (lib-be/application-database-metadata-provider (:database resolved-query))]
    (when-not (fan-out-join? mp resolved-query)
      (let [query       (lib/query mp resolved-query)
            aggregated? (boolean (or (seq (lib/aggregations query))
                                     (seq (lib/breakouts query))))]
        (when-not (and aggregated? (lib/current-limit query))
          (let [ret-cols  (vec (lib/returned-columns query))
                positions (when (and (seq ret-cols) (sequential? last-row))
                            (row-positions ret-cols result-cols last-row))]
            (when positions
              (when-let [specs (order-by-specs query ret-cols)]
                (when (= [] (tiebreaker-specs resolved-query ret-cols (into #{} (map :idx) specs)))
                  (let [values      (mapv #(nth last-row (nth positions (:idx %))) specs)
                        ;; a remapped column can't be a cursor key (the remap middleware rewrites an
                        ;; order-by on it to sort by the display value, so the executed order and the
                        ;; keyset predicate — which compares raw values — would disagree: a gap), and
                        ;; neither can a column whose boundary value doesn't round-trip exactly.
                        unsafe-key? (some (fn [{:keys [idx]}]
                                            (let [col (nth ret-cols idx)]
                                              (or (:lib/external-remap col)
                                                  (:lib/internal-remap col)
                                                  (lossy-boundary-col? col))))
                                          specs)]
                    (when (and (seq specs) (not unsafe-key?) (every? some? values))
                      (let [base        (if aggregated? (lib/append-stage query) query)
                            target-cols (if aggregated? (vec (lib/returned-columns base)) ret-cols)
                            ;; the unaggregated stage already carries the total order; the appended
                            ;; stage starts bare, so it is re-imposed there.
                            with-order  (if aggregated?
                                          (reduce (fn [q {:keys [idx dir]}]
                                                    (lib/order-by q (nth target-cols idx) dir))
                                                  base
                                                  specs)
                                          base)]
                        (-> with-order
                            (lib/filter (keyset-filter-clause target-cols specs values))
                            lib/prepare-for-serialization)))))))))))))

(defn with-total-order
  "`serialized-query` with the tiebreakers that make its row order total appended to the last
   stage's order-bys — the same total order [[next-page-cursor!]] seeks past, imposed on the
   execution itself so the page that was served and the page that continues it agree on how ties
   break. Run a query through this before executing it if it may later be paged: a cursor is
   minted only for a query whose order is already total, so skipping this costs paging, never
   correctness.

   Returns the query unchanged when its order is already total, when no tiebreakers can be
   derived (an order-by outside the projection), when a join makes them unsound anyway (see
   [[next-page-query]]), or on any failure to rehydrate or manipulate the query. Idempotent: a
   second pass finds every tiebreaker already ordered."
  [serialized-query]
  (or (when (and (map? serialized-query)
                 (pos-int? (:database serialized-query))
                 (sequential? (:stages serialized-query))
                 (seq (:stages serialized-query))
                 (not (query-guards/native-query? serialized-query)))
        (try
          (let [mp (lib-be/application-database-metadata-provider (:database serialized-query))]
            (when-not (fan-out-join? mp serialized-query)
              (let [query    (lib/query mp serialized-query)
                    ret-cols (vec (lib/returned-columns query))]
                (when-let [ordered (order-by-specs query ret-cols)]
                  (when-let [tiebreakers (seq (tiebreaker-specs serialized-query ret-cols
                                                                (into #{} (map :idx) ordered)))]
                    (-> (reduce (fn [q {:keys [idx dir]}]
                                  (lib/order-by q (nth ret-cols idx) dir))
                                query
                                tiebreakers)
                        lib/prepare-for-serialization))))))
          (catch Exception e
            (log/warn e "Failed to impose a total order on the query")
            nil)))
      serialized-query))

(defn next-page-cursor!
  "For a truncated MBQL page, build the next-page query (the same resolved query with a
   server-derived total order appended and a keyset predicate past `last-row`), store it as an
   ordinary handle, and return that handle's UUID for use as an opaque `next_cursor`.

   `resolved-query` is the decoded serialized MBQL map that ran; `last-row` is the page's last
   returned row. Opts:

   - `:result-cols` — the run's `[:data :cols]` metadata. Pass it whenever available: the remap
     middleware can inject display columns anywhere in the row, and without `result-cols` the
     row must match the projection exactly or no cursor is minted.
   - `:prompt` — the user's original prompt, carried onto the cursor handle for the
     visualization feedback flow.

   `resolved-query` must be what actually ran, and must have been run through
   [[with-total-order]] first — the keyset seeks past the boundary in the query's own order, so
   a page served under a partial order has no continuation to seek.

   Returns nil whenever a gap-free cursor cannot be guaranteed: native SQL anywhere in the
   tree, an order that isn't already total, an explicit join anywhere — directly or inside a
   sourced saved question, or a sourced question whose stored query can't be read (a fan-out
   defeats every tiebreaker — see [[next-page-query]]), an order-by outside the projection, a
   row that can't be aligned with the projection, a nil boundary value, a key column that is
   remapped or whose values don't round-trip exactly (raw datetimes), an aggregated stage
   carrying its own limit, or any failure to rehydrate or manipulate the query."
  ([mcp-session-id user-id resolved-query last-row]
   (next-page-cursor! mcp-session-id user-id resolved-query last-row nil))
  ([mcp-session-id user-id resolved-query last-row {:keys [result-cols prompt]}]
   (when (and (map? resolved-query)
              (pos-int? (:database resolved-query))
              (sequential? (:stages resolved-query))
              (seq (:stages resolved-query))
              (not (query-guards/native-query? resolved-query)))
     (when-let [serialized (try
                             (next-page-query resolved-query result-cols last-row)
                             (catch Exception e
                               (log/warn e "Failed to build a next-page cursor query")
                               nil))]
       (v2.common/mint-query-handle! mcp-session-id
                                     user-id
                                     (v2.common/encode-serialized-query serialized)
                                     prompt)))))
