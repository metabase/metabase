(ns metabase.test.util-test
  "Tests for the test utils!"
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [potemkin :as p]
   [toucan2.core :as t2])
  (:import
   (clojure.lang Agent)
   (java.util.concurrent CountDownLatch ThreadPoolExecutor TimeUnit)))

(set! *warn-on-reflection* true)

(deftest with-temp-vals-in-db-test
  (testing "let's make sure this actually works right!"
    (let [position #(t2/select-one-fn :position :model/Field :id (data/id :venues :price))]
      (mt/with-temp-vals-in-db :model/Field (data/id :venues :price) {:position -1}
        (is (= -1
               (position))))
      (is (= 5
             (position)))))
  (testing "if an Exception is thrown, original value should be restored"
    (u/ignore-exceptions
      (mt/with-temp-vals-in-db :model/Field (data/id :venues :price) {:position -1}
        (throw (Exception.))))
    (is (= 5
           (t2/select-one-fn :position :model/Field :id (data/id :venues :price))))))

(setting/defsetting test-util-test-setting
  "Another internal test setting"
  :visibility :internal
  :default    ["A" "B" "C"]
  :type       :csv
  :encryption :no)

(deftest with-temporary-setting-values-test
  (testing "`with-temporary-setting-values` should do its thing"
    (mt/with-temporary-setting-values [test-util-test-setting ["D" "E" "F"]]
      (is (= ["D" "E" "F"]
             (test-util-test-setting)))))
  (testing "`with-temporary-setting-values` shouldn't stomp over default values"
    (mt/with-temporary-setting-values [test-util-test-setting ["D" "E" "F"]]
      (test-util-test-setting))
    (is (= ["A" "B" "C"]
           (test-util-test-setting)))))

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
                                (let [orig (mt/dynamic-value mock-me-outer)]
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
    (assert (contains? (.getWatches ^clojure.lang.Var src) #'premium-features/is-hosted?))
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

(deftest ^:parallel ordered-subset?-test
  (is (mt/ordered-subset? [1 2 3] [1 2 3]))
  (is (mt/ordered-subset? [1 2 3] [1 2 1 3 4 5]))
  (is (mt/ordered-subset? [1 2 3] [1 2 3 4]))
  (is (mt/ordered-subset? [1 2 3] [0 1 2 3]))
  (is (mt/ordered-subset? [1 2 3] [0 1 2 3 4 5]))
  (is (not (mt/ordered-subset? [1 2 3] [1 2])))
  (is (mt/ordered-subset? [] []))
  (is (mt/ordered-subset? [] [1]))
  (is (not (mt/ordered-subset? [1] [])))
  (is (mt/ordered-subset? ["foo"   "bar"              "baz"]
                          ["elephants" "foxes" "badgers" "zebras" "beavers" "platypi"]
                          (fn [x y] (= (first x) (first y))))))
