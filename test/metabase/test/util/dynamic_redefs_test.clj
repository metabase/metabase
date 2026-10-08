(ns metabase.test.util.dynamic-redefs-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.util.log :as log]
   [potemkin :as p]
   [potemkin.namespaces :as p.namespaces])
  (:import
   (clojure.lang Agent MultiFn Var)
   (java.util.concurrent Callable CountDownLatch CyclicBarrier Executors Future ThreadPoolExecutor TimeUnit)))

(set! *warn-on-reflection* true)

(defn- clump [x y] (str x y))

(deftest ^:parallel with-dynamic-fn-redefs-test
  (testing "Three threads can independently redefine a regular var"
    (let [n-threads  3
          ;; Note that .getId is deprecated in favor of .threadId, but that method is only introduced in Java 19
          thread-id  #(.getId (Thread/currentThread))
          latch      (CountDownLatch. (inc n-threads))
          take-latch #(do
                        (.countDown latch)
                        ;; We give a generous timeout here in case there is heavy contention for the thread pool in CI
                        (when-not (.await latch 30 TimeUnit/SECONDS)
                          (throw (ex-info "Timeout waiting on all threads to pull their latch"
                                          {:latch      latch
                                           :thread-id  (thread-id)
                                           :agent-pool (let [^ThreadPoolExecutor executor Agent/pooledExecutor]
                                                         {:active-count (.getActiveCount executor)
                                                          :pool-size    (.getPoolSize executor)
                                                          :task-count   (.getTaskCount executor)})}))))]
      (testing "The original definition"
        (is (= "original" (clump "o" "riginal"))))
      (future
        (testing "A thread that minds its own business"
          (log/debug "Starting no-op thread, thread-id:" (thread-id))
          (is (= "123" (clump 12 3)))
          (take-latch)
          (is (= "321" (clump 3 21)))))
      (future
        (testing "A thread that redefines it in reverse"
          (log/debug "Starting reverse thread, thread-id:" (thread-id))
          (mt/with-dynamic-fn-redefs [clump #(str %2 %1)]
            (is (= "ok" (clump "k" "o")))
            (take-latch)
            (is (= "ko" (clump "o" "k"))))))
      (future
        (testing "A thread that redefines it twice"
          (log/debug "Starting double-redefining thread, thread-id:" (thread-id))
          (mt/with-dynamic-fn-redefs [clump (fn [_ y] (str y y))]
            (is (= "zz" (clump "a" "z")))
            (mt/with-dynamic-fn-redefs [clump (fn [x _] (str x x))]
              (is (= "aa" (clump "a" "z")))
              (take-latch)
              (is (= "mm" (clump "m" "l"))))
            (is (= "bb" (clump "a" "b"))))))
      (log/debug "Taking latch on main thread, thread-id:" (thread-id))
      (take-latch)
      (testing "The original definition survives"
        (is (= "original" (clump "orig" "inal")))))))

(def not-a-function 23)

(def accidentally-a-function :wut-up)

(def also-accidentally-a-function [:wut-up])

(deftest ^:parallel with-dynamic-fn-redefs-non-ifn-test
  (testing "Redefining a non-IFn value (e.g. a number) is an error — the proxy can't apply it"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Cannot proxy non-IFn values"
         (mt/with-dynamic-fn-redefs [not-a-function 5]
           (is (= 5 not-a-function)))))))

(deftest ^:parallel with-dynamic-fn-redefs-keyword-and-coll-test
  (testing "Keyword-valued vars are IFn and can be redefined"
    (mt/with-dynamic-fn-redefs [accidentally-a-function :other]
      (is (= 2 (accidentally-a-function {:other 2})))))
  (testing "Collection-valued vars are IFn and can be redefined"
    (mt/with-dynamic-fn-redefs [also-accidentally-a-function [:other]]
      (is (= :other (also-accidentally-a-function 0))))))

(defmulti a-multimethod {:arglists '([x])} class)
(defmethod a-multimethod String [_] :string)
(defmethod a-multimethod Long [_] :long)

(deftest ^:parallel with-dynamic-fn-redefs-multimethod-test
  (testing "Cannot proxy a multimethod — patching its root would pollute dispatch for other threads"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Cannot proxy multimethods"
         (mt/with-dynamic-fn-redefs [a-multimethod (constantly :redefined)]
           (a-multimethod "hi"))))))

(defn mock-me-inner []
  :mock/original)

(defn mock-me-outer []
  (mock-me-inner))

(deftest with-dynamic-fn-redefs-nested-binding-test
  (defn z []
    (mt/with-dynamic-fn-redefs [mock-me-outer
                                (let [orig (mt/original-fn #'mock-me-outer)]
                                  (fn []
                                    (mt/with-dynamic-fn-redefs [mock-me-inner (constantly :mock/redefined)]
                                      (orig))))]
      (mock-me-outer)))
  (is (= :mock/redefined (z))))

(defn capture-bug-target [x] (inc x))

(defn counting-target [x]
  (if (pos? x) (counting-target (dec x)) :done))

(deftest ^:parallel with-dynamic-fn-redefs-capture-bug-test
  (testing "A replacement that delegates through the var itself is caught as runaway recursion"
    (is (thrown-with-msg?
         AssertionError
         #"runaway recursion through proxy"
         (mt/with-dynamic-fn-redefs [capture-bug-target (fn [x] (capture-bug-target (inc x)))]
           (capture-bug-target 0)))))
  (testing "The suggested fix — capture via original-fn — works"
    (let [orig (mt/original-fn #'capture-bug-target)]
      (mt/with-dynamic-fn-redefs [capture-bug-target (fn [x] (orig (inc x)))]
        (is (= 3 (capture-bug-target 1)))))))

(deftest ^:parallel with-dynamic-fn-redefs-deliberate-recursion-test
  (testing "Deliberate recursion through the redefined var works up to the depth threshold"
    (mt/with-dynamic-fn-redefs [counting-target (fn [x]
                                                  (if (pos? x) (counting-target (dec x)) :recursed))]
      (is (= :recursed (counting-target 50))))))

(defn- nested-redef-target [] ::real)

;; Not ^:parallel: `with-redefs` replaces the var's root for every thread.
(deftest with-dynamic-fn-redefs-inside-with-redefs-test
  (testing "A stub that `with-redefs` puts over a proxied var is not kept as the var's original"
    (mt/with-dynamic-fn-redefs [nested-redef-target (constantly ::dynamic)]
      (is (= ::dynamic (nested-redef-target))))
    ;; The global root swap is the case under test: it puts a stub where the proxy was.
    #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
    (with-redefs [nested-redef-target (constantly ::stub)]
      (mt/with-dynamic-fn-redefs [nested-redef-target (constantly ::dynamic)]
        (is (= ::dynamic (nested-redef-target)))))
    (is (= ::real (nested-redef-target)))
    (is (= ::real ((mt/original-fn #'nested-redef-target))))
    (is (= ::real ((mt/dynamic-value #'nested-redef-target))))))

(defn- reexport-source
  "The var `premium-features/is-hosted?` is imported from, checked so these tests fail if the re-export moves."
  []
  (let [src #'premium-features.settings/is-hosted?]
    (assert (identical? (:ns (meta src)) (:ns (meta #'premium-features/is-hosted?))))
    src))

;; Not ^:parallel: patching a source, or `with-redefs` on it, replaces the re-export's root for every thread.

(deftest with-dynamic-fn-redefs-reexport-after-source-patched-test
  (testing "A redef of a potemkin re-export holds after its source var is patched"
    (let [src (reexport-source)]
      (mt/with-dynamic-fn-redefs [premium-features/is-hosted? (constantly ::reexport)]
        (is (= ::reexport (premium-features/is-hosted?))))
      (mt/with-dynamic-fn-redefs [premium-features.settings/is-hosted? (constantly ::source)]
        (is (= ::source (premium-features/is-hosted?))))
      (mt/with-dynamic-fn-redefs [premium-features/is-hosted? (constantly ::reexport)]
        (is (= ::reexport (premium-features/is-hosted?)))
        (is (not= ::reexport (@src)))))))

(deftest with-dynamic-fn-redefs-reexport-after-source-with-redefs-test
  (testing "A redef of a potemkin re-export holds after `with-redefs` on its source var"
    (reexport-source)
    (mt/with-dynamic-fn-redefs [premium-features/is-hosted? (constantly ::reexport)]
      (is (= ::reexport (premium-features/is-hosted?))))
    ;; The global root swap is the case under test: it replaces the source root without going through a proxy.
    #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
    (with-redefs [premium-features.settings/is-hosted? (constantly ::global)]
      (mt/with-dynamic-fn-redefs [premium-features/is-hosted? (constantly ::reexport)]
        (is (= ::reexport (premium-features/is-hosted?)))))
    (testing "the original is not the stub that was the root when the re-export was last patched"
      (is (not= ::global ((mt/original-fn #'premium-features/is-hosted?)))))
    (mt/with-dynamic-fn-redefs [premium-features/is-hosted? (constantly ::reexport)]
      (is (= ::reexport (premium-features/is-hosted?))))))

(defn chain-source [] ::real)
(p/import-fn chain-source chain-middle)
(p/import-fn chain-middle chain-end)

;; Not ^:parallel: patching `chain-source` replaces the roots of both re-exports for every thread.
(deftest with-dynamic-fn-redefs-transitive-reexport-test
  (testing "A redef of a re-export of a re-export holds after the var at the start of the chain is patched"
    (mt/with-dynamic-fn-redefs [chain-end (constantly ::end)]
      (is (= ::end (chain-end))))
    (mt/with-dynamic-fn-redefs [chain-source (constantly ::source)]
      (is (= ::source (chain-middle)))
      (is (= ::source (chain-end))))
    (mt/with-dynamic-fn-redefs [chain-end (constantly ::end)]
      (is (= ::end (chain-end)))
      (is (= ::real (chain-middle))))
    (is (= ::real (chain-end)))
    (is (= ::real ((mt/original-fn #'chain-end))))))

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
  (testing "a replacement reaches the original through `original-fn`"
    (mt/with-dynamic-fn-redefs [delegated (fn [x] [:wrapped ((mt/original-fn #'delegated) x)])]
      (is (= [:wrapped [:original 1]] (delegated 1))))))

(defn- never-redefined [] :original)

(deftest ^:parallel dynamic-value-test
  (testing "the replacement in scope"
    (let [replacement (fn [x] [:replaced x])]
      (mt/with-dynamic-fn-redefs [delegated replacement]
        (is (identical? replacement (mt/dynamic-value #'delegated))))))
  (testing "the original once the redef has exited"
    (is (= (mt/original-fn #'delegated) (mt/dynamic-value #'delegated))))
  (testing "nil for a var that was never proxied"
    (is (nil? (mt/dynamic-value #'never-redefined))))
  (testing "a function is refused, because its var is what says which replacement is in scope"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"takes a var" (mt/dynamic-value delegated)))))

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

;;; Each test of a re-export gets its own source: whether a var has been proxied before is part of what they check.

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
    ;; The global root swap is the case under test.
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
        (is (= [:source [:wrapped :original]] [(source-5) (reexport-5)]))))))

(defn- source-6 [] :original)
(p/import-fn source-6 reexport-6)

;; Not ^:parallel: `with-redefs` replaces the var's root for every thread.
(deftest ^:synchronized with-redefs-of-reexport-survives-first-redef-of-source-test
  ;; The global root swap is the case under test.
  #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
  (with-redefs [reexport-6 (constantly :stub)]
    (testing "a `with-redefs` stub on a re-export that was never proxied outlasts the first dynamic redef of its source"
      (mt/with-dynamic-fn-redefs [source-6 (constantly :source)]
        (is (= [:source :stub] [(source-6) (reexport-6)])))
      (is (= [:original :stub] [(source-6) (reexport-6)]))))
  (testing "and the re-export follows its source again once the stub is gone"
    (is (= [:original :original] [(source-6) (reexport-6)]))
    (mt/with-dynamic-fn-redefs [source-6 (constantly :source)]
      (is (= [:source :source] [(source-6) (reexport-6)])))))

(defn- source-7 [] :original)
(p/import-fn source-7 reexport-7)

;; Not ^:parallel: `with-redefs` replaces the var's root for every thread.
(deftest ^:synchronized reexport-first-redefined-inside-with-redefs-test
  ;; The global root swap is the case under test.
  #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
  (with-redefs [reexport-7 (constantly :stub)]
    (testing "the first dynamic redef of a re-export, inside a `with-redefs` of it"
      (mt/with-dynamic-fn-redefs [reexport-7 (constantly :reexport)]
        (is (= [:original :reexport] [(source-7) (reexport-7)])))
      (is (= [:original :stub] [(source-7) (reexport-7)]))))
  (testing "afterwards the re-export follows its source, and keeps a redef of its own"
    (mt/with-dynamic-fn-redefs [source-7 (constantly :source)]
      (is (= [:source :source] [(source-7) (reexport-7)]))
      (mt/with-dynamic-fn-redefs [reexport-7 (constantly :reexport)]
        (is (= [:source :reexport] [(source-7) (reexport-7)]))))))

(defn- source-8 [] :original)
(p/import-fn source-8 reexport-8)

(defn- source-9 [] :original)
(p/import-fn source-9 reexport-9)

;; Not ^:parallel: `with-redefs` replaces the var's root for every thread.
(deftest ^:synchronized nested-with-redefs-of-reexport-and-source-test
  (let [nested (fn [source reexport]
                 (with-redefs-fn {reexport (constantly :stub)}
                   (fn []
                     (with-redefs-fn {source (constantly :source)}
                       (fn [] [(source) (reexport)])))))]
    (testing "once the source has been redefined with the macro, a stub on the re-export outlasts one on the source"
      (mt/with-dynamic-fn-redefs [source-8 (constantly :source)]
        (is (= :source (source-8))))
      (is (= [:source :stub] (nested #'source-8 #'reexport-8))))
    (testing "known limitation: until then potemkin copies the source's stub over the re-export's"
      (is (= [:source :source] (nested #'source-9 #'reexport-9))))))

(defn- reexport!
  "Intern a re-export of `source` in the namespace named `ns-sym`, linked the way `p/import-fn` links them."
  ^Var [^Var source ns-sym]
  (let [reexport (intern (create-ns ns-sym) (gensym "reexport-") @source)]
    (alter-meta! reexport merge (dissoc (meta source) :name))
    (p.namespaces/link-vars source reexport)
    reexport))

(defn- fresh-source!
  "Intern a var holding `root` in this namespace."
  ^Var [root]
  (intern (the-ns 'metabase.test.util.dynamic-redefs-test) (gensym "source-") root))

(defn- redefined!
  "Call `thunk` with `replacement` in scope for `a-var`, as `with-dynamic-fn-redefs` would for a var named in source."
  [^Var a-var replacement thunk]
  (dynamic-redefs/patch-vars! [a-var])
  (binding [dynamic-redefs/*local-redefs* (dynamic-redefs/local-redefs {a-var replacement})]
    (thunk)))

(deftest reexport-of-reexport-in-another-namespace-test
  (let [source (fresh-source! (fn [] :original))
        middle (reexport! source 'metabase.test.util.dynamic-redefs-test.middle)
        end    (reexport! middle 'metabase.test.util.dynamic-redefs-test.end)
        calls  (fn [] [(source) (middle) (end)])]
    (testing "a redef of the last link only reaches calls through it, and survives a first redef further up"
      (is (= [[:original :original :end] [:original :middle :end] [:original :original :end]]
             (redefined! end (constantly :end)
                         (fn [] [(calls) (redefined! middle (constantly :middle) calls) (calls)])))))
    (testing "every link follows the one before it"
      (is (= [:source :source :source] (redefined! source (constantly :source) calls)))
      (is (= [:original :middle :middle] (redefined! middle (constantly :middle) calls))))
    (testing "the original of every link is the source's"
      (is (= [@(delay (mt/original-fn source))] (distinct (map mt/original-fn [source middle end])))))))

;; Not ^:parallel: `with-redefs` replaces the var's root for every thread.
(deftest ^:synchronized reexport-first-redefined-under-a-stub-potemkin-overwrote-test
  (let [source   (fresh-source! (fn [] :original))
        reexport (reexport! source 'metabase.test.util.dynamic-redefs-test)
        calls    (fn [] [(source) (reexport)])]
    (testing "potemkin copies a stub of the source over a stub of the re-export, which then looks like a plain copy"
      (is (= [[:source :source] [:source :reexport]]
             (with-redefs-fn {reexport (constantly :stub)}
               (fn []
                 (with-redefs-fn {source (constantly :source)}
                   (fn []
                     [(calls) (redefined! reexport (constantly :reexport) calls)])))))))
    (testing "the re-export still follows its source after both stubs are gone"
      (is (= [[:original :original] [:source :source]]
             [(calls) (redefined! source (constantly :source) calls)])))))

;; Not ^:parallel: `with-redefs` replaces the var's root for every thread.
(deftest ^:synchronized one-with-redefs-of-reexport-and-source-test
  (doseq [reexport-first? [true false]]
    (testing (str "one `with-redefs` of both vars, restoring the " (if reexport-first? "re-export" "source") " first")
      (let [source   (fresh-source! (fn [] :original))
            reexport (reexport! source 'metabase.test.util.dynamic-redefs-test)
            calls    (fn [] [(source) (reexport)])
            stubs    (if reexport-first?
                       (array-map reexport (constantly :stub) source (constantly :source-stub))
                       (array-map source (constantly :source-stub) reexport (constantly :stub)))]
        ;; The source is first redefined with the macro while both stubs are in place.
        (with-redefs-fn stubs #(redefined! source (constantly :source) calls))
        (is (= [[:original :original] [:source :source]]
               [(calls) (redefined! source (constantly :source) calls)])
            "the re-export follows its source once both stubs are gone")))))

;;; A surprising and unfortunate result, recorded so that changing it is a decision.
;;;
;;; The `with-redefs` below binds a re-export to its source's own function, and the source is then redefined. The
;;; innermost redef of the re-export is that `with-redefs`, so the intuitive answer is `:original`. The answer is
;;; `:source`.
;;;
;;; The macro cannot tell this binding from a `with-redefs` that started before it first proxied the re-export and is
;;; now putting a stale copy of the source back. Both show up as the re-export's root changing from its proxy to the
;;; source's function. The stale copy has to be reconnected, or the re-export stays disconnected from its source for
;;; the rest of the JVM and later tests see it: `reexport-first-redefined-under-a-stub-potemkin-overwrote-test`. This
;;; binding loses instead, because the damage stays inside the one test that wrote it.
;;;
;;; A way to tell the two apart, or a different view of which one should lose, would make this expect `:original`.

;; Not ^:parallel: `with-redefs` replaces the var's root for every thread.
(deftest ^:synchronized with-redefs-of-reexport-to-its-source's-function-test
  (let [source   (fresh-source! (fn [] :original))
        reexport (reexport! source 'metabase.test.util.dynamic-redefs-test)]
    (redefined! reexport (constantly :reexport) reexport)
    (testing "surprising: a `with-redefs` of a re-export to its source's own function does not hold"
      (is (= :source
             (with-redefs-fn {reexport (mt/original-fn source)}
               #(redefined! source (constantly :source) reexport)))))))

(deftest reexport-of-unproxyable-value-test
  (testing "a re-export of a multimethod or of a value that is not a function is refused, like its source"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Cannot proxy multimethods"
                          (dynamic-redefs/patch-vars! [(reexport! (fresh-source! a-multimethod)
                                                                  'metabase.test.util.dynamic-redefs-test)])))
    (is (instance? MultiFn a-multimethod))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Cannot proxy non-IFn values"
                          (dynamic-redefs/patch-vars! [(reexport! (fresh-source! 23)
                                                                  'metabase.test.util.dynamic-redefs-test)])))))

(deftest first-redef-of-reexport-and-source-race-test
  (testing "a re-export and its source, each first redefined at the same moment on its own thread"
    (let [pairs 300
          pool  (Executors/newFixedThreadPool 2)
          race  (fn []
                  (let [source   (fresh-source! (fn [] :original))
                        reexport (reexport! source 'metabase.test.util.dynamic-redefs-test)
                        barrier  (CyclicBarrier. 2)
                        redef    (fn [a-var value]
                                   (.submit pool ^Callable (fn []
                                                             (.await barrier)
                                                             (redefined! a-var (constantly value) a-var))))
                        tasks    [(redef reexport :reexport) (redef source :source)]]
                    ;; A timeout here is a deadlock between the two threads.
                    {:during         (mapv #(.get ^Future % 30 TimeUnit/SECONDS) tasks)
                     :reexport-redef (redefined! reexport (constantly :reexport) (fn [] [(reexport) (source)]))
                     :source-redef   (redefined! source (constantly :source) (fn [] [(reexport) (source)]))}))]
      (try
        (is (= {{:during         [:reexport :source]
                 :reexport-redef [:reexport :original]
                 :source-redef   [:source :source]}
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
            [:dynamic :a]          (mt/with-dynamic-fn-redefs [model-a f] (body!))
            [:dynamic :b]          (mt/with-dynamic-fn-redefs [model-b f] (body!))
            [:dynamic :a-reexport] (mt/with-dynamic-fn-redefs [model-a-reexport f] (body!))
            [:plain :a]            (with-redefs-fn {#'model-a f} body!)
            [:plain :b]            (with-redefs-fn {#'model-b f} body!)
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

;;; The same model across threads. A dynamic redef is local to its thread, so each thread's program has to see what the
;;; model says whatever the other threads do, including while they proxy the same vars for the first time.

(defn- dynamic-only
  "Turn every `with-redefs` in `ops` into a dynamic redef: a `with-redefs` is seen by every thread."
  [ops]
  (mapv (fn [{:keys [op body] :as o}]
          (cond-> o
            (= op :plain) (assoc :op :dynamic)
            body          (assoc :body (dynamic-only body))))
        ops))

(defn- run-dynamic-program!
  "Like [[run-program!]], for dynamic redefs of the vars in `vars`, which maps the model's names to vars."
  [vars seen id ops]
  (doseq [{:keys [op body throws?] v :var :as o} ops]
    (case op
      :call   (swap! seen conj (apply (vars v) (range (:nargs o))))
      :future @(future (run-dynamic-program! vars seen id body))
      (try
        (redefined! (vars v) (stub (swap! id inc))
                    (fn []
                      (run-dynamic-program! vars seen id body)
                      (when throws?
                        (throw (ex-info "leave the redef by exception" {::expected true})))))
        (catch clojure.lang.ExceptionInfo e
          (when-not (::expected (ex-data e))
            (throw e)))))))

(defspec dynamic-redefs-are-thread-local-model-test 100
  (prop/for-all [programs (gen/vector (gen/fmap dynamic-only (gen/vector gen-program 1 5)) 4)]
    (let [original (fn [& args] [:original (count args)])
          source   (fresh-source! original)
          vars     {:a          source
                    :a-reexport (reexport! source 'metabase.test.util.dynamic-redefs-test)
                    :b          (fresh-source! original)}
          barrier  (CyclicBarrier. (count programs))
          threads  (mapv (fn [ops]
                           (future
                             (.await barrier 30 TimeUnit/SECONDS)
                             (let [seen (atom [])]
                               (run-dynamic-program! vars seen (atom 0) ops)
                               @seen)))
                         programs)]
      ;; A thread that does not finish is a deadlock.
      (= (map model programs)
         (map #(deref % 30000 ::did-not-finish) threads)))))
