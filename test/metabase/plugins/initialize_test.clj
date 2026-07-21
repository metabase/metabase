(ns metabase.plugins.initialize-test
  (:require
   [clojure.test :refer :all]
   [metabase.plugins.dependencies :as deps]
   [metabase.plugins.init-steps :as init-steps]
   [metabase.plugins.initialize :as initialize]
   [metabase.plugins.lazy-loaded-driver :as lazy-loaded-driver]))

(set! *warn-on-reflection* true)

(deftest non-driver-plugin-initializes-eagerly-test
  (let [calls       (atom [])
        plugin-name (str "test non-driver plugin " (random-uuid))
        plugin      {:metabase-plugin-api-version initialize/plugin-api-version
                     :info                       {:name plugin-name :version "1.0.0"}
                     :init                       [{:step "load-namespace" :namespace "example.plugin"}]
                     :add-to-classpath!          #(swap! calls conj :classpath)}]
    (with-redefs [deps/all-dependencies-satisfied?                    (constantly true)
                  deps/update-unsatisfied-deps!                       (constantly [])
                  init-steps/do-init-steps!                            #(swap! calls conj [:init %])
                  lazy-loaded-driver/register-lazy-loaded-driver!     #(swap! calls conj [:driver %])]
      (#'initialize/init! plugin))
    (is (= [:classpath [:init (:init plugin)]] @calls))))

(deftest non-driver-plugin-must-declare-api-version-test
  (doseq [driver-value [nil []]]
    (testing (str "driver value " (pr-str driver-value))
      (let [plugin {:driver driver-value
                    :info   {:name (str "test unversioned plugin " (random-uuid)) :version "1.0.0"}}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"must declare Metabase plugin API version"
                              (initialize/init-plugin-with-info! plugin)))))))

(deftest incompatible-plugin-api-version-is-rejected-test
  (let [calls  (atom [])
        plugin {:metabase-plugin-api-version (inc initialize/plugin-api-version)
                :info                       {:name (str "test incompatible plugin " (random-uuid))
                                             :version "1.0.0"}
                :init                       [{:step "load-namespace" :namespace "example.plugin"}]
                :add-to-classpath!          #(swap! calls conj :classpath)}]
    (with-redefs [init-steps/do-init-steps! #(swap! calls conj [:init %])]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"unsupported Metabase plugin API version"
                            (initialize/init-plugin-with-info! plugin))))
    (is (empty? @calls) "an incompatible plugin is rejected before its code reaches the classpath")))

(deftest lazy-driver-plugin-remains-lazy-test
  (let [calls       (atom [])
        plugin-name (str "test lazy driver plugin " (random-uuid))
        plugin      {:info              {:name plugin-name :version "1.0.0"}
                     :driver            {:name "example" :lazy-load true}
                     :init              [{:step "load-namespace" :namespace "example.driver"}]
                     :add-to-classpath! #(swap! calls conj :classpath)}]
    (with-redefs [deps/all-dependencies-satisfied?                (constantly true)
                  deps/update-unsatisfied-deps!                   (constantly [])
                  init-steps/do-init-steps!                        #(swap! calls conj [:init %])
                  lazy-loaded-driver/register-lazy-loaded-driver! #(swap! calls conj [:driver (:driver %)])]
      (#'initialize/init! plugin))
    (is (= [[:driver (:driver plugin)]] @calls))))
