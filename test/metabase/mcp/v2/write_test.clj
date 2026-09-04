(ns metabase.mcp.v2.write-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as api.scope]
   [metabase.mcp.v2.write :as v2.write]))

(set! *warn-on-reflection* true)

(def ^:private row
  {:id 1 :name "Orders over time" :bookmarked true})

(deftest ^:parallel readback-grants-full-row-test
  (testing "a token holding every read scope gets the row unchanged"
    (is (= row
           (v2.write/readback #{"agent:content:read"} ["agent:content:read"] row [:bookmarked])))))

(deftest ^:parallel readback-degrades-without-read-scope-test
  (testing "a token missing the read scope gets id + ack-keys + a note, and never the row's other keys"
    (let [result (v2.write/readback #{"agent:content:write"} ["agent:content:read"] row [:bookmarked])]
      (is (= #{:id :note :bookmarked} (set (keys result)))
          "name must not survive the degradation")
      (is (true? (:bookmarked result))
          "an ack-key the caller supplied survives")
      (is (re-find #"agent:content:read" (:note result))
          "the note names the missing scope"))))

(deftest ^:parallel readback-refuses-empty-read-scopes-test
  (testing "an empty read-scopes is refused rather than silently skipping the gate — `missing` would be
            empty and the ungated row would come back looking exactly like a gate that passed"
    (doseq [empty-scopes [[] nil]]
      (testing (pr-str empty-scopes)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"at least one read scope"
                              (v2.write/readback #{"agent:content:write"} empty-scopes row [:bookmarked])))))))

(deftest ^:parallel readback-unrestricted-callers-get-the-row-test
  (testing "the unrestricted sentinel and nil token-scopes (internal callers) both read back in full"
    (is (= row (v2.write/readback #{::api.scope/unrestricted} ["agent:content:read"] row [:bookmarked])))
    (is (= row (v2.write/readback nil ["agent:content:read"] row [:bookmarked])))))

(deftest ^:parallel readback-note-pluralizes-test
  (testing "one missing scope reads `scope`, several read `scopes`, and all are named"
    (let [one  (v2.write/readback #{} ["agent:content:read"] row nil)
          many (v2.write/readback #{} ["agent:content:read" "agent:metadata:read"] row nil)]
      (is (re-find #"the agent:content:read scope this token" (:note one)))
      (is (re-find #"agent:content:read and agent:metadata:read scopes this" (:note many))))))

(deftest ^:parallel readback-ack-key-absent-from-row-test
  (testing "an ack-key the row doesn't carry is dropped rather than added as nil"
    (let [result (v2.write/readback #{} ["agent:content:read"] {:id 1 :name "n"} [:bookmarked])]
      (is (= #{:id :note} (set (keys result)))))))
