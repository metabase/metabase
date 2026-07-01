(ns metabase.ai-tracing.api-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.ai-tracing.api :as ait.api])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(deftest ^:parallel trace-file-rejects-unsafe-ids-test
  (testing "trace-file returns nil for any id that could escape the trace dir (path traversal)"
    (doseq [bad ["../../etc/passwd" "a/b" ".." "." ".hidden" "has space" "" "foo/../bar" "/abs"]]
      (is (nil? (#'ait.api/trace-file bad))
          (str "should reject " (pr-str bad))))))

(deftest ^:parallel trace-file-resolves-safe-id-test
  (testing "a safe id resolves to a <id>.jsonl file sitting directly inside the trace dir"
    (let [^File f (#'ait.api/trace-file "abc-123.def_4")]
      (is (some? f))
      (is (= "abc-123.def_4.jsonl" (.getName f)))
      (is (= (.getCanonicalFile ^File (#'ait.api/trace-dir))
             (.getParentFile f))
          "defense in depth: the resolved file's parent is the canonical trace dir"))))
