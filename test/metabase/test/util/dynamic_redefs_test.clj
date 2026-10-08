(ns metabase.test.util.dynamic-redefs-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [potemkin :as p]
   [potemkin.namespaces :as p.namespaces])
  (:import
   (clojure.lang Var)
   (java.util.concurrent Callable CyclicBarrier Executors Future TimeUnit)))

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

(defn- delegated [x] [:original x])

(deftest ^:parallel replacement-delegates-to-original-test
  (testing "a replacement reaches the original through `dynamic-value` of the function"
    (mt/with-dynamic-fn-redefs [delegated (fn [x] [:wrapped ((mt/dynamic-value delegated) x)])]
      (is (= [:wrapped [:original 1]] (delegated 1)))))
  (testing "and through `original-fn` of the var"
    (mt/with-dynamic-fn-redefs [delegated (fn [x] [:wrapped ((mt/original-fn #'delegated) x)])]
      (is (= [:wrapped [:original 1]] (delegated 1)))))
  (testing "given the var, `dynamic-value` is the replacement in scope"
    (let [replacement (fn [x] [:replaced x])]
      (mt/with-dynamic-fn-redefs [delegated replacement]
        (is (identical? replacement (mt/dynamic-value #'delegated)))))))

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

(defn- on-raw-thread
  "Call `f` on a thread that inherits no bindings. Returns its result, or throws what it threw."
  [f]
  (let [outcome (promise)]
    (.start (Thread. ^Runnable (fn []
                                 (deliver outcome (try
                                                    [:returned (f)]
                                                    (catch Throwable t
                                                      [:threw t]))))))
    (let [[status value] (deref outcome 30000 [:threw (ex-info "The raw thread did not finish" {})])]
      (if (= status :returned)
        value
        (throw value)))))

(defn- conveyed [] :original)

(deftest ^:parallel binding-conveyance-test
  (mt/with-dynamic-fn-redefs [conveyed (constantly :replaced)]
    (testing "a future inherits the redef"
      (is (= :replaced @(future (conveyed)))))
    (testing "a raw thread does not"
      (is (= :original (on-raw-thread conveyed))))))

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

;;; each test of a re-export gets its own source: whether a var has been proxied before is part of what they check.

(defn- source-1 [] :original)
(p/import-fn source-1 reexport-1)

(deftest ^:parallel reexport-follows-its-source-test
  (testing "a re-export with no replacement of its own calls what its source calls"
    (mt/with-dynamic-fn-redefs [source-1 (constantly :source)]
      (is (= [:source :source] [(source-1) (reexport-1)]))))
  (testing "a replacement for the re-export only reaches calls through the re-export"
    (mt/with-dynamic-fn-redefs [reexport-1 (constantly :reexport)]
      (is (= [:original :reexport] [(source-1) (reexport-1)]))))
  (testing "and the re-export follows its source again afterwards"
    (mt/with-dynamic-fn-redefs [source-1 (constantly :source)]
      (is (= [:source :source] [(source-1) (reexport-1)])))
    (is (= [:original :original] [(source-1) (reexport-1)]))))

(defn- source-2 [] :original)
(p/import-fn source-2 reexport-2)

(deftest ^:parallel reexport-redef-survives-first-redef-of-source-test
  (mt/with-dynamic-fn-redefs [reexport-2 (constantly :reexport)]
    (testing "the first dynamic redef of the source, nested inside"
      (mt/with-dynamic-fn-redefs [source-2 (constantly :source)]
        (is (= [:source :reexport] [(source-2) (reexport-2)])))
      (is (= [:original :reexport] [(source-2) (reexport-2)])))))

(defn- source-3 [] :original)
(p/import-fn source-3 reexport-3)

(deftest ^:parallel reexport-redef-survives-source-redef-on-another-thread-test
  (mt/with-dynamic-fn-redefs [reexport-3 (constantly :reexport)]
    (is (= :source (on-raw-thread #(mt/with-dynamic-fn-redefs [source-3 (constantly :source)] (source-3)))))
    (is (= [:original :reexport] [(source-3) (reexport-3)]))))

(defn- source-4 [] :original)
(p/import-fn source-4 reexport-4)

;; Not ^:parallel: `with-redefs` replaces the var's root for every thread.
(deftest ^:synchronized reexport-redef-survives-with-redefs-of-source-test
  (mt/with-dynamic-fn-redefs [reexport-4 (constantly :reexport)]
    ;; The global root swap is the case under test.
    #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
    (with-redefs [source-4 (constantly :stub)]
      (is (= [:stub :reexport] [(source-4) (reexport-4)])))
    (is (= [:original :reexport] [(source-4) (reexport-4)])))
  (testing "with no replacement of its own, the re-export sees a `with-redefs` of its source"
    #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
    (with-redefs [source-4 (constantly :stub)]
      (is (= [:stub :stub] [(source-4) (reexport-4)])))
    (is (= [:original :original] [(source-4) (reexport-4)]))))

(defn- source-5 [] :original)
(p/import-fn source-5 reexport-5)

(deftest ^:parallel original-fn-of-reexport-test
  (let [unpatched (mt/original-fn #'source-5)]
    (testing "the `original-fn` of a re-export is its source's original, whether or not the re-export has been proxied"
      (let [before-proxying (mt/original-fn #'reexport-5)]
        (mt/with-dynamic-fn-redefs [reexport-5 (constantly :reexport)]
          (is (= :reexport (reexport-5))))
        (is (= [unpatched unpatched] [before-proxying (mt/original-fn #'reexport-5)]))))
    (testing "a replacement that delegates through it reaches the unpatched function while the source is redefined"
      (mt/with-dynamic-fn-redefs [reexport-5 (fn [] [:wrapped ((mt/original-fn #'reexport-5))])
                                  source-5 (constantly :source)]
        (is (= [:source [:wrapped :original]] [(source-5) (reexport-5)]))))
    (testing "and so does one that delegates through `dynamic-value` of the function"
      (mt/with-dynamic-fn-redefs [reexport-5 (fn [] [:wrapped ((mt/dynamic-value reexport-5))])
                                  source-5 (constantly :source)]
        (is (= [:source [:wrapped :original]] [(source-5) (reexport-5)]))))))

(defn- fresh-reexport-pair!
  "Intern a function and a re-export of it, linked the way `p/import-fn` links them. Returns `[source reexport]`."
  []
  (let [here   (the-ns 'metabase.test.util.dynamic-redefs-test)
        source (intern here (gensym "raced-source-") (fn [] :original))
        reexport (intern here (gensym "raced-reexport-") @source)]
    (alter-meta! reexport merge (dissoc (meta source) :name))
    (p.namespaces/link-vars source reexport)
    [source reexport]))

(defn- call-redefined!
  "Call `a-var` with `replacement` in scope, as `with-dynamic-fn-redefs` would for a var named in source."
  [^Var a-var replacement]
  (dynamic-redefs/patch-vars! [a-var])
  (binding [dynamic-redefs/*local-redefs* (dynamic-redefs/local-redefs {a-var replacement})]
    (a-var)))

(deftest first-redef-of-reexport-and-source-race-test
  (testing "a re-export and its source, each first redefined at the same moment on its own thread"
    (let [pairs 50
          pool  (Executors/newFixedThreadPool 2)
          race  (fn []
                  (let [[source reexport] (fresh-reexport-pair!)
                        barrier         (CyclicBarrier. 2)
                        redef           (fn [a-var value]
                                          (.submit pool ^Callable (fn []
                                                                    (.await barrier)
                                                                    (call-redefined! a-var (constantly value)))))
                        tasks           [(redef reexport :reexport) (redef source :source)]]
                    ;; A timeout here is a deadlock between the two threads.
                    {:during       (mapv #(.get ^Future % 30 TimeUnit/SECONDS) tasks)
                     :reexport-redef [(call-redefined! reexport (constantly :reexport)) (source)]
                     :source-redef (binding [dynamic-redefs/*local-redefs* (dynamic-redefs/local-redefs
                                                                            {source (constantly :source)})]
                                     [(reexport) (source)])}))]
      (try
        (is (= {{:during       [:reexport :source]
                 :reexport-redef [:reexport :original]
                 :source-redef [:source :source]}
                pairs}
               (frequencies (repeatedly pairs race))))
        (finally
          (.shutdown pool))))))

;;; Model test: generated programs nest dynamic redefs, `with-redefs`, futures and exceptions around calls to three
;;; vars, one of them a re-export of another.
;;; The model is one rule: a call sees the innermost enclosing redef of its var, of either kind, else the original.
;;; A re-export with no redef of its own sees what its source sees.

(defn- model-a [& args] [:original (count args)])

(defn- model-b [& args] [:original (count args)])

(p/import-fn model-a model-a-reexport)

(def ^:private gen-program
  (let [gen-var (gen/elements [:a :b :a-reexport])]
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
      :call   (swap! seen conj (apply (case v :a model-a, :b model-b, :a-reexport model-a-reexport) (range (:nargs o))))
      :future @(future (run-program! seen id body))
      (let [f     (stub (swap! id inc))
            body! (fn []
                    (run-program! seen id body)
                    (when throws?
                      (throw (ex-info "leave the redef by exception" {::expected true}))))]
        (try
          (case [op v]
            [:dynamic :a]        (mt/with-dynamic-fn-redefs [model-a f] (body!))
            [:dynamic :b]        (mt/with-dynamic-fn-redefs [model-b f] (body!))
            [:dynamic :a-reexport] (mt/with-dynamic-fn-redefs [model-a-reexport f] (body!))
            [:plain :a]          (with-redefs-fn {#'model-a f} body!)
            [:plain :b]          (with-redefs-fn {#'model-b f} body!)
            [:plain :a-reexport]   (with-redefs-fn {#'model-a-reexport f} body!))
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
           :call   (swap! seen conj [(or (env v) (when (= v :a-reexport) (env :a)) :original) (:nargs o)])
           :future (walk env body)
           (walk (assoc env v (swap! id inc)) body))))
     {} ops)
    @seen))

;; Not ^:parallel: the generated programs use `with-redefs`, which replaces a var's root for every thread.
(defspec ^:synchronized innermost-redef-wins-model-test 300
  (prop/for-all [ops (gen/vector gen-program 1 6)]
    (let [seen (atom [])]
      ;; Until a re-export is first proxied, potemkin copies each new root of its source over it, a `with-redefs` stub
      ;; of the re-export included. The rule only holds from then on, so proxy it before the program runs.
      (mt/with-dynamic-fn-redefs [model-a-reexport identity] nil)
      (run-program! seen (atom 0) ops)
      (and (= (model ops) @seen)
           ;; Nothing leaks out of a program: every var is back to its original.
           (= [:original 0] (model-a) (model-b) (model-a-reexport))))))
