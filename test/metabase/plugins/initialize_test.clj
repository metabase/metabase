(ns metabase.plugins.initialize-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.plugins.core :as plugins]
   [metabase.plugins.dependencies :as deps]
   [metabase.plugins.init-steps :as init-steps]
   [metabase.plugins.initialize :as initialize]
   [metabase.plugins.lazy-loaded-driver :as lazy-loaded-driver]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest non-driver-plugins-load-lazily-test
  (doseq [driver-value [nil []]]
    (testing (str "driver value " (pr-str driver-value))
      (let [calls       (atom [])
            plugin-name (str "test non-driver plugin " (random-uuid))
            plugin      {:metabase-plugin-api-version initialize/plugin-api-version
                         :info                       {:name plugin-name :version "1.0.0"}
                         :driver                     driver-value
                         :init                       [{:step "load-namespace" :namespace "example.plugin"}]
                         :add-to-classpath!          #(swap! calls conj :classpath)}]
        (mt/with-dynamic-fn-redefs [deps/all-dependencies-satisfied?                (constantly true)
                                    deps/update-unsatisfied-deps!                   (constantly [])
                                    init-steps/do-init-steps!                       #(swap! calls conj [:init %])
                                    lazy-loaded-driver/register-lazy-loaded-driver! #(swap! calls conj [:driver %])]
          (is (= :ok (initialize/register-plugin-with-info! plugin)))
          (is (empty? @calls) "registration does not load plugin code")
          (is (= :ok (plugins/load-plugin! plugin-name)))
          (is (= :ok (plugins/load-plugin! plugin-name)) "loading is idempotent"))
        (is (= [:classpath [:init (:init plugin)]] @calls))))))

(deftest bundled-plugin-never-touches-the-classpath-test
  ;; A plugin whose manifest is discovered on the classpath (compiled into the uberjar) carries no
  ;; add-to-classpath! -- its code is already loaded. Activation runs the init steps only, so a bundled
  ;; plugin never adds bytes from the writable plugins directory. This is what keeps drivers, and any
  ;; bundled non-driver plugin, on the same root-owned-classpath footing.
  (let [calls       (atom [])
        plugin-name (str "test bundled plugin " (random-uuid))
        plugin      {:metabase-plugin-api-version initialize/plugin-api-version
                     :info                        {:name plugin-name :version "1.0.0"}
                     :init                        [{:step "load-namespace" :namespace "example.plugin"}]}]
    (mt/with-dynamic-fn-redefs [deps/all-dependencies-satisfied? (constantly true)
                                deps/update-unsatisfied-deps!    (constantly [])
                                init-steps/do-init-steps!        #(swap! calls conj [:init %])]
      (is (= :ok (initialize/register-plugin-with-info! plugin)))
      (is (= :ok (plugins/load-plugin! plugin-name))))
    (is (= [[:init (:init plugin)]] @calls)
        "activation runs init steps only; nothing is added to the classpath")))

(deftest non-driver-plugin-must-declare-api-version-test
  (doseq [driver-value [nil []]]
    (testing (str "driver value " (pr-str driver-value))
      (let [plugin {:driver driver-value
                    :info   {:name (str "test unversioned plugin " (random-uuid)) :version "1.0.0"}}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"must declare Metabase plugin API version"
                              (initialize/register-plugin-with-info! plugin)))))))

(deftest incompatible-plugin-api-version-is-rejected-test
  (let [calls  (atom [])
        plugin {:metabase-plugin-api-version (inc initialize/plugin-api-version)
                :info                       {:name (str "test incompatible plugin " (random-uuid))
                                             :version "1.0.0"}
                :init                       [{:step "load-namespace" :namespace "example.plugin"}]
                :add-to-classpath!          #(swap! calls conj :classpath)}]
    (mt/with-dynamic-fn-redefs [init-steps/do-init-steps! #(swap! calls conj [:init %])]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"unsupported Metabase plugin API version"
                            (initialize/register-plugin-with-info! plugin))))
    (is (empty? @calls) "an incompatible plugin is rejected before its code reaches the classpath")))

(deftest lazy-driver-plugin-remains-lazy-test
  (let [calls       (atom [])
        driver-name (str "test-lazy-driver-" (random-uuid))
        plugin-name (str "test lazy driver plugin " (random-uuid))
        plugin      {:info              {:name plugin-name :version "1.0.0"}
                     :driver            {:name driver-name :abstract true :lazy-load true}
                     :init              [{:step "load-namespace" :namespace "example.driver"}]
                     :add-to-classpath! #(swap! calls conj :classpath)}]
    (mt/with-dynamic-fn-redefs [deps/all-dependencies-satisfied? (constantly true)
                                deps/update-unsatisfied-deps!    (constantly [])
                                init-steps/do-init-steps!        #(swap! calls conj [:init %])]
      (is (= :ok (initialize/register-plugin-with-info! plugin)))
      (is (empty? @calls) "driver registration does not load plugin code")
      (driver/initialize! (keyword driver-name))
      (driver/initialize! (keyword driver-name)))
    (is (= [:classpath [:init (:init plugin)]] @calls)
        "the driver placeholder uses the shared idempotent plugin loader")))

(deftest driver-plugin-can-opt-out-of-lazy-loading-test
  (let [calls  (atom [])
        plugin {:info              {:name (str "test eager driver plugin " (random-uuid)) :version "1.0.0"}
                :driver            {:name "example" :lazy-load false}
                :init              [{:step "load-namespace" :namespace "example.driver"}]
                :add-to-classpath! #(swap! calls conj :classpath)}]
    (mt/with-dynamic-fn-redefs [deps/all-dependencies-satisfied?                (constantly true)
                                deps/update-unsatisfied-deps!                   (constantly [])
                                init-steps/do-init-steps!                       #(swap! calls conj [:init %])
                                lazy-loaded-driver/register-lazy-loaded-driver! #(swap! calls conj [:driver %])]
      (is (= :ok (initialize/register-plugin-with-info! plugin))))
    (is (= [:classpath [:init (:init plugin)]] @calls))))

(deftest lazy-driver-load-failure-is-retryable-test
  (let [calls       (atom [])
        attempts    (atom 0)
        driver-name (str "test-lazy-retry-" (random-uuid))
        plugin-name (str "test lazy retry plugin " (random-uuid))
        plugin      {:info              {:name plugin-name :version "1.0.0"}
                     :driver            {:name driver-name :abstract true :lazy-load true}
                     :init              [{:step "load-namespace" :namespace "example.driver"}]
                     :add-to-classpath! #(swap! calls conj :classpath)}]
    (mt/with-dynamic-fn-redefs [deps/all-dependencies-satisfied? (constantly true)
                                deps/update-unsatisfied-deps!    (constantly [])
                                ;; throw on the first activation, succeed on the retry
                                init-steps/do-init-steps!        (fn [steps]
                                                                   (swap! calls conj [:init steps])
                                                                   (when (= 1 (swap! attempts inc))
                                                                     (throw (ex-info "transient load failure" {}))))]
      (is (= :ok (initialize/register-plugin-with-info! plugin)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"transient load failure"
                            (driver/initialize! (keyword driver-name))))
      ;; the failed load did not remove the placeholder, so the driver still loads on a second attempt
      (driver/initialize! (keyword driver-name)))
    (is (= [:classpath [:init (:init plugin)] :classpath [:init (:init plugin)]] @calls)
        "a failed load leaves the driver retryable; the retry re-runs classpath + init")))

(deftest load-plugin-requires-registered-plugin-test
  (let [plugin-name (str "test missing plugin " (random-uuid))]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"is not registered"
                          (plugins/load-plugin! plugin-name)))))
