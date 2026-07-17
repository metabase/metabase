(ns metabase.mcp.v2.query
  "Keyset cursors for the v2 query tools. A cursor is an ordinary query handle whose stored query
   already embeds the page boundary — the same resolved query with a server-derived total order
   and a keyset predicate past the last returned row — so paging is just another query on the
   existing handle store: no page-state column, no content-addressing, no schema change."
  (:require
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
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

(defn- fan-out-join?
  "True when any stage carries an explicit join. Join cardinality isn't knowable from metadata,
   so every join is assumed able to fan the source table out 1:many. Implicit joins
   (`:source-field` field refs) resolve many:1 against the target table's PK and cannot fan
   out, so they don't count."
  [resolved-query]
  (boolean (some (comp seq :joins) (:stages resolved-query))))

(defn- tiebreaker-specs
  "Deterministic tiebreakers appended after the existing order-bys to make the order total:
   the projected source-table PK alone when there is one (unique per result row — the fan-out
   guard in [[next-page-query]] is what upgrades the PK's metadata-level uniqueness to a
   row-level fact — and none at all if it is already ordered), else the full remaining
   projected-column tuple."
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

   A query with an explicit join gets no cursor at all. A 1:many join repeats the source-table
   PK across result rows, so the PK-only tiebreaker would drop the boundary row's remaining
   fan-out rows; and the full-tuple fallback is no better, because the already-served first
   page broke ties in whatever order the engine produced, while the cursor's appended
   tiebreakers impose their own — the two orders disagree within tie groups straddling the
   boundary, yielding both dropped and repeated rows. No tiebreaker derivable at mint time can
   agree with an order the first page never ran under, so a joined query refuses the cursor
   (an explicit dead end) rather than paging with silent gaps."
  [resolved-query result-cols last-row]
  (when-not (fan-out-join? resolved-query)
    (let [mp          (lib-be/application-database-metadata-provider (:database resolved-query))
          query       (lib/query mp resolved-query)
          aggregated? (boolean (or (seq (lib/aggregations query))
                                   (seq (lib/breakouts query))))]
      (when-not (and aggregated? (lib/current-limit query))
        (let [ret-cols  (vec (lib/returned-columns query))
              positions (when (and (seq ret-cols) (sequential? last-row))
                          (row-positions ret-cols result-cols last-row))]
          (when positions
            (when-let [ordered (order-by-specs query ret-cols)]
              (let [tiebreakers (tiebreaker-specs resolved-query ret-cols (into #{} (map :idx) ordered))
                    specs       (into ordered tiebreakers)
                    values      (mapv #(nth last-row (nth positions (:idx %))) specs)
                    ;; a remapped column can't be a cursor key (the remap middleware rewrites an
                    ;; order-by on it to sort by the display value, so the executed order and the
                    ;; keyset predicate — which compares raw values — would disagree: a gap), and
                    ;; neither can a column whose boundary value doesn't round-trip exactly.
                    unsafe-key?   (some (fn [{:keys [idx]}]
                                          (let [col (nth ret-cols idx)]
                                            (or (:lib/external-remap col)
                                                (:lib/internal-remap col)
                                                (lossy-boundary-col? col))))
                                        specs)]
                (when (and (seq specs) (not unsafe-key?) (every? some? values))
                  (let [base        (if aggregated? (lib/append-stage query) query)
                        target-cols (if aggregated? (vec (lib/returned-columns base)) ret-cols)
                        ;; the unaggregated stage already carries its own order-bys; the appended
                        ;; stage starts bare, so the whole total order is re-imposed there.
                        to-order    (if aggregated? specs tiebreakers)
                        with-order  (reduce (fn [q {:keys [idx dir]}]
                                              (lib/order-by q (nth target-cols idx) dir))
                                            base
                                            to-order)]
                    (-> with-order
                        (lib/filter (keyset-filter-clause target-cols specs values))
                        lib/prepare-for-serialization)))))))))))

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

   Returns nil whenever a gap-free cursor cannot be guaranteed: native SQL anywhere in the
   tree, an explicit join anywhere (a fan-out defeats every mint-time tiebreaker — see
   [[next-page-query]]), an order-by outside the projection, a row that can't be aligned with
   the projection, a nil boundary value, a key column that is remapped or whose values don't
   round-trip exactly (raw datetimes), an aggregated stage carrying its own limit, or any
   failure to rehydrate or manipulate the query."
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
