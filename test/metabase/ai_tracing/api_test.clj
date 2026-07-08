(ns metabase.ai-tracing.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.ai-tracing.api :as ait.api]
   [metabase.ai-tracing.settings :as ai-tracing.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

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

;;; -------------------------------------------- Endpoint (integration) ---------------------------------------------
;; Not ^:parallel: redefs the capture setting and writes to the real trace dir.

(deftest endpoint-gated-on-capture-then-superuser-test
  (testing "the route is invisible (404) when MB_AI_EVAL_CAPTURE is off — the default"
    (mt/user-http-request :crowberto :get 404 "eval-trace/some-id"))
  (mt/with-dynamic-fn-redefs [ai-tracing.settings/ai-eval-capture (constantly true)]
    (testing "with capture on, a non-superuser is forbidden (traces hold unredacted content)"
      (mt/user-http-request :rasta :get 403 "eval-trace/some-id"))
    (testing "with capture on, a superuser gets 404 for a session with no trace file"
      (is (re-find #"Eval trace not found"
                   (str (mt/user-http-request :crowberto :get 404 "eval-trace/no-such-session")))))))

(deftest endpoint-streams-the-trace-file-test
  (mt/with-dynamic-fn-redefs [ai-tracing.settings/ai-eval-capture (constantly true)]
    (let [sid     (str "eval-api-test-" (random-uuid))
          ^File f (#'ait.api/trace-file sid)]
      (io/make-parents f)
      (spit f "{\"session\":\"s\",\"id\":\"n1\"}\n{\"session\":\"s\",\"id\":\"n2\"}\n")
      (try
        (testing "a superuser gets a 200 resolving to that session's <id>.jsonl (Ring streams the file)"
          ;; The test client surfaces the File body as its path rather than streaming its bytes, so we
          ;; assert the endpoint resolved to the right file at 200 — the byte-streaming is Ring's job.
          (let [body (str (mt/user-http-request :crowberto :get 200 (str "eval-trace/" sid)))]
            (is (str/includes? body (str sid ".jsonl")))))
        (finally (.delete f))))))
