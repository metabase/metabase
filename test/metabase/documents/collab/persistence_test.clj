(ns metabase.documents.collab.persistence-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.documents.collab.persistence :as collab.persistence]
   [metabase.documents.collab.prose-mirror :as collab.prose-mirror]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (net.carcdr.ycrdt UpdateObserver YBindingFactory YDoc)
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

;;; ---------------------------------------------------------------
;;; onStoreDocument card-cloning tests
;;; ---------------------------------------------------------------

(defn- ^YDoc ydoc-from-pm [pm]
  (let [binding (YBindingFactory/auto)
        doc     (.createDoc binding)]
    (.applyUpdate doc (collab.prose-mirror/pm-json->ydoc-bytes pm))
    doc))

(defn- ast-card-ids [doc-map]
  (->> (get-in doc-map [:content])
       (keep #(get-in % [:attrs :id]))))

(deftest save-with-cloning-clones-unowned-card-test
  (testing "save-with-cloning! clones a referenced card that isn't owned by the doc and rewrites the id in both the PM JSON column and the ydoc bytes"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {source-card-id :id} {:name "Source"
                                                       :collection_id coll-id
                                                       :dataset_query (mt/mbql-query venues)}
                     :model/Document {doc-id :id, entity-id :entity_id}
                     {:name "Clone target"
                      :collection_id coll-id
                      :document {:type "doc"
                                 :content [{:type "cardEmbed"
                                            :attrs {:id source-card-id :name nil}}]}}]
        (let [ydoc (ydoc-from-pm {:type "doc"
                                  :content [{:type "cardEmbed"
                                             :attrs {:id source-card-id :name nil}}]})]
          (try
            (@#'collab.persistence/save-with-cloning! entity-id (mt/user->id :crowberto) ydoc)
            (finally (.close ydoc))))
        (let [owned (t2/select :model/Card :document_id doc-id)
              row   (t2/select-one [:model/Document :document :ydoc] :id doc-id)
              new-id (:id (first owned))]
          (is (= 1 (count owned))
              "exactly one card row now belongs to the document")
          (is (not= source-card-id new-id)
              "the clone has a new id, leaving the original untouched")
          (is (= [new-id] (ast-card-ids (:document row)))
              "saved PM JSON references the clone")
          (is (= [new-id]
                 (ast-card-ids (collab.prose-mirror/ydoc-bytes->pm-json (:ydoc row))))
              "saved ydoc bytes decode to the clone id"))))))

(deftest save-with-cloning-no-op-when-no-embeds-test
  (testing "pure-text YDocs skip cloning and behave identically to save-snapshot!"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Document {doc-id :id, entity-id :entity_id}
                     {:name "Plain text" :document {:type "doc" :content []}}]
        (let [ydoc (ydoc-from-pm {:type "doc"
                                  :content [{:type "paragraph"
                                             :content [{:type "text" :text "just words"}]}]})]
          (try
            (@#'collab.persistence/save-with-cloning! entity-id (mt/user->id :crowberto) ydoc)
            (finally (.close ydoc))))
        (is (zero? (t2/count :model/Card :document_id doc-id))
            "no cards were created")
        (is (= "just words"
               (-> (t2/select-one [:model/Document :document] :id doc-id)
                   :document
                   (get-in [:content 0 :content 0 :text])))
            "PM JSON persisted unchanged")))))

(deftest save-with-cloning-skips-unreadable-cards-test
  (testing "a per-card read-check failure is skipped and logged, not aborted; other embeds still clone"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {readable-id :id} {:name "Readable"
                                                    :collection_id coll-id
                                                    :dataset_query (mt/mbql-query venues)}
                     :model/Card {forbidden-id :id} {:name "Forbidden"
                                                     :collection_id coll-id
                                                     :dataset_query (mt/mbql-query users)}
                     :model/Document {doc-id :id, entity-id :entity_id}
                     {:name "Mixed"
                      :collection_id coll-id
                      :document {:type "doc"
                                 :content [{:type "cardEmbed" :attrs {:id readable-id :name nil}}
                                           {:type "cardEmbed" :attrs {:id forbidden-id :name nil}}]}}]
        (let [orig api/read-check]
          (with-redefs [api/read-check (fn [& args]
                                         (let [obj (first args)]
                                           (if (and (map? obj)
                                                    (= forbidden-id (:id obj))
                                                    (:dataset_query obj))
                                             (throw (ex-info "denied" {:status-code 403}))
                                             (apply orig args))))]
            (let [ydoc (ydoc-from-pm {:type "doc"
                                      :content [{:type "cardEmbed"
                                                 :attrs {:id readable-id :name nil}}
                                                {:type "cardEmbed"
                                                 :attrs {:id forbidden-id :name nil}}]})]
              (try
                (@#'collab.persistence/save-with-cloning! entity-id (mt/user->id :crowberto) ydoc)
                (finally (.close ydoc))))))
        (let [owned (t2/select :model/Card :document_id doc-id)
              saved (-> (t2/select-one [:model/Document :document] :id doc-id)
                        :document
                        ast-card-ids
                        set)]
          (is (= 1 (count owned))
              "only the readable card was cloned")
          (is (contains? saved forbidden-id)
              "forbidden embed still points at the original card")
          (is (contains? saved (:id (first owned)))
              "readable embed now points at its clone"))))))

(deftest save-with-cloning-is-idempotent-test
  (testing "once cloned, a second save finds no unowned cards and creates nothing new"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {source-card-id :id} {:name "Source"
                                                       :collection_id coll-id
                                                       :dataset_query (mt/mbql-query venues)}
                     :model/Document {doc-id :id, entity-id :entity_id}
                     {:name "Idempotent"
                      :collection_id coll-id
                      :document {:type "doc"
                                 :content [{:type "cardEmbed"
                                            :attrs {:id source-card-id :name nil}}]}}]
        (let [ydoc (ydoc-from-pm {:type "doc"
                                  :content [{:type "cardEmbed"
                                             :attrs {:id source-card-id :name nil}}]})]
          (try
            (@#'collab.persistence/save-with-cloning! entity-id (mt/user->id :crowberto) ydoc)
            (@#'collab.persistence/save-with-cloning! entity-id (mt/user->id :crowberto) ydoc)
            (finally (.close ydoc))))
        (is (= 1 (t2/count :model/Card :document_id doc-id))
            "second save is a no-op — the first clone already owns the embed")))))

(deftest ^:parallel rewrite-card-embed-ids-single-broadcast-test
  (testing "rewriting N cardEmbed ids inside one YTransaction fires observeUpdateV1 once"
    (let [pm {:type "doc"
              :content [{:type "cardEmbed" :attrs {:id 10 :name nil}}
                        {:type "cardEmbed" :attrs {:id 20 :name nil}}
                        {:type "cardEmbed" :attrs {:id 30 :name nil}}]}
          ydoc (ydoc-from-pm pm)
          fires (atom 0)
          sub   (.observeUpdateV1 ydoc
                                  (reify UpdateObserver
                                    (onUpdate [_ _update _origin]
                                      (swap! fires inc))))]
      (try
        (@#'collab.persistence/rewrite-card-embed-ids! ydoc {10 100, 20 200, 30 300})
        (is (= 1 @fires) "one broadcast for the whole batch")
        (is (= [100 200 300]
               (sort (ast-card-ids (collab.prose-mirror/ydoc-bytes->pm-json
                                    (.encodeStateAsUpdate ydoc)))))
            "all three ids were rewritten")
        (finally
          (.close sub)
          (.close ydoc))))))
