(ns metabase.lib.test-util.generators
  (:require
   [clojure.test :refer [deftest is testing]]
   #_[clojure.test.check.generators :as gen]
   #_[malli.generator :as mg]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.generators.coroutines :as co]
   #?@(:cljs (metabase.test-runner.assert-exprs.approximately-equal))))

;; Ideas =============================================================================================================
;; I'm thinking about sampling vs. exhaustion. I think it would be powerful to devise a scheme for generating queries
;; that defines the "space" of possible queries, which can then be realized as a random sample, an "exhaustive" search,
;; or both.
;; On the other hand, the "shrinking" workflow in `test.check` is a powerful way to resolve to problems...
;; but perhaps we can get away with doing the shrinking to fixed examples by hand, and prefer reproducible randomness
;; for the main-stream generation.

;; I note that "exhaustive" isn't really possible, since you can always add another stage, or another filter.

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

;; So this is an exploration of a space, which tests as it goes, more than a generator of queries for freestanding
;; tests.


;; Second draft: lazy sequences powered by stateful, imperative generators.
;; - Trying to produce lazy sequences of possible next steps is fraught.
;;   - We can't tell a big family of nearly identical options apart, so interesting cases are drowned out.
;;   - Eg. in the set of all possible aggregations on a stage, the single `:count` is dwarfed by sum/avg/min/max on
;;     twenty columns each.
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
  (fn [step _query]
    (step-key step)))

(defmulti ^:private before-and-after
  "Runs the before/after tests for the given step, given the before and after queries."
  (fn [step _before _after]
    (step-key step)))

(defmulti ^:private next-steps*
  "Given a query, generate a nested set of choices, with the leaf nodes being possible steps."
  (fn [step-kind _query]
    step-kind))

(def ^:private step-kinds (atom {}))

(defn- add-step [{:keys [kind] :as step-def}]
  (swap! step-kinds assoc kind step-def))

;; Implementing some basic steps

;; Add an aggregation
;; TODO: Add a schema for the step `[vectors ...]`?
(add-step {:kind :aggregate})

;; TODO: columns should be specified with :ident, but that isn't available yet. For now, pMBQL refs will do.
(defmethod run-step* :aggregate [[_aggregate stage-number agg-clause] query]
  (lib/aggregate query stage-number agg-clause))

(defmethod before-and-after :aggregate [[_aggregate stage-number agg-clause] before after]
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

#_(defmacro ^{:private true, :style/indent [[1]]} with-choices [bindings & body]
  (when-not (even? (count bindings))
    (throw (ex-info "with-choices must have an even number of bindings" {:got (bount bindings)})))
  (let [choice-pairs (partition 2 bindings)]
    (reduce (fn [inner [label chooser]]
              `(let [~label ()])
              ))
    )
  )

(defn- choose
  "Uniformly chooses among a seq of options."
  [xs]
  (rand-nth xs))

(defn- choose-stage
  "Chooses a stage to operator on. 80% act on -1, 20% chooses a stage by index (which might be the last stage)."
  [query]
  (if (< (rand) 0.8)
    -1
    (rand-int (count (:stages query)))))

;; If exhaustion is a goal, we should think about making these into generators or otherwise capturing the choices.
(defmethod next-steps* :aggregate [_aggregate query]
  (let [stage-number (choose-stage query)
        operator     (choose (lib/available-aggregation-operators query stage-number))
        agg          (if (:requires-column? operator)
                       (lib/aggregation-clause operator (choose (:columns operator)))
                       (lib/aggregation-clause operator))]
    [:aggregate stage-number agg]))

;; Helpers
(defn- run-step
  "Applies a step, returning the updated context."
  [step {:keys [query] :as ctx}]
  {:query    (run-step* step query)
   :step     step
   :previous ctx})

;; NOTE: The public surface consumes and returns contexts, which contain queries among other things.
;; The contexts are intended to be opaque, and useful for eg. diagnosing and reproducing failures.
(defn test-step
  "Applies a step and runs its before/after tests with [[before-and-after]].

  If those tests pass, returns the updated context, included the altered query.
  The tests will `throw` if they fail, so this does not return in that case."
  [step {before :query :as ctx}]
  (let [{after :query :as ctx'} (run-step step ctx)]
    ;; Run the before/after tests. Throws if the tests fail.
    (try
      (before-and-after step before after)
      ctx'

      (catch #?(:clj Throwable :cljs js/Error) e
        (throw (ex-info "Error in before/after testing" (-> ctx
                                                            (dissoc :query)
                                                            (assoc :before before, :after after, :step step))
                        e))))))

#_(defn- multiplex
  "Given a list of lazy sequences, returns an interleaved sequence of their elements.

  The order is driven by `reorder-fn`, which defaults to `identity` but can be set to `shuffle`. Note that this applies
  to the outer list of seqs, not to each seq internally.

  Inner seqs are dropped as they run out of elements, but the multiplexed sequence will contain everything from the
  input seqs."
  ([seqs] (multiplex identity seqs))
  ([reorder-fn seqs]
   (if (empty? seqs)
     nil
     (let [reordered (reorder-fn seqs)]
       (lazy-cat (map first reordered) (multiplex reorder-fn (keep next reordered)))))))

(def ^:dynamic *pop-probability*
  "A configurable parameter, controlling the \"complexity\" of the generated queries.

  A probability value in the interval [0, 1). Higher means queries will stay simpler, lower means they will be deeper."
  0.48)

(defn- gen-step
  "Given a query, choose the next step, apply it and [[co/yield]] the new context.

  Makes a weighted choice between:
  - 20% pop to a previous query, choosing a different branch.
    - That previous query has already been yielded, so recurse to choose another thing to do next.
  - 80% choose among the step-keys uniformly, choose a step in detail with `next-steps*`, and take that step."
  [{:keys [previous query] :as ctx}]
  (if (and previous
           (< (rand) *pop-probability*))
    ;; Pop to a previous query and recursively choose an actual step.
    (recur previous)
    ;; 80%: Uniformly choose a step-key from those registered, generate that step, and yield it.
    ;; If that step is not possible on this query, recurse to roll again.
    (let [step-kind (rand-nth (keys @step-kinds))]
      (if-let [step (next-steps* step-kind query)]
        (test-step step ctx)
        (recur ctx)))))

(defn- random-queries-from*
  "Returns a lazy sequence of queries powered by the generators."
  [ctx limit]
  (co/generator
    (loop [ctx ctx
           i   0]
      (when (< i limit)
        (let [ctx' (gen-step ctx)]
          (co/yield ctx')
          (recur ctx' (inc i)))))))

(defn- context-for [query0]
  {:query    query0
   :previous nil
   :step     nil})

(defn random-queries-from
  "Given a starter query, generate a lazy sequence of random-walk queries over it.

  This sequence is infinite! Be kind to your REPL."
  ([starting-query]
   (random-queries-from 10 starting-query))
  ([limit starting-query]
   ;; Change this to a map?
   (for [{:keys [query] :as ctx} (random-queries-from* (context-for starting-query) limit)]
     (vary-meta query assoc ::context (dissoc ctx :query)))))

#_(comment
  (deref step-kinds)
  (let [base  (lib/query meta/metadata-provider (meta/table-metadata :orders))
        ctx   (context-for base)
        steps (next-steps shuffle ctx)]
    (count steps))
  (def qs (->> (lib/query meta/metadata-provider (meta/table-metadata :orders))
               random-queries-from
               (take 5)))

  (map (comp ::steps meta) qs))

#_(defn- random-skip
  [skipper xs]
  (if (number? skipper)
    (random-skip #(drop (rand-int skipper) %) xs)
    (when-let [skipped (seq (skipper xs))]
      (lazy-seq (cons (first skipped) (random-skip skipper (next skipped)))))))

;; NOTE: I'm thinking about a zipper based way of navigating these randomized spaces, since just multiplexing is
;; clumsy. We don't want to return 122 queries all aggregated slightly differently before reaching one that aggregates
;; after filtering. I think if we treat the space of possible wanderings as a zipper, and navigate it randomly, that
;; gives us a lot of flexibility.
;; But this foundation shows the approach for now, and it does work.

;; Unit tests
#_(deftest ^:parallel multiplex-test
  (let [xs (range 10)
        ys [:a :b :c :d :e :f]
        zs [true false nil "asdf"]
        combo (concat xs ys zs)]
    (testing "fixed order"
      (let [expected [0 :a true
                      1 :b false
                      2 :c nil
                      3 :d "asdf"
                      4 :e
                      5 :f
                      6 7 8 9]]
        (is (= expected (multiplex [xs ys zs])))
        (is (= expected (multiplex identity [xs ys zs])))))
    (testing "shuffled"
      (dotimes [_ 20]
        (let [result (multiplex shuffle [xs ys zs])]
          (is (= (count combo)
                 (count result)))
          (is (= (set combo)
                 (set result)))
          (is (empty? (remove #{1} (vals (frequencies result))))))))))

(defn step-seq
  "Returns the sequence of steps that brought about this query."
  [query]
  (->> query
       meta
       ::context
       (iterate :previous)
       (take-while some?)
       reverse
       next
       (map :step)))

(comment
  ;; Produces a map from {*pop-probability* {depth count}} to help judge the appropriate *pop-probability* values.
  ;; The results suggest a huge inflection around 0.5, which isn't too surprising.
  ;; We should consider these schemes:
  ;; - Make it a function of the current depth, some declining curve that allows occasional super-deep queries; OR
  ;; - A dynamic parameter - the more iterations we request from the generator, the lower/flatter the
  ;;   *pop-probability* goes.
  ;; - Lower *pop-probability* but a small chance to "abort" right back to the OG query and start over.

  ;; Anyway, this is an easy thing to make pluggable with some presets.

  ;; For now, a constant 0.48 is a solid mix of deep complexity but mostly straightforward.
  (into (sorted-map)
        (for [prob (range 0.05 1 0.05)]
          (binding [*pop-probability* prob]
            [prob (->> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                       (random-queries-from 100)
                       (map (comp count step-seq))
                       frequencies
                       (into (sorted-map))
                       )])))
  )

(deftest ^:parallel query-generator-test
  (doseq [q (->> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                 (random-queries-from 100))]
    (is (= (->> (lib/stage-count q)
                range
                (map (comp count #(lib/aggregations q %)))
                (reduce +))
           (->> (step-seq q)
                (filter (comp #{:aggregate} first))
                count)))))
