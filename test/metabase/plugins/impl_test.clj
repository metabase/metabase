(ns metabase.plugins.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.plugins.impl :as impl]
   [metabase.test :as mt])
  (:import
   (java.nio.file Path Paths)))

(set! *warn-on-reflection* true)

(defn- fake-path ^Path [s]
  (Paths/get s (make-array String 0)))

(deftest bundled-manifests-register-before-plugins-directory-manifests-test
  ;; A JAR dropped in the writable plugins directory must not shadow a bundled (uberjar) plugin: bundled
  ;; manifests -- root-owned code already on the classpath -- are registered first. Bare dependency JARs still
  ;; go on the classpath before bundled manifests so a bundled manifest's class: dependency is satisfiable
  ;; when it is registered.
  (let [events   (atom [])
        dep-jar  (fake-path "dep.jar")
        user-jar (fake-path "user-plugin.jar")]
    (mt/with-dynamic-fn-redefs [impl/plugins-paths                  (constantly [user-jar dep-jar])
                                impl/has-manifest?                  (fn [^Path p] (boolean (re-find #"plugin" (str p))))
                                impl/bundled-plugin-names           (constantly #{})
                                impl/register-plugin!               (fn [_reserved ^Path p] (swap! events conj [:register (str p)]))
                                impl/load-bundled-plugin-manifests! (fn [] (swap! events conj :bundled))]
      (#'impl/load!))
    (is (= [[:register "dep.jar"] :bundled [:register "user-plugin.jar"]] @events)
        "dependency JARs load first, then bundled manifests, then plugins-directory manifests")))

(deftest reserved-bundled-names-block-plugins-directory-manifests-test
  ;; A bundled plugin whose dependencies are unmet (e.g. Oracle without its JDBC JAR) never registers, so its
  ;; name is reserved explicitly. A plugins-directory JAR reusing that name is ignored rather than registered
  ;; and run under the bundled plugin's identity.
  (let [registered (atom [])
        user-jar   (fake-path "shadow.jar")]
    (mt/with-dynamic-fn-redefs [impl/plugin-info                (constantly {:info {:name "Metabase Oracle Driver" :version "1.0.0"}})
                                impl/register-plugin-with-info! (fn [info] (swap! registered conj (get-in info [:info :name])))]
      (testing "a manifest whose name is reserved by a bundled plugin is ignored"
        (#'impl/register-plugin! #{"Metabase Oracle Driver"} user-jar)
        (is (= [] @registered)))
      (testing "a non-colliding manifest still registers"
        (#'impl/register-plugin! #{"Some Other Bundled Plugin"} user-jar)
        (is (= ["Metabase Oracle Driver"] @registered))))))
