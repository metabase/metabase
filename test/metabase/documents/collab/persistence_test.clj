(ns metabase.documents.collab.persistence-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.collab.persistence :as collab.persistence]
   [metabase.documents.collab.prose-mirror :as collab.prose-mirror]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (net.carcdr.yhocuspocus.extension DatabaseExtension)))

(set! *warn-on-reflection* true)

(deftest ^:parallel parse-doc-name-happy-path-test
  (is (= {:type :document :entity-id "abc123"}
         (collab.persistence/parse-doc-name "document:abc123"))))

(deftest ^:parallel parse-doc-name-rejects-nil-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"document name is required"
                        (collab.persistence/parse-doc-name nil))))

(deftest ^:parallel parse-doc-name-rejects-blank-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"document name is required"
                        (collab.persistence/parse-doc-name "")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"document name is required"
                        (collab.persistence/parse-doc-name "   "))))

(deftest ^:parallel parse-doc-name-rejects-unknown-prefix-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"unsupported document name prefix"
                        (collab.persistence/parse-doc-name "card:xyz")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"unsupported document name prefix"
                        (collab.persistence/parse-doc-name "random-string"))))

(deftest ^:parallel parse-doc-name-rejects-empty-entity-id-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"document name missing entity-id"
                        (collab.persistence/parse-doc-name "document:")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"document name missing entity-id"
                        (collab.persistence/parse-doc-name "document:   "))))

(deftest extension-round-trips-state-test
  (testing "saveToDatabase followed by loadFromDatabase yields bytes equivalent to what was saved"
    (mt/with-temp [:model/Document {entity-id :entity_id}
                   {:name     "Round trip"
                    :document {:type "doc" :content []}}]
      (let [ext     ^DatabaseExtension (collab.persistence/create-persistence-extension)
            doc-id  (str "document:" entity-id)
            pm      {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "round trip"}]}]}
            payload (collab.prose-mirror/pm-json->ydoc-bytes pm)]
        (.saveToDatabase ext doc-id payload)
        (let [loaded (.loadFromDatabase ext doc-id)]
          (is (some? loaded))
          (is (= pm (collab.prose-mirror/ydoc-bytes->pm-json loaded))))))))

(deftest extension-load-empty-document-returns-empty-state-test
  (testing "loadFromDatabase for a document with empty JSON and no ydoc returns minimal-state bytes"
    ;; Old behaviour was nil. With hydration, an empty PM doc `{:type "doc" :content []}`
    ;; hydrates to a valid (empty) YDoc state, which is what yhocuspocus wants.
    (mt/with-temp [:model/Document {entity-id :entity_id}
                   {:name "Empty-doc fresh" :document {:type "doc" :content []}}]
      (let [ext   ^DatabaseExtension (collab.persistence/create-persistence-extension)
            bytes (.loadFromDatabase ext (str "document:" entity-id))]
        (is (some? bytes))
        (is (= {:type "doc" :content []}
               (collab.prose-mirror/ydoc-bytes->pm-json bytes)))))))

(deftest extension-load-returns-nil-for-unknown-entity-test
  (let [ext ^DatabaseExtension (collab.persistence/create-persistence-extension)]
    (is (nil? (.loadFromDatabase ext "document:does-not-exist-xyz")))))

(deftest extension-propagates-parse-errors-test
  (testing "unknown prefix surfaces as a thrown exception (yhocuspocus retries on error)"
    (let [ext ^DatabaseExtension (collab.persistence/create-persistence-extension)]
      (is (thrown? clojure.lang.ExceptionInfo
                   (.loadFromDatabase ext "card:whatever")))
      (is (thrown? clojure.lang.ExceptionInfo
                   (.saveToDatabase  ext "card:whatever" (byte-array 0)))))))

(deftest save-to-database-emits-document-update-event-test
  (testing "saveToDatabase fires :event/document-update on success"
    (mt/with-temp [:model/Document {entity-id :entity_id}
                   {:name "Event emission" :document {:type "doc" :content []}}]
      (let [captured (atom [])
            payload  (collab.prose-mirror/pm-json->ydoc-bytes
                      {:type "doc" :content [{:type "paragraph"
                                              :content [{:type "text" :text "x"}]}]})]
        (with-redefs [events/publish-event! (fn [topic event] (swap! captured conj [topic event]))]
          (.saveToDatabase ^DatabaseExtension (collab.persistence/create-persistence-extension)
                           (str "document:" entity-id)
                           payload))
        (is (= 1 (count @captured)))
        (is (= :event/document-update (ffirst @captured)))
        (is (= entity-id (get-in (second (first @captured)) [:object :entity_id])))))))

(deftest save-to-database-populates-document-json-test
  (testing "dual-write: saveToDatabase writes both :ydoc bytes and derived PM JSON"
    (let [pm {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "initial"}]}]}]
      (mt/with-temp [:model/Document {entity-id :entity_id, doc-id :id}
                     {:name "Dual-written" :document pm}]
        (let [ext        ^DatabaseExtension (collab.persistence/create-persistence-extension)
              ;; Build realistic ydoc bytes by round-tripping a different PM JSON through the converter.
              new-pm     {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "edited"}]}]}
              state-bytes (collab.prose-mirror/pm-json->ydoc-bytes new-pm)]
          (.saveToDatabase ext (str "document:" entity-id) state-bytes)
          (let [{:keys [ydoc document]} (t2/select-one [:model/Document :ydoc :document] :id doc-id)]
            (is (some? ydoc))
            (is (= "edited" (get-in document [:content 0 :content 0 :text]))
                "document JSON reflects the new ydoc state")))))))

(deftest load-from-database-hydrates-from-pm-json-test
  (testing "loadFromDatabase hydrates bytes from existing :document JSON when :ydoc is nil"
    (let [pm {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "prehydrated"}]}]}]
      (mt/with-temp [:model/Document {entity-id :entity_id} {:name "Prehydrated" :document pm}]
        (let [ext   ^DatabaseExtension (collab.persistence/create-persistence-extension)
              bytes (.loadFromDatabase ext (str "document:" entity-id))]
          (is (some? bytes))
          (let [round-tripped (collab.prose-mirror/ydoc-bytes->pm-json bytes)]
            (is (= "prehydrated" (get-in round-tripped [:content 0 :content 0 :text])))))))))
