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
  ;; Bare dependency JARs load first (so a bundled manifest's class: dependency is satisfiable), then bundled
  ;; manifests, then plugins-directory manifests. The reserved bundled names are passed to *both* plugins-
  ;; directory batches, since a JAR can be a bare dependency when classified but a manifest when registered.
  (let [events   (atom [])
        dep-jar  (fake-path "dep.jar")
        user-jar (fake-path "user-plugin.jar")]
    (mt/with-dynamic-fn-redefs [impl/plugins-paths                  (constantly [user-jar dep-jar])
                                impl/has-manifest?                  (fn [^Path p] (boolean (re-find #"plugin" (str p))))
                                impl/bundled-plugin-names           (constantly #{"Bundled Plugin"})
                                impl/register-plugin!               (fn [reserved ^Path p] (swap! events conj [:register reserved (str p)]))
                                impl/load-bundled-plugin-manifests! (fn [] (swap! events conj :bundled))]
      (#'impl/load!))
    (is (= [[:register #{"Bundled Plugin"} "dep.jar"]
            :bundled
            [:register #{"Bundled Plugin"} "user-plugin.jar"]]
           @events)
        "order is deps -> bundled -> user manifests, with the bundled names reserved against both batches")))

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

(deftest misclassified-jar-cannot-claim-a-bundled-name-test
  ;; Classification (has-manifest?) and registration (plugin-info) read the writable JAR separately. A JAR that
  ;; looks like a bare dependency when classified but resolves to a bundled-name manifest when registered must
  ;; still be refused -- so the reserved set is checked in the dependency batch too, not only for user manifests.
  (let [registered (atom [])
        sneaky-jar (fake-path "sneaky.jar")]
    (mt/with-dynamic-fn-redefs [impl/plugins-paths                  (constantly [sneaky-jar])
                                impl/has-manifest?                  (constantly false)
                                impl/plugin-info                    (constantly {:info {:name "Metabase Oracle Driver" :version "1.0.0"}})
                                impl/bundled-plugin-names           (constantly #{"Metabase Oracle Driver"})
                                impl/register-plugin-with-info!     (fn [info] (swap! registered conj (get-in info [:info :name])))
                                impl/load-bundled-plugin-manifests! (fn [] nil)]
      (#'impl/load!))
    (is (= [] @registered)
        "a bare-dependency JAR that resolves to a bundled-name manifest at registration is refused")))
