(ns load-namespaces.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [load-namespaces.core :as core])
  (:import
   (java.io StringWriter)))

(set! *warn-on-reflection* true)

(defn- greet-the-friend []
  ((requiring-resolve 'reload-fixtures.proto/greet)
   @(requiring-resolve 'reload-fixtures.consumer/friend)))

(deftest loadable-paths-test
  (testing "finds .clj and .cljc, skips .cljs, and strips the root and the extension"
    (is (= ["discovery_fixtures/nested/two_faced" "discovery_fixtures/plain"]
           (#'core/loadable-paths "test-resources/discovery")))))

(deftest loadable-paths-rejects-non-directories-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not a source directory"
                        (#'core/loadable-paths "test-resources/no-such-root")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not a source directory"
                        (#'core/loadable-paths "deps.edn"))))

(deftest path->lib-test
  (is (= 'discovery-fixtures.nested.two-faced
         (#'core/path->lib "discovery_fixtures/nested/two_faced"))))

(deftest load-failures-are-counted-and-reported-test
  (let [err      (StringWriter.)
        failures (binding [*err* err] (#'core/load-namespaces ["test-resources/broken"]))
        output   (str err)]
    (is (= 1 failures))
    (is (str/includes? output "Failed to load broken-fixtures.boom"))
    (is (str/includes? output "intentional load failure"))))

(deftest already-loaded-namespaces-are-not-reloaded-test
  (let [err      (StringWriter.)
        failures (binding [*err* err] (#'core/load-namespaces ["test-resources/protocol-reload"]))
        output   (str err)]
    (is (zero? failures))
    (testing "the consumer pulled the protocol in, so the scan left it alone"
      (is (str/includes? output "Loading namespace reload-fixtures.consumer"))
      (is (not (str/includes? output "Loading namespace reload-fixtures.proto")))
      (is (= "hi" (greet-the-friend)))))
  (testing "reloading it redefines the protocol, breaking implementations compiled against the old one"
    (load "/reload_fixtures/proto")
    (is (thrown? IllegalArgumentException (greet-the-friend)))))
