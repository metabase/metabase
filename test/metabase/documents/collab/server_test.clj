(ns metabase.documents.collab.server-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.collab.server :as collab.server]))

(set! *warn-on-reflection* true)

(deftest ^:parallel stop-on-never-built-is-noop-test
  (testing "stop! does not throw when the server was never built"
    ;; The production delay is never forced in unit-test runs (flag off + mt
    ;; not setting it), so stop! should short-circuit on `realized?`.
    (is (nil? (collab.server/stop!)))))

(deftest ^:parallel stop-is-idempotent-test
  (testing "stop! may be called repeatedly without throwing"
    (dotimes [_ 3]
      (is (nil? (collab.server/stop!))))))
