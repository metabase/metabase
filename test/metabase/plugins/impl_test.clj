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
  ;; manifests -- root-owned code already on the classpath -- are registered first, and registration is
  ;; first-wins. Bare dependency JARs still go on the classpath before bundled manifests so a bundled
  ;; manifest's class: dependency is satisfiable when it is registered.
  (let [events   (atom [])
        dep-jar  (fake-path "dep.jar")
        user-jar (fake-path "user-plugin.jar")]
    (mt/with-dynamic-fn-redefs [impl/plugins-paths                  (constantly [user-jar dep-jar])
                                impl/has-manifest?                  (fn [^Path p] (boolean (re-find #"plugin" (str p))))
                                impl/register-plugin!               (fn [p] (swap! events conj [:register (str p)]))
                                impl/load-bundled-plugin-manifests! (fn [] (swap! events conj :bundled))]
      (#'impl/load!))
    (is (= [[:register "dep.jar"] :bundled [:register "user-plugin.jar"]] @events)
        "dependency JARs load first, then bundled manifests, then plugins-directory manifests")))
