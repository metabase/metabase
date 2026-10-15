(ns metabase-enterprise.library-branching.mutation.core-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.mutation.fixtures :as fixtures])
  (:import
   (clojure.lang ExceptionInfo Var)))

(set! *warn-on-reflection* true)

;;; The tests that the mutations of these tests run.

(deftest clamp-test
  (is (= 1 (fixtures/clamp 1 5 0)))
  (is (= 5 (fixtures/clamp 1 5 9)))
  (is (= 3 (fixtures/clamp 1 5 3))))

(deftest area-test
  (is (= 9 (fixtures/area {:shape :square :side 3})))
  (is (= 6 (fixtures/area {:shape :rectangle :width 2 :height 3}))))

(defn- anonymous-test-var!
  "A test var that is in no namespace's interns, so that no test runner finds it."
  [test-name f]
  (doto (Var/create)
    (reset-meta! {:ns   (the-ns 'metabase-enterprise.library-branching.mutation.core-test)
                  :name test-name
                  :test f})))

(defn- root [v]
  (.getRawRoot ^Var v))

;;; Edits

(def ^:private source
  "(defn f [a b]\n  (check! a)\n  (when (pos? a)\n    (+ a b))\n  (+ a b))")

(defn- edit [edits]
  (read-string (mut/apply-edits 'metabase-enterprise.library-branching.mutation.fixtures source edits)))

(deftest apply-edits-test
  (testing ":replace replaces the one form that equals the pattern"
    (is (= '(defn f [a b] (check! a) (when (neg? a) (+ a b)) (+ a b))
           (edit [[:replace '(pos? a) '(neg? a)]]))))
  (testing ":negate wraps the form in `not`"
    (is (= '(defn f [a b] (check! a) (when (clojure.core/not (pos? a)) (+ a b)) (+ a b))
           (edit [[:negate '(pos? a)]]))))
  (testing ":remove removes the form from its parent"
    (is (= '(defn f [a b] (when (pos? a) (+ a b)) (+ a b))
           (edit [[:remove '(check! a)]]))))
  (testing ":nth chooses one of several equal forms, in depth-first order"
    (is (= '(defn f [a b] (check! a) (when (pos? a) (+ a b)) 0)
           (edit [[:replace '(+ a b) 0 {:nth 1}]]))))
  (testing "edits apply in order, each to the result of the one before"
    (is (= '(defn f [a b] (when (pos? a) (- a b)) (+ a b))
           (edit [[:remove '(check! a)] [:replace '(+ a b) '(- a b) {:nth 0}]]))))
  (testing "a pattern that matches no form is an error, so a mutation cannot go stale in silence"
    (is (thrown-with-msg? ExceptionInfo #"matches no form"
                          (edit [[:replace '(pos? b) true]]))))
  (testing "a pattern that matches more than one form needs :nth"
    (is (thrown-with-msg? ExceptionInfo #"matches 2 forms"
                          (edit [[:replace '(+ a b) 0]]))))
  (testing "auto-resolved keywords match their full names"
    (is (= '(defn tagged [x] {::other x})
           (read-string (mut/apply-edits 'metabase-enterprise.library-branching.mutation.fixtures
                                         "(defn tagged [x] {::tag x})"
                                         [[:replace ::fixtures/tag ::other]]))))))

;;; Runs

(def ^:private clamp-mutations
  [{:name   :no-upper-bound
    :doc    "clamp ignores the upper bound."
    :target `fixtures/clamp
    :edits  [[:replace '(min hi x) 'x]]}
   {:name   :bounds-swapped
    :doc    "clamp applies the bounds in the other order, which is the same function when lo <= hi."
    :target `fixtures/clamp
    :edits  [[:replace '(max lo (min hi x)) '(min hi (max lo x))]]
    :expect :survived}
   {:name   :other-tests
    :doc    "A mutation can name its own tests; the area tests do not call clamp."
    :target `fixtures/clamp
    :edits  [[:replace '(min hi x) 'x]]
    :tests  [#'area-test]
    :expect :survived}])

(deftest run-mutations-test
  (let [root-before (root #'fixtures/clamp)
        meta-before (meta #'fixtures/clamp)
        results     (mut/run-mutations clamp-mutations {:tests [#'clamp-test]})]
    (is (= [{:name :no-upper-bound :expect :killed :result :killed :killed-by [`clamp-test]}
            {:name :bounds-swapped :expect :survived :result :survived}
            {:name :other-tests :expect :survived :result :survived}]
           (map #(select-keys % [:name :expect :result :killed-by]) results)))
    (testing "the run restores the root and the metadata of the target var"
      (is (identical? root-before (root #'fixtures/clamp)))
      (is (= meta-before (meta #'fixtures/clamp))))
    (testing "a killed result has the failure that killed it"
      (is (= :fail (get-in (first results) [:failure :type]))))))

(deftest method-target-test
  (let [method-before (get (methods fixtures/area) :square)
        [result]      (mut/run-mutations [{:name   :square-plus
                                           :doc    "The area of a square adds its sides."
                                           :target [:method `fixtures/area :square]
                                           :edits  [[:replace '(* side side) '(+ side side)]]}]
                                         {:tests [#'area-test]})]
    (is (= :killed (:result result)))
    (testing "the run restores the method"
      (is (identical? method-before (get (methods fixtures/area) :square))))))

(deftest invalid-mutation-test
  (let [root-before (root #'fixtures/clamp)
        results     (mut/run-mutations [{:name   :stale
                                         :doc    "The pattern is not in the source."
                                         :target `fixtures/clamp
                                         :edits  [[:replace '(min lo x) 'x]]}
                                        {:name   :does-not-compile
                                         :doc    "The mutated form does not compile."
                                         :target `fixtures/clamp
                                         :edits  [[:replace '(min hi x) '(no-such-function x)]]}]
                                       {:tests [#'clamp-test]})]
    (is (= [:invalid :invalid] (map :result results)))
    (is (re-find #"matches no form" (:reason (first results))))
    (testing "the reason of a stale edit names the target and the file of its source"
      (is (re-find #"Target metabase-enterprise\.library-branching\.mutation\.fixtures/clamp, source form at \S*mutation/fixtures\.clj:\d+"
                   (:reason (first results)))))
    (is (re-find #"no-such-function" (:reason (second results))))
    (is (identical? root-before (root #'fixtures/clamp)))))

(deftest timeout-test
  (testing "tests that do not end within the timeout give :timeout, and the run goes on"
    (let [results (mut/run-mutations [{:name   :blocks
                                       :doc    "clamp blocks until its thread is interrupted."
                                       :target `fixtures/clamp
                                       :edits  [[:replace '(min hi x) '(deref (promise))]]}
                                      {:name   :no-upper-bound
                                       :doc    "clamp ignores the upper bound."
                                       :target `fixtures/clamp
                                       :edits  [[:replace '(min hi x) 'x]]}]
                                     {:tests [#'clamp-test] :timeout-ms 100})]
      (is (= [:timeout :killed] (map :result results))))))

(defn- fixture-threads
  "The live threads, but this one, with a frame of a fixture function."
  []
  (into #{}
        (keep (fn [[^Thread thread frames]]
                (when (and (.isAlive thread)
                           (not= thread (Thread/currentThread))
                           (some #(str/starts-with? (.getClassName ^StackTraceElement %)
                                                    "metabase_enterprise.library_branching.mutation.fixtures$")
                                 frames))
                  thread)))
        (Thread/getAllStackTraces)))

(def ^:private redefs-test
  "A test that redefines a var, then counts down and clamps inside the redefinition."
  (anonymous-test-var! 'redefs-test
                       (fn []
                         (with-redefs [fixtures/tagged (constantly ::redefined)]
                           (is (= :done (fixtures/count-down 3)))
                           (is (= 5 (fixtures/clamp 1 5 9)))))))

(deftest timeout-stops-test
  (testing "a mutation that makes a loop endless times out, and the run stops the loop before it returns"
    (let [threads-before (fixture-threads)
          roots-before   (mapv root [#'fixtures/tagged #'fixtures/step #'fixtures/count-down #'fixtures/clamp])
          results        (mut/run-mutations [{:name   :endless-in-target
                                              :doc    "clamp loops forever and calls no var."
                                              :target `fixtures/clamp
                                              :edits  [[:replace '(min hi x) '(loop [n 0] (recur (inc n)))]]}
                                             {:name   :endless-in-caller
                                              :doc    "step returns its argument, so the loop of count-down never ends."
                                              :target `fixtures/step
                                              :edits  [[:replace '(dec n) 'n]]}]
                                            {:tests [redefs-test] :timeout-ms 200})]
      (is (= [:timeout :timeout] (map :result results)))
      (is (= [nil nil] (map :leaked results)))
      (testing "no thread of the run still runs"
        (is (= threads-before (fixture-threads))))
      (testing "the redefinitions of the tests and the wrappers of the stop are gone"
        (is (every? true? (map identical?
                               roots-before
                               (map root [#'fixtures/tagged #'fixtures/step #'fixtures/count-down #'fixtures/clamp]))))))))

(deftest leaked-thread-test
  (testing "a loop that the run cannot stop gives :timeout with the thread that still runs, and the result fails"
    (reset! fixtures/released false)
    (let [threads-before (fixture-threads)
          results        (mut/run-mutations [{:name   :spins
                                              :doc    "clamp waits in a loop that calls no var."
                                              :target `fixtures/clamp
                                              :edits  [[:replace '(min hi x) '(spin)]]}]
                                            {:tests [#'clamp-test] :timeout-ms 100})
          leaked         (set/difference (fixture-threads) threads-before)]
      (reset! fixtures/released true)
      (run! #(.join ^Thread %) leaked)
      (is (= [:timeout] (map :result results)))
      (is (re-find #"fixtures\$spin" (str (:leaked (first results)))))
      (is (= 1 (count leaked)))
      (is (= threads-before (fixture-threads))))))

(deftest baseline-test
  (testing "tests that fail with no mutation make the run throw, because no result would mean anything"
    (let [always-fails (anonymous-test-var! 'always-fails (fn [] (is (= 1 2))))]
      (is (thrown-with-msg? ExceptionInfo #"fail with no mutation"
                            (mut/run-mutations clamp-mutations {:tests [always-fails]}))))))

(deftest baseline-once-per-test-test
  (testing "a test that the lists of several mutations name runs once with no mutation"
    (let [runs    (atom 0)
          counted (anonymous-test-var! 'counted (fn []
                                                  (swap! runs inc)
                                                  (is (= 5 (fixtures/clamp 1 5 9)))))
          results (mut/run-mutations [{:name   :alone
                                       :doc    "clamp ignores the upper bound."
                                       :target `fixtures/clamp
                                       :edits  [[:replace '(min hi x) 'x]]
                                       :tests  [counted]}
                                      {:name   :with-area
                                       :doc    "clamp ignores the upper bound."
                                       :target `fixtures/clamp
                                       :edits  [[:replace '(min hi x) 'x]]
                                       :tests  [#'area-test counted]}])]
      (is (= [:killed :killed] (map :result results)))
      (testing "one run with no mutation, then one run for each mutation"
        (is (= 3 @runs))))))

(deftest declaration-test
  (testing "a declaration that does not fit the schema makes the run throw"
    (is (thrown-with-msg? ExceptionInfo #"Invalid mutation"
                          (mut/run-mutations [{:name "no-upper-bound" :target `fixtures/clamp :edits []}]
                                             {:tests [#'clamp-test]}))))
  (testing "every mutation needs tests, from the options or its own declaration"
    (is (thrown-with-msg? ExceptionInfo #"no tests"
                          (mut/run-mutations (take 1 clamp-mutations) {})))))

(deftest nested-run-test
  (testing "a run inside a run returns nil, so a mutation test among the tests that it runs does not recurse"
    (let [inner      (atom ::not-run)
          runs-inner (anonymous-test-var! 'runs-inner
                                          (fn []
                                            (reset! inner (mut/run-mutations clamp-mutations {:tests [#'clamp-test]}))))]
      (mut/run-mutations (take 1 clamp-mutations) {:tests [#'clamp-test runs-inner]})
      (is (nil? @inner)))))

(deftest preview-test
  (is (= '(defn clamp "`x`, bounded below by `lo` and above by `hi`." [lo hi x] (max lo x))
         (read-string (:mutated (mut/preview (first clamp-mutations)))))))

(deftest is-expected-test
  (let [events (atom [])]
    (binding [report (fn [m] (swap! events conj (:type m)))]
      (mut/is-expected [{:name :a :doc "" :expect :killed :result :killed}
                        {:name :b :doc "" :expect :killed :result :timeout}
                        {:name :c :doc "" :expect :killed :result :survived}
                        {:name :d :doc "" :expect :survived :result :survived}
                        {:name :e :doc "" :expect :survived :result :killed}
                        {:name :f :doc "" :expect :killed :result :invalid :reason "stale"}
                        {:name :g :doc "" :expect :killed :result :timeout :leaked "thread at frame"}]))
    (is (= [:pass :pass :fail :pass :fail :fail :fail] @events))))

(deftest report-test
  (let [text (mut/report [{:name :a :doc "Doc a." :target `fixtures/clamp :expect :killed :result :killed
                           :killed-by [`clamp-test]}
                          {:name :b :doc "Doc b." :target [:method `fixtures/area :square] :expect :killed
                           :result :invalid :reason "stale"}])]
    (is (str/includes? text "| :a | metabase-enterprise.library-branching.mutation.fixtures/clamp | killed | killed | metabase-enterprise.library-branching.mutation.core-test/clamp-test |"))
    (is (str/includes? text "| :b | metabase-enterprise.library-branching.mutation.fixtures/area :square | killed | invalid | stale |"))
    (is (str/includes? text "- :a: Doc a."))))
