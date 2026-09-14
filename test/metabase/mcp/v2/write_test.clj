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

(deftest ^:parallel dispatch-write-test
  (let [entry {:create-required [:name]}]
    (testing "create enforces (create)-required fields"
      (is (= [:create {:name "X"}] (v2.write/dispatch-write entry {:method "create" :name "X"})))
      (is (thrown-with-msg? Exception #"`name` is required"
                            (v2.write/dispatch-write entry {:method "create"}))))
    (testing "update requires id"
      (is (= [:update 3 {:name "Y"}]
             (v2.write/dispatch-write entry {:method "update" :id 3 :name "Y"})))
      (is (thrown-with-msg? Exception #"`id` is required"
                            (v2.write/dispatch-write entry {:method "update"}))))
    (testing "an unknown method is a teaching error"
      (is (thrown-with-msg? Exception #"create.*update"
                            (v2.write/dispatch-write entry {:method "delete"}))))))

(deftest ^:parallel dispatch-write-clear-test
  (testing "GHY-4191: `clear` expands to explicit nils, the only way to say \"unset this\" — a null
            can't, since the boundary strips nulls that strict clients flood every property with"
    (let [entry {:create-required [:name] :clearable #{:description :cache_ttl}}]
      (testing "a cleared property arrives as a present nil, which the update paths read as \"set to nil\""
        (let [[_ _ args] (v2.write/dispatch-write entry {:method "update" :id 3 :clear ["description"]})]
          (is (contains? args :description))
          (is (nil? (:description args)))
          (is (not (contains? args :clear)))))
      (testing "clearing several at once, alongside an ordinary set"
        (is (= [:update 3 {:name "Y" :description nil :cache_ttl nil}]
               (v2.write/dispatch-write entry {:method "update" :id 3 :name "Y"
                                               :clear ["description" "cache_ttl"]}))))
      (testing "a property that isn't clearable is refused, and the message names what is"
        (is (thrown-with-msg? Exception #"`name` can't be cleared. This tool can clear: cache_ttl, description"
                              (v2.write/dispatch-write entry {:method "update" :id 3 :clear ["name"]}))))
      (testing "setting and clearing the same property in one call is a contradiction"
        (is (thrown-with-msg? Exception #"both set and cleared"
                              (v2.write/dispatch-write entry {:method "update" :id 3
                                                              :description "x" :clear ["description"]}))))
      (testing "clear is update-only — a new object has nothing set to clear"
        (is (thrown-with-msg? Exception #"applies to method \"update\" only"
                              (v2.write/dispatch-write entry {:method "create" :name "X"
                                                              :clear ["description"]}))))
      (testing "an empty or absent clear is a no-op, and never leaves :clear on the args"
        (is (= [:update 3 {:name "Y"}]
               (v2.write/dispatch-write entry {:method "update" :id 3 :name "Y" :clear []})))
        (is (= [:create {:name "X"}]
               (v2.write/dispatch-write entry {:method "create" :name "X" :clear []})))))
    (testing "a tool declaring nothing clearable says so rather than listing an empty set"
      (is (thrown-with-msg? Exception #"no clearable properties"
                            (v2.write/dispatch-write {:create-required []}
                                                     {:method "update" :id 3 :clear ["description"]}))))))
