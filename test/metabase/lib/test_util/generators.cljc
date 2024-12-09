(ns metabase.lib.test-util.generators
  (:require
   #?@(:cljs (metabase.test-runner.assert-exprs.approximately-equal))
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.generators.filters :as gen.filters]
   [metabase.lib.test-util.generators.util :as gen.u]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

;; NOTE: Being able to *execute* these queries and grok the results would actually be really powerful, if we can
;; achieve it with moderate cost. I think we can, at least for most queries. Some temporal stuff is a huge PITA,
;; but we can get the regular filters and aggregations nicely.
;; Queries which return nothing are valid, and we should generate them, but they're less interesting than those with
;; partial or complete return values!

;; Random Walk =======================================================================================================
;; The below is an approach to generating a space of all possible queries by iteratively taking "steps" with weighted
;; probabilities. Most steps actually come as pairs: adding and removing something.
;; Many steps come in groups, each choosing one of several possible columns to act on.
;;
;; In terms of tests exploring this space, I think there are several useful types:
;; - Checking properties of one query: given a random query, it must satisfy some property.
;;   - No duplicate names, sanity checks, etc.
;; - Checking before/after properties of a step: each step knows what it should do to the query.
;;   - Eg. after adding an aggregation, `lib/aggregations` must return something new, in the last position, that tracks
;;     with what we just added.
;; - Checking before/after/reversal properties of an invertible step, likewise.

;; Bonus: the FE tests should be able to hook into these CLJC functions, and run the single query checks and the
;; before/after steps after taking the action in the UI!

;; Design Notes ======================================================================================================
;; We have to make sure that simple, singular cases are not drowned out by large families of options. Eg. the set of
;; possible aggregations to add on a stage has one `:count` and perhaps 200 of sum, avg, min, max, etc. multiplied by
;; 20 columns. Therefore we choose the operator first, and then fill in any extra details afterward.
;;
;; To generate the next query in a sequence, we have three possible actions:
;; 1. Throw away this query and start over.
;; 2. "Pop" the previous step and do something else from that earlier branch.
;; 3. Take a further step atop this query.
;;
;; By tuning those probabilities, we can get a good balance of many basic queries or a variety of "deeper" queries.
;; See the bottom of the file for some

;; - Better is a guided series of weighted choices: x% chance the next step is aggregating.
;;   - Then having decided to aggregate, uniformly pick one of ~8 operators, and uniformly pick a column if needed.
;;   - That preserves the density of interesting cases like :count vs. a swarm of samey :min clauses.
;; - The generators are powered by inner functions that actually produce a `[:step ...]` command.
;; - The interface for defining steps shouldn't need to think too hard about generators.
;;   - It can work like `for` except that each line is choosing probabilistically from a list of choices.
;; - The context contains a stack of previous queries, so we can (with some probability) pop back up that stack to
;;   abandon a branch we've been exploring and try something else.

(defn- step-key [[op]]
  op)

;; These are multimethods keyed by the step's label.
;; NOTE: These multimethods take and return queries, not contexts.
(defmulti ^:private run-step*
  "Applies a step to the given query, returning the updated query."
  (fn [_query step]
    (step-key step)))

(defmulti ^:private before-and-after
  "Runs the before/after tests for the given step, given the before and after queries."
  (fn [_before _after step]
    (step-key step)))

(defmulti ^:private next-steps*
  "Given a query, generate a nested set of choices, with the leaf nodes being possible steps."
  (fn [_query step-kind]
    step-kind))

(def ^:private step-kinds (atom {}))

(def ^:private step-defaults
  {:weight 100})

(defn- add-step [{:keys [kind] :as step-def}]
  (swap! step-kinds assoc kind (merge step-defaults step-def)))

;; Helpers =======================================================================================
(defn- choose-stage
  "Chooses a stage to operator on. 80% act on -1, 20% chooses a stage by index (which might be the last stage)."
  [query]
  (if (< (rand) 0.8)
    -1
    (rand-int (count (:stages query)))))

(def ^:private ^:dynamic *safe-for-old-refs*
  "Controls whether the generators will construct queries with things like multiple joins to the same table, which
  create ambiguous refs in classic pMBQL.

  Default to true, ie. safe for the current library.

  Set to false when generating only for new `:column` refs by `:ident`, and you want to exercise them properly."
  true)

(defn- only-safe-columns
  "Given a column list, filters out any that have properties we cannot (currently) support.

  - We cannot implicitly join a column if its FK is ambiguous: current MBQL uses only the ID of the FK and that isn't
    unique in the event of a double- or self-join."
  [columns]
  (if-not *safe-for-old-refs*
    columns
    (let [ambiguous-columns (->> columns
                                 (map :id)
                                 frequencies
                                 (m/filter-vals #(> % 1)))]
      (remove (fn [col]
                (and (= (:lib/source col) :source/implicitly-joinable)
                     (ambiguous-columns (:fk-field-id col))))
              columns))))

;; Aggregations ==================================================================================
;; TODO: Add a schema for the step `[vectors ...]`?
(add-step {:kind :aggregate})

;; TODO: columns should be specified with :ident, but that isn't available yet. For now, pMBQL refs will do.
(defmethod run-step* :aggregate [query [_aggregate stage-number agg-clause]]
  (lib/aggregate query stage-number agg-clause))

(defmethod before-and-after :aggregate [before after [_aggregate stage-number agg-clause]]
  (let [before-aggs (lib/aggregations before stage-number)
        after-aggs  (lib/aggregations after  stage-number)]
    (testing (str ":aggregate stage " stage-number " by " agg-clause)
      (is (= (inc (count before-aggs))
             (count after-aggs))
          "should have one more aggregation than before")
      (is (= before-aggs
             (butlast after-aggs))
          "should add the new aggregation at the end")
      (is (=? agg-clause
              (last after-aggs))
          "new aggregation should resemble the intended one"))))

;; TODO: If exhaustion is a goal, we should think about making these into generators or otherwise reifying the choices.
(defmethod next-steps* :aggregate [query _aggregate]
  (let [stage-number (choose-stage query)
        operator     (gen.u/choose (lib/available-aggregation-operators query stage-number))
        agg          (if (:requires-column? operator)
                       (lib/aggregation-clause operator (gen.u/choose (:columns operator)))
                       (lib/aggregation-clause operator))]
    [:aggregate stage-number agg]))

;; Breakouts =====================================================================================
(add-step {:kind :breakout})

(defn- breakout-exists? [query stage-number column]
  (boolean (lib.breakout/breakout-column? query stage-number column {:same-binning-strategy? true
                                                                     :same-temporal-bucket?  true})))

(defmethod next-steps* :breakout [query _breakout]
  (let [stage-number (choose-stage query)
        column       (gen.u/choose (only-safe-columns (lib/breakoutable-columns query stage-number)))
        ;; If this is a temporal column, we need to choose a unit for it. Nil if it's not temporal.
        ;; TODO: Don't always bucket/bin! We should sometimes choose the "Don't bin" option etc.
        bucket       (gen.u/choose (lib/available-temporal-buckets query stage-number column))
        binning      (gen.u/choose (lib/available-binning-strategies query stage-number column))
        brk-column   (cond-> column
                       bucket  (lib/with-temporal-bucket bucket)
                       binning (lib/with-binning binning))]
    (when (breakout-exists? query stage-number brk-column)
      [:breakout stage-number (lib/ref brk-column) brk-column])))

(defmethod run-step* :breakout [query [_breakout stage-number brk-clause _column]]
  (lib/breakout query stage-number brk-clause))

(defmethod before-and-after :breakout [before after [_breakout stage-number brk-clause column]]
  ;; Duplicate breakouts are not allowed! So we want to check that logic.
  (let [before-breakouts (lib/breakouts before stage-number)
        after-breakouts  (lib/breakouts after  stage-number)
        fresh?           (not (breakout-exists? before stage-number column))]
    (testing (str ":breakout stage " stage-number
                  "\n\nBefore query\n" (u/pprint-to-str before)
                  "\n\nwith column\n" (u/pprint-to-str column)
                  "\n\nwith breakout clause\n" (u/pprint-to-str brk-clause)
                  "\n")
      (if fresh?
        (testing "freshly added breakout columns"
          (is (= false (breakout-exists? before stage-number column))
              "are not present before")
          (is (= true  (breakout-exists? after  stage-number column))
              "are present after")
          (testing "go at the end of the list"
            (is (= (count after-breakouts)
                   (inc (count before-breakouts))))
            (is (=? brk-clause (last after-breakouts)))))
        (testing "duplicate breakout columns are blocked"
          (is (= (count after-breakouts)
                 (count before-breakouts))))))))

;; Filters =======================================================================================
(add-step {:kind :filter})

(defmethod next-steps* :filter [query _filter]
  (let [stage-number (choose-stage query)]
    [:filter stage-number (gen.filters/gen-filter (only-safe-columns (lib/filterable-columns query stage-number)))]))

(defmethod run-step* :filter [query [_filter stage-number filter-clause]]
  (lib/filter query stage-number filter-clause))

(defmethod before-and-after :filter [before after [_filter stage-number filter-clause]]
  (let [before-filters (lib/filters before stage-number)
        after-filters  (lib/filters after  stage-number)]
    (testing (str ":filter stage " stage-number
                  "\n\nBefore query\n" (u/pprint-to-str before)
                  "\n\nAfter query\n" (u/pprint-to-str after)
                  "\n\nwith filter clause\n" (u/pprint-to-str filter-clause)
                  "\n")
      (if (some #(lib.equality/= % filter-clause) before-filters)
        (testing "with an existing, equivalent filter"
          (testing "does not add a new one"
            (is (= (count before-filters)
                   (count after-filters)))))
        (testing "with a new filter"
          (testing "adds it to the end of the list"
            (is (= (count after-filters)
                   (inc (count before-filters))))
            (is (=? filter-clause (last after-filters))))
          (testing (str `lib/filter-operator " returns the right op")
            ;; TODO: The generator will happily build multiple joins
            (when-let [op (mu/disable-enforcement
                            (lib/filter-operator after stage-number (last after-filters)))]
              (is (= (first filter-clause)
                     (:short op))))))))))

;; Expressions ===================================================================================
;; We only support a few basic expressions for now. It would be good to exercise all the expression types eventually,
;; but the main objective here is to generate *some* expressions so they can be consumed by filters, aggregations, etc.
;; since that's a major bug source.
(add-step {:kind :expression})

(defn- gen-expression:number [column]
  (lib/+ column 1))

(defn- gen-expression:string [column]
  (lib/concat column "__concat"))

(defn- gen-expression [columns]
  (let [numbers (map #(vector gen-expression:number %) (filter lib.types.isa/number? columns))
        strings (map #(vector gen-expression:string %) (filter lib.types.isa/string? columns))
        [f col] (gen.u/choose (concat numbers strings))]
    (when (and f col)
      (f col))))

(def ^:private identifier-chars-initial
  (str "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
       "abcdefghijklmnopqrstuvwxyz"
       "_"))

(def ^:private identifier-chars
  (str identifier-chars-initial "0123456789"))

(def ^:private expr-name-chars
  (str identifier-chars " []<>+!@$%&*^()"))

(defn- gen-expression-name []
  (let [len (gen.u/choose (range 3 30))]
    (apply str (repeatedly len #(gen.u/choose expr-name-chars)))))

(defmethod next-steps* :expression [query _expression]
  (let [stage-number (choose-stage query)
        ;; Always adding at the end for now. Editing will come later.
        expr-pos     (count (lib/expressions query stage-number))]
    (when-let [expr-clause (gen-expression (only-safe-columns (lib/expressionable-columns query stage-number expr-pos)))]
      [:expression stage-number (gen-expression-name) expr-clause])))

(defmethod run-step* :expression [query [_expression stage-number expr-name expr-clause]]
  (lib/expression query stage-number expr-name expr-clause))

(defmethod before-and-after :expression [before after [_expression stage-number expr-name _expr-clause]]
  (let [before-exprs (lib/expressions before stage-number)
        after-exprs  (lib/expressions after stage-number)]
    (testing "adding an expression"
      (testing "adds it to the expressions list"
        (is (= (inc (count before-exprs))
               (count after-exprs))))
      (testing "adds it to visible columns"
        (is (=? [{:lib/type   :metadata/column
                  :lib/source :source/expressions
                  :name       expr-name
                  :id         (symbol "nil #_\"key is not present.\"")}]
                (filter #(= (:name %) expr-name) (lib/visible-columns after stage-number))))))))

;; Order by ======================================================================================
(add-step {:kind   :order-by
           ;; Lower weight than the default 100 - this is a rare operation.
           :weight 30})

(defmethod next-steps* :order-by [query _order-by]
  (let [stage-number (choose-stage query)]
    (when-let [columns (->> (lib/orderable-columns query stage-number)
                            (remove :order-by-position) ; Drop those which already have an order.
                            only-safe-columns
                            not-empty)]
      [:order-by stage-number (lib/ref (gen.u/choose columns)) (gen.u/choose [:asc :desc])])))

(defmethod run-step* :order-by [query [_order-by stage-number orderable direction]]
  (lib/order-by query stage-number orderable direction))

(defmethod before-and-after :order-by [before after [_order-by stage-number orderable direction]]
  (let [before-orders (lib/order-bys before stage-number)
        after-orders  (lib/order-bys after stage-number)]
    ;; TODO: No duplicates! The new ref should never collide with one in `before` - except for the FK ambiguity.
    ;; I don't want to introduce a flake, but once that issue is fixed there should be a test here.
    (testing (str "\n\nNew order-by"
                  "\n\nBefore query\n" (u/pprint-to-str before)
                  "\n\nAfter query\n" (u/pprint-to-str after)
                  "\n\nsorting " direction " on \n" (u/pprint-to-str orderable)
                  "\n")
      (testing "new order-by clauses are added at the end of the sort order"
        (is (= (inc (count before-orders))
               (count after-orders)))
        (is (lib.equality/= (lib/order-by-clause orderable direction)
                            (last after-orders)))))))

;; Explicit join =================================================================================
(add-step {:kind   :join
           :weight 30})

(defmethod next-steps* :join [query _join]
  (let [stage-number        (choose-stage query)
        strategy            (gen.u/weighted-choice {:left-join  80
                                                    :inner-join 10
                                                    :right-join 5
                                                    :full-join  5})
        ;; TODO: Explicit joins against cards are possible, but we don't have cards yet.
        condition-space     (for [table (lib.metadata/tables query)
                                  :let [conditions (lib/suggested-join-conditions query stage-number table)]
                                  :when (seq conditions)]
                              [table conditions])]
    (when-let [[target conditions] (and (seq condition-space)
                                        (rand-nth condition-space))]
      [:join stage-number target (rand-nth conditions) strategy])))

(defmethod run-step* :join [query [_join stage-number target condition strategy]]
  (lib/join query stage-number (lib/join-clause target [condition] strategy)))

(defmethod before-and-after :join [before after [_join stage-number target condition strategy]]
  (let [before-joins (lib/joins before stage-number)
        after-joins  (lib/joins after stage-number)]
    (testing "adding a new explicit join"
      (testing "creates a new clause"
        (is (= (inc (count before-joins))
               (count after-joins)))
        (testing "at the end"
          (is (=? {:lib/type   :mbql/join
                   :strategy   strategy
                   :alias      string?
                   :fields     :all
                   :stages     [{:source-table (:id target)}]
                   :conditions [condition]}
                  (last after-joins))))))))

;; Append stage ==================================================================================
(add-step {:kind   :append-stage
           ;; Rare but it happens.
           :weight 5})

(defn- all-stage-parts [query stage-number]
  (mapcat #(% query stage-number)
          [lib/joins lib/aggregations lib/breakouts lib/expressions lib/filters lib/order-bys]))

(defmethod next-steps* :append-stage [query _append-stage]
  ;; Appending a stage is allowed when there's at least one breakout or aggregation.
  ;; TODO: Is there a way to be more flexible here? The QP uses more nesting than the UI allows.
  (when (or (seq (lib/aggregations query -1))
            (seq (lib/breakouts query -1)))
    [:append-stage]))

(defmethod run-step* :append-stage [query [_append-stage]]
  (lib/append-stage query))

(defmethod before-and-after :append-stage [before after _step]
  (testing "appending a stage"
    (testing "increments the stage-count"
      (is (= (inc (lib/stage-count before))
             (lib/stage-count after))))

    (testing "adds a new, empty stage"
      (is (empty? (all-stage-parts after -1))))))

;; Generator internals ===========================================================================
(defn- run-step
  "Applies a step, returning the updated context."
  [{:keys [query] :as ctx} step]
  {:query    (run-step* query step)
   :step     step
   :previous ctx})

;; NOTE: The public surface consumes and returns contexts, which contain queries among other things.
;; The contexts are intended to be opaque, and useful for eg. diagnosing and reproducing failures.
(defn test-step
  "Applies a step and runs its before/after tests with [[before-and-after]].

  If those tests pass, returns the updated context, including the altered query.
  The tests will `throw` if they fail, so this does not return in that case."
  [{before :query :as ctx} step]
  (let [{after :query :as ctx'} (run-step ctx step)]
    ;; Run the before/after tests. Throws if the tests fail.
    (try
      (before-and-after before after step)
      ctx'

      (catch #?(:clj Throwable :cljs js/Error) e
        (throw (ex-info "Error in before/after testing" (-> ctx
                                                            (dissoc :query)
                                                            (assoc :before before, :after after, :step step))
                        e))))))

(defn history-seq
  "Returns the sequence of contexts, newest first."
  [ctx]
  (->> ctx
       (iterate :previous)
       (take-while some?)))

(defn step-seq
  "Returns the sequence of steps that brought about this query, oldest first."
  [ctx]
  (->> ctx history-seq reverse next (map :step)))

(defn query->context
  "Retrieves the generator context from the metadata on a generated query."
  [query]
  (-> query meta ::context))

(defn- mk-step-control [p-reset p-pop]
  (fn []
    (let [r (rand)]
      (cond
        (< r p-reset)           :reset
        (< r (+ p-pop p-reset)) :pop
        :else                   :step))))

(def ^{:arglists '([])} step-control:default
  "Defaults to 0.04 probability of reset, plus 0.16 probabilty of popping one level.

  ```
   X
   X           X
   X           X
   X    X X X  X  X
   XXXXXXXXXXXXXXXXXXXX   X
   XXXXXXXXXXXXXXXXXXXXXXXX   XX   X X
  ----------------------------------------
  01234567890123456789012345678901234567890
            1         2         3         4
                 Depth
  ```"
  (mk-step-control 0.04 0.16))

(def ^:dynamic *step-control* step-control:default)

(defn- choose-step [kinds]
  (gen.u/weighted-choice (map (juxt :kind :weight) (vals kinds))))

(defn- gen-step
  "Given a query, choose the next step, apply and test it, and return the new context.

  Makes a weighted choice between:
  - 20% pop to a previous query, choosing a different branch.
    - That previous query has already been yielded, so recurse to choose another thing to do next.
  - 80% choose among the step-keys uniformly, choose a step in detail with `next-steps*`, and take that step."
  [{:keys [previous query] :as ctx}]
  (case (*step-control*)
    ;; Revert to the original.
    :reset (-> ctx history-seq last recur)
    ;; Up one level, if it exists.
    :pop   (recur (or previous ctx))
    ;; Uniformly choose a step-key from those registered, generate that step, and run it.
    ;; Return the new context.
    :step  (let [step-kind (choose-step @step-kinds)]
             (if-let [step (next-steps* query step-kind)]
               (test-step ctx step)
               (recur ctx)))))

(defn- random-queries-from*
  "Returns a lazy sequence of queries powered by the generators."
  [ctx limit]
  (take limit (next (iterate gen-step ctx))))

(defn- context-for [query0]
  {:query    query0
   :previous nil
   :step     nil})

(defn random-queries-from
  "Given a starter query, generate a lazy sequence of random-walk queries over it.

  This sequence is infinite! Be kind to your REPL."
  ([starting-query]
   (random-queries-from 10 starting-query))
  ([starting-query limit]
   ;; Change this to a map?
   (for [{:keys [query] :as ctx} (random-queries-from* (context-for starting-query) limit)]
     (vary-meta query assoc ::context (dissoc ctx :query)))))

(defn- expected-total [step-kind]
  (fn [steps]
    (->> steps
         (filter (comp #{step-kind} first))
         count)))

(defn- expected-order-bys [steps]
  ;; Each :order-by adds one, but the first `:aggregate` or `:breakout` we see drops any from that stage.
  (->> steps
       (reduce (fn [{:keys [aggregated stages] :as m} [step stage-number]]
                 (let [stage (if (= stage-number -1)
                               (dec stages)
                               stage-number)]
                   (case step
                     (:aggregate :breakout) (if (aggregated stage)
                                              m
                                              ;; If this stage was not previously aggregated, discount its orders and
                                              ;; flag it as aggregated.
                                              (-> m
                                                  (assoc-in [:aggregated stage] true)
                                                  (assoc-in [:orders stage] 0)
                                                  ;; AND all stages
                                                  ))
                     :order-by              (update-in m [:orders stage] (fnil inc 0))
                     :append-stage          (update m :stages inc)
                     m)))
               {:aggregated {}
                :orders     {}
                :stages     1})
       :orders
       vals
       (reduce + 0)))

(deftest ^:parallel query-generator-test
  (doseq [table (meta/tables)
          q     (-> (lib/query meta/metadata-provider (meta/table-metadata table))
                    (random-queries-from 10))]
    (doseq [[item act-fn exp-fn] [["aggregations" lib/aggregations (expected-total :aggregate)]
                                  ["breakouts"    lib/breakouts    (expected-total :breakout)]
                                  ["joins"        lib/joins        (expected-total :join)]
                                  ["order bys"    lib/order-bys    expected-order-bys]]]
      (let [ctx   (query->context q)
            steps (step-seq ctx)]
        (testing (str "\n\nwith generated query\n" (u/pprint-to-str q)
                      "\n\nwith steps\n" (str/join "\n" (map pr-str steps)))
          (testing (str "\n\n" item " line up")
            (is (= (exp-fn steps)
                   (->> (lib/stage-count q)
                        range
                        (map (comp count #(act-fn q %)))
                        (reduce +))))))))))

(comment
  ;; Produces a map of {p-reset {p-pop {depth count}}} after generating 100 queries with those settings.
  ;; The code below will print histograms of each of those.
  ;; Helpful for visualizing these tunable parameters.
  (def stats
    (into (sorted-map)
          (for [p-reset (range 0.01 0.1 0.005)]
            [p-reset (into (sorted-map)
                           (for [p-pop (range 0.1 0.6 0.02)]
                             [p-pop (binding [*step-control* (mk-step-control p-reset p-pop)]
                                      (->> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                           (random-queries-from 100)
                                           (map (comp count step-seq query->context))
                                           frequencies
                                           (into (sorted-map))))]))])))

  #_{:clj-kondo/ignore [:discouraged-var]}
  (defn- print-histogram [m]
    (let [mode   (reduce max 0 (vals m))
          domain (reduce max 0 (keys m))]
      (doseq [row (range (inc mode) 0 -1)]
        (->> (for [i (range (inc domain))
                   :let [x (get m i)]]
               (if (and x (> x row))
                 \X
                 \space))
             (apply str)
             println))
      (println (apply str (repeat domain \-)))
      (println (apply str (for [i (range 0 (inc domain))]
                            (last (str i)))))))

  (print-histogram (get-in stats [0.04 0.34]))

  #_{:clj-kondo/ignore [:discouraged-var]}
  (defn- print-stats [st]
    (doseq [[p-reset inner] st
            [p-pop m]       inner]
      (prn p-reset p-pop)
      (print-histogram m)
      (println)
      (println)))
  (print-stats stats))
