(ns metabase.documents.collab.persistence-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.collab.persistence :as collab.persistence]
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

(deftest extension-round-trips-bytes-test
  (testing "saveToDatabase followed by loadFromDatabase returns the exact bytes"
    (mt/with-temp [:model/Document {entity-id :entity_id}
                   {:name     "Round trip"
                    :document {:type "doc" :content []}}]
      (let [ext     ^DatabaseExtension (collab.persistence/create-persistence-extension)
            doc-id  (str "document:" entity-id)
            payload (byte-array [0 1 2 3 42 127 -1 -128])]
        (.saveToDatabase ext doc-id payload)
        (is (= (vec payload)
               (vec (.loadFromDatabase ext doc-id))))))))

(deftest extension-load-returns-nil-for-fresh-document-test
  (testing "loadFromDatabase returns nil when no ydoc has been saved yet"
    (mt/with-temp [:model/Document {entity-id :entity_id}
                   {:name "Fresh" :document {:type "doc" :content []}}]
      (let [ext ^DatabaseExtension (collab.persistence/create-persistence-extension)]
        (is (nil? (.loadFromDatabase ext (str "document:" entity-id))))))))

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
      (let [captured (atom [])]
        (with-redefs [events/publish-event! (fn [topic event] (swap! captured conj [topic event]))]
          (.saveToDatabase ^DatabaseExtension (collab.persistence/create-persistence-extension)
                           (str "document:" entity-id)
                           (byte-array [9 9 9])))
        (is (= 1 (count @captured)))
        (is (= :event/document-update (ffirst @captured)))
        (is (= entity-id (get-in (second (first @captured)) [:object :entity_id])))))))

(deftest save-to-database-leaves-document-json-untouched-test
  (testing "ydoc-only save does NOT clobber the ProseMirror JSON column"
    (let [pm {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Hello"}]}]}]
      (mt/with-temp [:model/Document {entity-id :entity_id, doc-id :id}
                     {:name "Untouched JSON" :document pm}]
        (.saveToDatabase ^DatabaseExtension (collab.persistence/create-persistence-extension)
                         (str "document:" entity-id)
                         (byte-array [1 2 3]))
        (is (= pm (t2/select-one-fn :document :model/Document :id doc-id)))))))
