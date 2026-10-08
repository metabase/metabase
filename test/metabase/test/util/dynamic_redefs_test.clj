(ns metabase.test.util.dynamic-redefs-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.test :as mt])
  (:import
   (java.util.concurrent Callable CyclicBarrier Executors Future)))

(set! *warn-on-reflection* true)

(defn- arities
  ([] [:original])
  ([a] [:original a])
  ([a b] [:original a b])
  ([a b c] [:original a b c])
  ([a b c d] [:original a b c d])
  ([a b c d & more] (into [:original a b c d] more)))

(defn- one-arg [x] x)

(defn- call-with-each-arity [f]
  [(f) (f 1) (f 1 2) (f 1 2 3) (f 1 2 3 4) (f 1 2 3 4 5 6) (apply f (range 30))])

(deftest ^:parallel proxied-var-calls-original-test
  (let [expected (call-with-each-arity arities)]
    (mt/with-dynamic-fn-redefs [arities (constantly :replaced)
                                one-arg (constantly :replaced)]
      (is (= :replaced (arities 1) (one-arg 1))))
    (testing "once the redef has exited, the proxied var behaves like the original at every arity"
      (is (= expected (call-with-each-arity arities))))
    (testing "a wrong arity is still the original's error"
      (is (thrown? clojure.lang.ArityException (apply one-arg [1 2]))))))

(deftest ^:parallel replacement-receives-arguments-test
  (testing "a replacement receives the arguments unchanged at every arity"
    (mt/with-dynamic-fn-redefs [arities (fn [& args] (into [:replaced] args))]
      (is (= [[:replaced] [:replaced 1] [:replaced 1 2] [:replaced 1 2 3] [:replaced 1 2 3 4]
              [:replaced 1 2 3 4 5 6] (into [:replaced] (range 30))]
             (call-with-each-arity arities)))))
  (testing "a replacement's own arity error reaches the caller"
    (mt/with-dynamic-fn-redefs [arities (fn [x] x)]
      (is (thrown? clojure.lang.ArityException (arities 1 2))))))

(defn- countdown [n]
  (if (pos? n) (countdown (dec n)) :done))

(defn- unrelated [] :unrelated)

(deftest ^:parallel recursion-without-replacement-test
  (mt/with-dynamic-fn-redefs [countdown (constantly :replaced)]
    (is (= :replaced (countdown 1))))
  (testing "the recursion check does not count the original's own recursion through its proxied var"
    (is (= :done (countdown 1000))))
  (testing "nor while a replacement is in scope for another var"
    (mt/with-dynamic-fn-redefs [unrelated (constantly :replaced)]
      (is (= :done (countdown 1000))))))

(defn- conveyed [] :original)

(deftest ^:parallel binding-conveyance-test
  (mt/with-dynamic-fn-redefs [conveyed (constantly :replaced)]
    (testing "a future inherits the redef"
      (is (= :replaced @(future (conveyed)))))
    (testing "a raw thread does not"
      (let [seen (promise)]
        (doto (Thread. ^Runnable (fn [] (deliver seen (conveyed))))
          .start
          .join)
        (is (= :original @seen))))))

(defn- throws [] (throw (ex-info "original" {})))

(defn- loops [] :original)

(deftest ^:parallel usable-after-exception-test
  (testing "after the original throws"
    (mt/with-dynamic-fn-redefs [throws (constantly :replaced)]
      (is (= :replaced (throws))))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"original" (throws)))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"original" (throws))))
  (testing "after a replacement throws"
    (mt/with-dynamic-fn-redefs [throws (fn [] (throw (IllegalStateException. "replacement")))]
      (is (thrown? IllegalStateException (throws)))
      (is (thrown? IllegalStateException (throws))))
    (mt/with-dynamic-fn-redefs [throws (constantly :replaced)]
      (is (= :replaced (throws)))))
  (testing "after the recursion check fires"
    (mt/with-dynamic-fn-redefs [loops (fn [] (loops))]
      (is (thrown? AssertionError (loops))))
    (mt/with-dynamic-fn-redefs [loops (constantly :replaced)]
      (is (= :replaced (loops))))
    (is (= :original (loops)))))

(defn- raced [] :original)

(deftest ^:parallel first-patch-race-test
  (testing "threads that make the first redef of a var at the same moment each see their own replacement"
    (let [n        32
          barrier  (CyclicBarrier. n)
          pool     (Executors/newFixedThreadPool n)
          original (mt/original-fn #'raced)]
      (try
        (let [tasks (mapv (fn [i]
                            (.submit pool ^Callable (fn []
                                                      (.await barrier)
                                                      (mt/with-dynamic-fn-redefs [raced (constantly i)]
                                                        (Thread/yield)
                                                        (raced)))))
                          (range n))]
          (is (= (range n) (map #(.get ^Future %) tasks))))
        (finally
          (.shutdown pool)))
      (is (= :original (raced)))
      (testing "and the var is proxied once: its original is still the function it started with"
        (is (identical? original (mt/original-fn #'raced)))))))

(defn- shadowed [] :original)

;; Not ^:parallel: `with-redefs` replaces the var's root for every thread.
(deftest ^:synchronized with-redefs-inside-dynamic-redef-test
  (mt/with-dynamic-fn-redefs [shadowed (constantly :outer)]
    ;; The global root swap is the case under test.
    #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
    (with-redefs [shadowed (constantly :stub)]
      (testing "a `with-redefs` stub inside a dynamic redef of the same var wins"
        (is (= :stub (shadowed))))
      (mt/with-dynamic-fn-redefs [shadowed (constantly :inner)]
        (is (= :inner (shadowed))))
      (testing "and still wins after a dynamic redef nested inside it exits"
        (is (= :stub (shadowed)))))
    (is (= :outer (shadowed))))
  (is (= :original (shadowed))))

;;; Model test: generated programs nest dynamic redefs, `with-redefs`, futures and exceptions around calls to two vars.
;;; The model is one rule: a call sees the innermost enclosing redef of its var, of either kind, else the original.

(defn- model-a [& args] [:original (count args)])

(defn- model-b [& args] [:original (count args)])

(def ^:private gen-program
  (let [gen-var (gen/elements [:a :b])]
    (gen/recursive-gen
     (fn [gen-op]
       (let [gen-body (gen/vector gen-op 0 4)]
         (gen/one-of
          [(gen/let [kind    (gen/elements [:dynamic :plain])
                     v       gen-var
                     throws? gen/boolean
                     body    gen-body]
             {:op      kind
              :var     v
              :throws? throws?
              :body    body})
           (gen/let [body gen-body]
             {:op :future, :body body})])))
     (gen/let [v gen-var
               n (gen/choose 0 5)]
       {:op :call, :var v, :nargs n}))))

(defn- stub [id]
  (fn [& args] [id (count args)]))

(defn- run-program!
  "Run `ops`, appending what each call returns to the `seen` atom.
  The `id` atom counts the redefs entered, which numbers the stubs the way [[model]] does."
  [seen id ops]
  (doseq [{:keys [op body throws?] v :var :as o} ops]
    (case op
      :call   (swap! seen conj (apply (case v :a model-a :b model-b) (range (:nargs o))))
      :future @(future (run-program! seen id body))
      (let [f     (stub (swap! id inc))
            body! (fn []
                    (run-program! seen id body)
                    (when throws?
                      (throw (ex-info "leave the redef by exception" {::expected true}))))]
        (try
          (case [op v]
            [:dynamic :a] (mt/with-dynamic-fn-redefs [model-a f] (body!))
            [:dynamic :b] (mt/with-dynamic-fn-redefs [model-b f] (body!))
            [:plain :a]   (with-redefs-fn {#'model-a f} body!)
            [:plain :b]   (with-redefs-fn {#'model-b f} body!))
          (catch clojure.lang.ExceptionInfo e
            (when-not (::expected (ex-data e))
              (throw e))))))))

(defn- model
  "What `run-program!` should see for `ops`."
  [ops]
  (let [id   (atom 0)
        seen (atom [])]
    ((fn walk [env ops]
       (doseq [{:keys [op body] v :var :as o} ops]
         (case op
           :call   (swap! seen conj [(get env v :original) (:nargs o)])
           :future (walk env body)
           (walk (assoc env v (swap! id inc)) body))))
     {} ops)
    @seen))

;; Not ^:parallel: the generated programs use `with-redefs`, which replaces a var's root for every thread.
(defspec ^:synchronized innermost-redef-wins-model-test 300
  (prop/for-all [ops (gen/vector gen-program 1 6)]
    (let [seen (atom [])]
      (run-program! seen (atom 0) ops)
      (and (= (model ops) @seen)
           ;; Nothing leaks out of a program: both vars are back to their originals.
           (= [:original 0] (model-a) (model-b))))))
