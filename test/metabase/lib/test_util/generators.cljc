(ns metabase.lib.test-util.generators
  (:require
   [clojure.test :refer [deftest is testing]]
   #_[clojure.test.check.generators :as gen]
   #_[malli.generator :as mg]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

;; ;; These query functions are functions so that changes to metabase.lib code will be picked up without having to reload
;; ;; this file.
;; (defn- basic-queries [metadata-provider]
;;   (gen/elements [(lib/query metadata-provider (meta/table-metadata :orders))]))
;;
;; (defn- tag-as [tags xs]
;;   (for [x xs]
;;     (reduce #(vary-meta %1 assoc %2 true) x tags)))
;;
;; (defn- native-queries [metadata-provider]
;;   (gen/elements [(lib/native-query metadata-provider "SELECT * FROM Orders;")]))
;;
;; (defn queries-for
;;   "Creates a `test.check`-compatible generator for a broad set of queries against the given `metadata-provider`.
;;
;;   For the default [[meta/metadata-provider]], prefer [[query]]."
;;   [metadata-provider]
;;   (gen/one-of [(basic-queries metadata-provider)
;;                (native-queries metadata-provider)]))
;;
;; (def query
;;   "Returns a `test.check` compatible generator for general MBQL queries against the default [[meta/metadata-provider]].
;;
;;   (Currently it's not really a generator, just an `:enum` of handwritten sample queries.)"
;;   (queries-for meta/metadata-provider))
;;
;; (defn with-visible-columns
;;   "Given a generator for queries, wraps it to return `[query visible-columns]` pairs.
;;
;;   (Uses the last stage of the query.)"
;;   [query-gen]
;;   (gen/fmap #(vector [% (lib/visible-columns %)])
;;             query-gen))
;;
;; (def query+visible-columns
;;   "Everything from [[query]] paired with its [[lib/visible-columns]].
;;
;;   To select a random column, see [[query+visible-column]]."
;;   (with-visible-columns query))
;;
;; (defn pick-column
;;   "Given a generator for `[query columns]` pairs, returns a generator for `[query column]` pairs, choosing a random
;;   column from the list."
;;   [query-cols-gen]
;;   (gen/bind query-cols-gen
;;             (fn [[q cols]]
;;               (gen/fmap #(vector q %) (gen/elements cols)))))
;;
;; (def query+visible-column
;;   "Everything from [[query]] paired with a randomly selected [[lib/visible-columns]].
;;
;;   To get the entire list of columns, see [[query+visible-columns]]."
;;   (pick-column query+visible-columns))



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


;; First cut at defining a form for steps:
;; - A step is represented as a vector, a kind of reified function call: `[:step-label args...]`
;;   - Steps are constructed using functions, though, which (1) helps abstract them if they change a bit and (2)
;;     makes it easy for the FE to create Clojure data structures.
;;   - The query is deliberately *not* included in the args; it's understood and makes the steps much smaller.
;; - Applying a step is done with `(run-step step query)`
;; - Before/after testing is accomplished with `(test-step step query)`
;;   - That is powered by `(before-and-after step before after)`, a multimethod.
;; - A lazy sequence of next steps is generated with `(next-steps query)`.
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
  "Given a query, generate a lazy sequence of possible steps to take. Nil or empty if this step is not applicable
  to the input query."
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

(defn- stage-seq [query]
  (-> query
      :stages
      count
      dec
      (range -1 -1)))

(defmethod next-steps* :aggregate [_aggregate query]
  (for [stage-number (stage-seq query)
        operator     (lib/available-aggregation-operators query stage-number)
        agg          (if (:requires-column? operator)
                       (map #(lib/aggregation-clause operator %) (:columns operator))
                       [(lib/aggregation-clause operator)])]
    [:aggregate stage-number agg]))

;; Helpers
(defn- step-taken [ctx step]
  (update ctx :steps conj step))

(defn- context-for [query0]
  {:query  query0
   :origin query0
   :steps  []})

(defn run-step
  "Applies a step, returning the updated context."
  [step ctx]
  (-> ctx
      (update :query #(run-step* step %))
      (step-taken step)))

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
      (catch #?(:clj Throwable :cljs js/Error) e
        (throw (ex-info "Error in before/after testing" (-> ctx
                                                            (dissoc :query)
                                                            (assoc :before before, :after after, :step step))
                        e))))
    ;; If the tests have passed, we return the updated context.
    ctx'))

(defn- multiplex
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

(defn- next-steps [reorder-fn {:keys [query]}]
  (->> @step-kinds
       keys
       (map #(next-steps* % query))
       (multiplex reorder-fn)))

(defn- random-queries-from*
  [ctx]
  (->> (next-steps shuffle ctx)   ; Steps
       (map #(test-step % ctx))   ; Applied steps
       (map random-queries-from*) ; One lazy future walk for each next step!
       (multiplex shuffle)        ; Single lazy sequence
       (cons ctx)                 ; Starting with this context
       lazy-seq))

(defn random-queries-from
  "Given a starter query, generate a lazy sequence of random-walk queries over it.

  This sequence is infinite! Be kind to your REPL."
  [starting-query]
  (for [{:keys [origin query steps]} (random-queries-from* (context-for starting-query))]
    (vary-meta query assoc ::origin-query origin ::steps steps)))

(comment
  (deref step-kinds)
  (let [base  (lib/query meta/metadata-provider (meta/table-metadata :orders))
        ctx   (context-for base)
        steps (next-steps shuffle ctx)]
    (count steps))
  (def qs (->> (lib/query meta/metadata-provider (meta/table-metadata :orders))
               random-queries-from
               (take 5)))

  (map (comp ::steps meta) qs))

(defn- random-skip
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
(deftest ^:parallel multiplex-test
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

(deftest ^:parallel query-generator-test
  (doseq [q (->> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                 random-queries-from
                 (random-skip 15)
                 (take 20))]
    (is (= (count (lib/aggregations q))
           (count (filter (comp #{:aggregate} first) (::steps (meta q))))))
    )
  )
