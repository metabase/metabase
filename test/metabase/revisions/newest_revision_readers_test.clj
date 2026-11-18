(ns ^:synchronized metabase.revisions.newest-revision-readers-test
  "The readers of the newest Revision of a row find it without the `most_recent` flag, which the bookkeeping after a
  write maintains only eventually: while two Revisions of a row are flagged, each reader returns one row, the newer."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.revisions.models.revision.last-edit :as last-edit]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- flag-two-revisions!
  "Insert two Revisions of the `model-name` row with `model-id`, both flagged `most_recent`, the newer by `:lucky`."
  [model-name model-id]
  (doseq [[user timestamp] [[:rasta (t/offset-date-time 2020 1 1)] [:lucky (t/offset-date-time 2021 1 1)]]]
    (t2/insert! :revision {:model        model-name
                           :model_id     model-id
                           :user_id      (mt/user->id user)
                           :timestamp    timestamp
                           :object       "{}"
                           :is_creation  false
                           :is_reversion false
                           :most_recent  true}))
  (is (= 2 (t2/count :revision :model model-name :model_id model-id :most_recent true))))

(deftest last-edit-info-test
  (mt/with-temp [:model/Card      card {}
                 :model/Dashboard dash {}]
    (flag-two-revisions! "Card" (:id card))
    (flag-two-revisions! "Dashboard" (:id dash))
    (testing "the last edit of a list of items is the newer Revision"
      (is (=? [{:last-edit-info {:id (mt/user->id :lucky)}}]
              (last-edit/with-last-edit-info [card] :card))))
    (testing "the bulk last edit info has one entry per item, from the newer Revision"
      (is (=? {:card      {(:id card) {:id (mt/user->id :lucky)}}
               :dashboard {(:id dash) {:id (mt/user->id :lucky)}}}
              (last-edit/fetch-last-edited-info {:card-ids [(:id card)] :dashboard-ids [(:id dash)]}))))))

(deftest collection-items-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Card       card          {:collection_id coll-id :name "Twice flagged card"}
                 :model/Dashboard  dash          {:collection_id coll-id :name "Twice flagged dashboard"}]
    (flag-two-revisions! "Card" (:id card))
    (flag-two-revisions! "Dashboard" (:id dash))
    (testing "a collection lists each item once, with the editor of its newer Revision"
      (is (= [["card" (mt/user->id :lucky)] ["dashboard" (mt/user->id :lucky)]]
             (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/items"))
                  :data
                  (map (juxt :model (comp :id :last-edit-info)))
                  sort))))))

(deftest in-place-search-last-editor-test
  (mt/with-temp [:model/Card card {:name "Twice flagged in-place search card"}]
    (flag-two-revisions! "Card" (:id card))
    (let [search #(->> (apply mt/user-http-request :crowberto :get 200 "search"
                              :q "Twice flagged in-place" :search_engine "in-place" %&)
                       :data
                       (map (juxt :id :last_editor_id)))]
      (testing "a search lists the card once, with the editor of its newer Revision"
        (is (= [[(:id card) (mt/user->id :lucky)]] (search))))
      (testing "a filter by last editor matches the newer Revision's editor only"
        (is (= [[(:id card) (mt/user->id :lucky)]] (search :last_edited_by (mt/user->id :lucky))))
        (is (= [] (search :last_edited_by (mt/user->id :rasta))))))))

(deftest search-spec-last-editor-test
  (search.tu/with-appdb-search-if-available-without-fallback
    (mt/with-temp [:model/Card      card {:name "Twice flagged spec card"}
                   :model/Dashboard dash {:name "Twice flagged spec dashboard"}]
      (flag-two-revisions! "Card" (:id card))
      (flag-two-revisions! "Dashboard" (:id dash))
      (search.ingestion/bulk-ingest! [["card" [:= :this.id (:id card)]]
                                      ["dashboard" [:= :this.id (:id dash)]]])
      (testing "the card and dashboard specs index one document each, with the editor of the newer Revision"
        (is (= [(mt/user->id :lucky)]
               (t2/select-fn-vec :last_editor_id (search.index/active-table)
                                 :model "card" :model_id (str (:id card)))))
        (is (= [(mt/user->id :lucky)]
               (t2/select-fn-vec :last_editor_id (search.index/active-table)
                                 :model "dashboard" :model_id (str (:id dash)))))))))

(deftest collection-explorations-last-edit-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Exploration {exploration-id :id} {:collection_id coll-id :name "Twice flagged exploration"}
                 :model/Exploration {untouched-id :id} {:collection_id coll-id :name "Untouched exploration"}
                 :model/Document {document-id :id} {:collection_id coll-id :name "Summary" :exploration_id exploration-id}]
    (flag-two-revisions! "Exploration" exploration-id)
    (testing "an exploration is listed once, with the editor of its newest Revision, the entities with none still listed"
      (let [items (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/items") :models "exploration")
                       :data
                       (map (juxt :id (comp :id :last-edit-info))))]
        (is (= #{[exploration-id (mt/user->id :lucky)] [untouched-id nil]} (set items)))
        (is (= 2 (count items)))))
    (testing "a Revision of its Summary document newer than its own is the last edit"
      (t2/insert! :revision {:model "Document" :model_id document-id :user_id (mt/user->id :crowberto)
                             :timestamp (t/offset-date-time 2022 1 1) :object "{}" :is_creation false
                             :is_reversion false :most_recent true})
      (is (= [(mt/user->id :crowberto)]
             (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/items") :models "exploration")
                  :data
                  (filter #(= exploration-id (:id %)))
                  (map (comp :id :last-edit-info))))))))
