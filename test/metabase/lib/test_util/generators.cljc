(ns metabase.lib.test-util.generators
  (:require
   #?@(:cljs (metabase.test-runner.assert-exprs.approximately-equal))
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.generators :as gen]
   [java-time.api :as t]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util :as u]))

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

(defn- add-step [{:keys [kind] :as step-def}]
  (swap! step-kinds assoc kind step-def))

;; Helpers =======================================================================================
(defn- choose
  "Uniformly chooses among a seq of options.

  Returns nil if the list is empty! This is handy for choose-and-do vs. do-nothing while writing the next steps."
  [xs]
  (when-not (empty? xs)
    (rand-nth xs)))

(defn- choose-stage
  "Chooses a stage to operator on. 80% act on -1, 20% chooses a stage by index (which might be the last stage)."
  [query]
  (if (< (rand) 0.8)
    -1
    (rand-int (count (:stages query)))))

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
        operator     (choose (lib/available-aggregation-operators query stage-number))
        agg          (if (:requires-column? operator)
                       (lib/aggregation-clause operator (choose (:columns operator)))
                       (lib/aggregation-clause operator))]
    [:aggregate stage-number agg]))

;; Breakouts =====================================================================================
(add-step {:kind :breakout})

(defmethod next-steps* :breakout [query _breakout]
  (let [stage-number (choose-stage query)
        column       (choose (lib/breakoutable-columns query stage-number))
        ;; If this is a temporal column, we need to choose a unit for it. Nil if it's not temporal.
        ;; TODO: Don't always bucket/bin! We should sometimes choose the "Don't bin" option etc.
        bucket       (choose (lib/available-temporal-buckets query stage-number column))
        binning      (choose (lib/available-binning-strategies query stage-number column))
        brk-column   (cond-> column
                       bucket  (lib/with-temporal-bucket bucket)
                       binning (lib/with-binning binning))]
    [:breakout stage-number (lib/ref brk-column) brk-column]))

(defmethod run-step* :breakout [query [_breakout stage-number brk-clause _column]]
  (lib/breakout query stage-number brk-clause))

(defmethod before-and-after :breakout [before after [_breakout stage-number brk-clause column]]
  ;; Duplicate breakouts are not allowed! So we want to check that logic.
  (let [before-breakouts (lib/breakouts before stage-number)
        after-breakouts  (lib/breakouts after  stage-number)
        opts             {:same-binning-strategy? true
                          :same-temporal-bucket?  true}
        fresh?           (empty? (lib.breakout/existing-breakouts before stage-number column opts))]
    (testing (str ":breakout stage " stage-number
                  "\n\nBefore query\n" (u/pprint-to-str before)
                  "\n\nwith column\n" (u/pprint-to-str column)
                  "\n\nwith breakout clause\n" (u/pprint-to-str brk-clause)
                  "\n")
      (if fresh?
        (testing "freshly added breakout columns"
          (is (= false (boolean (lib.breakout/breakout-column? before stage-number column opts)))
              "are not present before")
          (is (= true  (boolean (lib.breakout/breakout-column? after  stage-number column opts)))
              "are present after")
          (testing "go at the end of the list"
            (is (= (count after-breakouts)
                   (inc (count before-breakouts))))
            (is (=? brk-clause (last after-breakouts)))))
        (testing "duplicate breakout columns are blocked"
          (is (= (count after-breakouts)
                 (count before-breakouts))))))))

;; Filters =======================================================================================
(defn- gen-int []
  (- (rand-int 2000000) 1000000))

(def ^:private valid-ascii
  (mapv char (range 0x20 0x7f)))

(def ^:private han-unicode
  (mapv char (range 0x4e00 0xa000)))

(defn- gen-string
  ([]
   (if (< (rand) 0.1)
     (gen-string han-unicode 40)
     (gen-string valid-ascii 70)))
  ([symbols max-len]
   (apply str (repeatedly (inc (rand-int max-len)) #(rand-nth symbols)))))

(defn- gen-time []
  (t/local-time (rand-int 24) (rand-int 60) (rand-int 60) (rand-int 1000000000)))

(defn- gen-time:minute []
  (t/local-time (rand-int 24) (rand-int 60) 0 0))

(defn- gen-date []
  (t/plus (t/local-date (+ 2000 (rand-int 40)) 1 1)
          (t/days (rand-int 365))))

(defn- gen-datetime []
  (t/local-date-time (gen-date) (gen-time)))

(defn- gen-datetime:minute []
  (t/local-date-time (gen-date) (gen-time:minute)))

(defn- gen-latitude []
  ;; +/- 75 degrees is a generous but plausible range for latitudes.
  (* 150 (- (rand) 0.5)))

(defn- gen-longitude []
  ;; +/- 180 degrees
  (- (* 360 (rand))
     180))

(def ^:private fake-categories
  (vec (for [i (range 1 41)]
         (str "Fake Category " i))))

(defn- gen-category []
  ;; Just some made-up values that are clearly not random strings for debugging.
  (rand-nth fake-categories))

(defn- rand-column-value [{:keys [effective-type] :as column}]
  (cond
    ;; Numeric PKs and FKs are always integers.
    (and (lib.types.isa/id? column)
         (lib.types.isa/numeric? column))              (abs (gen-int))
    (#{:type/BigInteger :type/Integer} effective-type) (gen-int)
    (lib.types.isa/category? column)                   (gen-category)
    (lib.types.isa/latitude? column)                   (gen-latitude)
    (lib.types.isa/longitude? column)                  (gen-longitude)
    (lib.types.isa/numeric? column)                    (cond-> (gen-int)
                                                         (< (rand) 0.5) (+ (rand)))
    (lib.types.isa/string-or-string-like? column)      (gen-string)
    (lib.types.isa/time? column)                       (gen-time)
    (lib.types.isa/date-without-time? column)          (gen-date)
    (isa? effective-type :type/DateTime)               (gen-datetime)
    :else (throw (ex-info " !!! Not sure what values to generate for column" {:effective-type effective-type
                                                                         :column         column}))))

(defmulti ^:private gen-filter-clause
  (fn [_column operator]
    (:short operator)))

;; Binary operators like :<
(doseq [[op f] [[:<  lib/<]
                [:<= lib/<=]
                [:>  lib/>]
                [:>= lib/>=]]]
  (defmethod gen-filter-clause op [column _op]
    (f column (rand-column-value column))))

;; Multi-value operators like := and :starts-with
(doseq [[op f] [[:=                lib/=]
                [:!=               lib/!=]
                [:starts-with      lib/starts-with]
                [:ends-with        lib/ends-with]
                [:contains         lib/contains]
                [:does-not-contain lib/does-not-contain]]]
  (defmethod gen-filter-clause op [column _op]
    (apply f column (repeatedly (inc (rand-int 4))
                                #(rand-column-value column)))))

(defmethod gen-filter-clause :between [column _op]
  (let [lo (rand-column-value column)
        hi (rand-column-value column)]
    ;; TODO: Maybe make the LHS arg be the smaller? Right now they're random.
    (lib/between column lo hi)))

;; Unary operators like `:is-empty`.
(doseq [[op f] [[:is-empty  lib/is-empty]
                [:not-empty lib/not-empty]
                [:is-null   lib/is-null]
                [:not-null  lib/not-null]]]
  (defmethod gen-filter-clause op [column _op]
    (f column)))

(def ^:private ^:dynamic *filterable-columns* nil)

(defn- skipped-operator? [op]
  (#{:inside} (:short op)))

(defn- gen-filter:unit [column]
  (choose (if (lib.types.isa/date-without-time? column)
            [:day :week :month :quarter :year]
            [:minute :hour :day :week :month :quarter :year])))

(defn- gen-filter:relative-current [column]
  (lib/time-interval column :current (gen-filter:unit column)))

(defn- gen-filter:relative-date [column]
  ;; Current: day, week, month, quarter, year.
  ;; Previous: N minutes/hours/days/weeks/months/quarters/years
  ;; Next: N minutes/hours/days/weeks/months/quarters/years
  ;; And "include this month"!
  (if (< (rand) 0.2)
    (gen-filter:relative-current column)
    (let [past-future (choose [+ -])
          unit        (gen-filter:unit column)
          n           (choose (range 1 20))]
      (cond-> (lib/time-interval column (past-future n) unit)
        (< (rand) 0.2) (lib.options/update-options assoc :include-current true)))))

(defmulti ^:private gen-filter:exclude-date-options identity)

(defmethod gen-filter:exclude-date-options :hour-of-day [_unit]
  (range 0 24))

(defmethod gen-filter:exclude-date-options :day-of-week [_unit]
  (take 7 (iterate #(t/plus % (t/days 1)) (t/local-date))))

(defn- jan1 []
  (let [year (t/year (t/local-date))]
    (t/local-date year 1 1)))

(defmethod gen-filter:exclude-date-options :month-of-year [_unit]
  (->> (jan1)
       (iterate #(t/plus % (t/months 1)))
       (take 12)))

(defmethod gen-filter:exclude-date-options :quarter-of-year [_unit]
  (->> (jan1)
       (iterate #(t/plus % (t/months 3)))
       (take 4)))

(defn- gen-filter:exclude-date [column]
  ;; Excludes are stored currently as:
  ;; [:!= {} [:field {:temporal-unit :month-of-year} 123] "2024-02-01" "2024-03-01"]
  ;; to exclude February and March.
  ;; The allowed units are: :day-of-week, :month-of-year, and :quarter-of-year; plus :hour-of-day for datetimes.
  ;; Hours are 0-based numbers, the others use exemplar dates - the first of a month, the nearest Thursday to today.
  (let [units    (cond-> [:day-of-week :month-of-year :quarter-of-year]
                   (isa? (:effective-type column) :type/DateTime) (conj :hour-of-day))
        unit     (choose units)
        opts     (vec (gen-filter:exclude-date-options unit))
        ;; Always one option, plus 40% chance of more.
        selected (loop [sel #{(rand-nth opts)}]
                   (if (< (rand) 0.4)
                     (recur (conj sel (rand-nth opts)))
                     sel))
        ;; But if that selected everything, drop one at random.
        selected (cond-> selected
                   (= (count selected) (count opts)) (disj (rand-nth opts)))]
    (apply lib/!= (lib/with-temporal-bucket column unit) selected)))

(defn- specify-time? [column]
  (and (isa? (:effective-type column) :type/DateTime)
       (< (rand) 0.2)))

(defn- gen-filter:date-binary [column operator]
  (if (specify-time? column)
    (operator (lib/with-temporal-bucket column :minute) (gen-datetime:minute))
    (operator column (gen-date))))

(defn- gen-filter:date-between [column]
  ;; TODO: Swap the arguments to put the earlier one on the left.
  (if (specify-time? column)
    (lib/between (lib/with-temporal-bucket column :minute)
                 (gen-datetime:minute) (gen-datetime:minute))
    (lib/between column (gen-date) (gen-date))))

(defn- gen-filter:date [column]
  ;; - 30% relative date ranges
  ;; - 20% exclude
  ;; - 50% before/after/on/between
  (let [r (rand)]
    (cond
      (< r 0.30) (gen-filter:relative-date column)
      (< r 0.50) (gen-filter:exclude-date column)
      (< r 0.60) (gen-filter:date-binary column lib/<)
      (< r 0.70) (gen-filter:date-binary column lib/>)
      (< r 0.85) (gen-filter:date-binary column lib/=)
      :else      (gen-filter:date-between column))))

(defn- gen-filter:datetime [column]
  ;; TODO: There's actually no difference right now. Clean this up?
  (gen-filter:date column))

(defn- gen-filter:generic [column]
  (when-let [operator (some->> (:operators column)
                               (remove skipped-operator?)
                               rand-nth)]
    (gen-filter-clause column operator)))

(defn- gen-filter:inside [col1 col2]
  (let [[lat lon] (if (lib.types.isa/latitude? col1)
                    [col1 col2]
                    [col2 col1])
        [lat-min lat-max] (sort (repeatedly 2 gen-latitude))
        [lon-min lon-max] (sort (repeatedly 2 gen-longitude))]
    ;; Yes, this is really the argument order for an `:inside` clause.
    (lib/inside lat lon lat-max lon-min lat-min lon-max)))

(defn- gen-filter:coordinate [column]
  (let [counterpart? (if (lib.types.isa/latitude? column)
                       lib.types.isa/longitude?
                       lib.types.isa/latitude?)
        counterparts (filter counterpart? *filterable-columns*)]
    (if (and (seq counterparts)
             (< (rand) 0.5))
      ;; If we found a coordinate pair, generate an :inside filter 50% of the time.
      (gen-filter:inside column (choose counterparts))
      ;; Otherwise, generic filter on the original column.
      (gen-filter:generic column))))

;; TODO: Rather than naively generating filters here, we want to approach them like the UI.
;; - Relative date ranges like "this year".
;; - "Exclude" filters restricting eg. a particular month or days of the week.
;; - Specific date ranges:
;;   - Before, After and Between
;;   - If introducing time for a :type/DateTime column, we bucket the column by minute.
(defn- ^:private gen-filter []
  (let [column (rand-nth *filterable-columns*)]
    (cond
      (lib.types.isa/coordinate? column)             (gen-filter:coordinate column)
      (lib.types.isa/date-without-time? column)      (gen-filter:date column)
      (isa? (:effective-type column) :type/DateTime) (gen-filter:datetime column)
      :else
      (let [result (gen-filter:generic column)]
        ;; Sometimes we pick a column with no filter operators, and result is nil. Recur in that case to roll again.
        (if (= result ::no-operators)
          (recur)
          result)))))

(doseq [[op f] [[:and lib/and]
                [:or  lib/or]]]
  (defmethod gen-filter-clause op [_column _op]
    (->> (repeatedly gen-filter)
         (filter identity)
         (take (+ 2 (rand-int 3)))
         (apply f))))

;;
(add-step {:kind :filter})

(comment
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :people))]
    (def fs (vec (for [_ (range 500)]
                   (last (next-steps* query :filter)))))
    )

  (def fg (group-by first fs))
  (update-vals fg count)
  (filter (comp t/local-date? last) (:!= fg))
  *e
  )

(defmethod next-steps* :filter [query _filter]
  (let [stage-number (choose-stage query)]
    (binding [*filterable-columns* (lib/filterable-columns query stage-number)]
      [:filter stage-number (gen-filter)])))

(defmethod run-step* :filter [query [_filter stage-number filter-clause]]
  (lib/filter query stage-number filter-clause))

(defmethod before-and-after :filter [before after [_filter stage-number filter-clause]]
  ;; START HERE: Write some tests for these filters.
  #_(let [before-filters (lib/breakouts before stage-number)
        after-filters  (lib/breakouts after  stage-number)
        opts             {:same-binning-strategy? true
                          :same-temporal-bucket?  true}
        fresh?           (empty? (lib.breakout/existing-breakouts before stage-number column opts))]
    (testing (str ":breakout stage " stage-number
                  "\n\nBefore query\n" (u/pprint-to-str before)
                  "\n\nwith column\n" (u/pprint-to-str column)
                  "\n\nwith breakout clause\n" (u/pprint-to-str brk-clause)
                  "\n")
      (if fresh?
        (testing "freshly added breakout columns"
          (is (= false (boolean (lib.breakout/breakout-column? before stage-number column opts)))
              "are not present before")
          (is (= true  (boolean (lib.breakout/breakout-column? after  stage-number column opts)))
              "are present after")
          (testing "go at the end of the list"
            (is (= (count after-breakouts)
                   (inc (count before-breakouts))))
            (is (=? brk-clause (last after-breakouts)))))
        (testing "duplicate breakout columns are blocked"
          (is (= (count after-breakouts)
                 (count before-breakouts))))))))

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
    :step  (let [step-kind (rand-nth (keys @step-kinds))]
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

(deftest ^:parallel query-generator-test
  (doseq [table (meta/tables)
          q     (-> (lib/query meta/metadata-provider (meta/table-metadata table))
                    (random-queries-from 100))]
    (is (= (->> (lib/stage-count q)
                range
                (map (comp count #(lib/aggregations q %)))
                (reduce +))
           (->> (query->context q)
                step-seq
                (filter (comp #{:aggregate} first))
                count)))))

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
