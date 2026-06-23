(ns metabase.curated-search.models.curated-search-entry-test
  (:require
   [clojure.test :refer :all]
   [metabase.curated-search.mirror :as mirror]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private table-entity {:model "table" :id 42})
(def ^:private ai-context {:instructions "Use for total revenue; group by month."
                           :synonyms     ["sales" "turnover"]
                           :examples     ["monthly revenue by region"]})

(deftest entity-and-ai-context-roundtrip-test
  (testing "entity and ai_context are keywordized JSON objects and timestamps are populated"
    (mt/with-temp [:model/CuratedSearchEntry {:keys [id]}
                   {:entity table-entity :ai_context ai-context}]
      (is (=? {:entity     table-entity
               :ai_context ai-context
               :created_at some?
               :updated_at some?}
              (t2/select-one :model/CuratedSearchEntry :id id))))))

(deftest ai-context-minimal-test
  (testing "ai_context can be a minimal blob (just instructions, no synonyms/examples)"
    (mt/with-temp [:model/CuratedSearchEntry {:keys [id]}
                   {:entity table-entity :ai_context {:instructions "Just this."}}]
      (is (= {:instructions "Just this."}
             (t2/select-one-fn :ai_context :model/CuratedSearchEntry :id id))))))

(deftest hooks-nudge-the-background-sync-test
  (testing "insert, update and delete each request a background sync — and do nothing else"
    (let [nudges (atom 0)]
      (mt/with-dynamic-fn-redefs [mirror/request-sync! (fn [] (swap! nudges inc) nil)]
        (mt/with-temp [:model/CuratedSearchEntry {:keys [id]}
                       {:entity table-entity :ai_context ai-context}]
          (is (= 1 @nudges) "insert nudges once")
          (t2/update! :model/CuratedSearchEntry id {:ai_context {:instructions "changed"}})
          (is (= 2 @nudges) "update nudges once")
          (t2/delete! :model/CuratedSearchEntry :id id)
          (is (= 3 @nudges) "delete nudges once"))))))

(deftest hooks-never-break-appdb-writes-test
  (testing "insert/update/delete succeed even though the mirror is unavailable in tests"
    ;; The hooks call the OSS defenterprise shim, which no-ops without an enterprise license. They must
    ;; never throw or fail the authoritative write.
    (mt/with-temp [:model/CuratedSearchEntry {:keys [id]}
                   {:entity table-entity :ai_context ai-context}]
      (testing "update"
        (is (pos? (t2/update! :model/CuratedSearchEntry id {:ai_context {:instructions "u"}})))
        (is (= {:instructions "u"} (t2/select-one-fn :ai_context :model/CuratedSearchEntry :id id))))
      (testing "delete"
        (is (pos? (t2/delete! :model/CuratedSearchEntry :id id)))
        (is (nil? (t2/select-one :model/CuratedSearchEntry :id id)))))))
