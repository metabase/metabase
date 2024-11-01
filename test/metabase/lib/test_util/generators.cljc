(ns metabase.lib.test-util.generators
  (:require
   #?@(:cljs (metabase.test-runner.assert-exprs.approximately-equal))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

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

(defn- choose
  "Uniformly chooses among a seq of options."
  [xs]
  (rand-nth xs))

(defn- choose-stage
  "Chooses a stage to operato on. 80% act on -1, 20% chooses a stage by index (which might be the last stage)."
  [query]
  (if (< (rand) 0.8)
    -1
    (rand-int (count (:stages query)))))

;; TODO: If exhaustion is a goal, we should think about making these into generators or otherwise reifying the choices.
(defmethod next-steps* :aggregate [query _aggregate]
  (let [stage-number (choose-stage query)
        operator     (choose (lib/available-aggregation-operators query stage-number))
        agg          (if (:requires-column? operator)
                       (lib/aggregation-clause operator (choose (:columns operator)))
                       (lib/aggregation-clause operator))]
    [:aggregate stage-number agg]))

;; Helpers
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
  (doseq [q (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
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
