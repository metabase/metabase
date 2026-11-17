(ns ^:synchronized metabase.events.archive-cascade-records-test
  "The archive or restore of an entity records what a user does to it, while the rows its cascade writes along with it
  record what they recorded before lifecycle events: nothing for Cards, Dashboards and Collections, and a Document's
  update for a Document."
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.revisions.db :as revisions.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- max-id
  [table]
  (or (:id (t2/query-one {:select [[:%max.id :id]] :from [table]})) 0))

(defn- records
  "The audit rows and Revisions, `[topic model model-id]` and `[model model-id]`, written by `thunk` for `entities`,
  a set of `[model-name id]`."
  [entities thunk]
  (let [audit    (max-id :audit_log)
        revision (max-id :revision)]
    (thunk)
    {:audit     (into #{}
                      (comp (filter #(contains? entities [(:model %) (:model_id %)]))
                            (map (juxt :topic :model :model_id)))
                      (t2/query {:select [:topic :model :model_id] :from [:audit_log] :where [:> :id audit]}))
     :revisions (into #{}
                      (comp (filter #(contains? entities [(:model %) (:model_id %)]))
                            (map (juxt :model :model_id)))
                      (t2/query {:select [:model :model_id] :from [:revision] :where [:> :id revision]}))}))

(deftest collection-archive-records-only-documents-test
  (testing "a Collection's archive and restore record a Document update for each Document it carries, and nothing for
            the Cards, Dashboards and Collections"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Collection {coll :id}  {}
                     :model/Collection {child :id} {:location (str "/" coll "/")}
                     :model/Card       {card :id}  {:collection_id coll}
                     :model/Card       {nested :id} {:collection_id child}
                     :model/Dashboard  {dash :id}  {:collection_id coll}
                     :model/Card       {dq :id}    {:collection_id coll :dashboard_id dash}
                     :model/Document   {doc :id}   {:collection_id coll}
                     :model/Card       {dc :id}    {:collection_id coll :document_id doc}]
        (let [entities #{["Collection" coll] ["Collection" child] ["Card" card] ["Card" nested] ["Dashboard" dash]
                         ["Card" dq] ["Document" doc] ["Card" dc]}
              expected {:audit     #{["document-update" "Document" doc]}
                        :revisions #{["Document" doc]}}]
          (is (= expected
                 (records entities #(mt/user-http-request :crowberto :put 200 (str "collection/" coll) {:archived true}))))
          (is (= expected
                 (records entities #(mt/user-http-request :crowberto :put 200 (str "collection/" coll) {:archived false})))))))))

(deftest dashboard-archive-records-only-the-dashboard-test
  (testing "a Dashboard's archive and restore record its Revision and nothing for its dashboard questions"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Dashboard     {dash :id} {}
                     :model/Card          {dq :id}   {:dashboard_id dash}
                     :model/DashboardCard _          {:dashboard_id dash :card_id dq}]
        (let [entities #{["Dashboard" dash] ["Card" dq]}
              expected {:audit #{} :revisions #{["Dashboard" dash]}}]
          (is (= expected
                 (records entities #(mt/user-http-request :crowberto :put 200 (str "dashboard/" dash) {:archived true}))))
          (is (= expected
                 (records entities #(mt/user-http-request :crowberto :put 200 (str "dashboard/" dash) {:archived false})))))))))

(deftest document-archive-records-only-the-document-test
  (testing "a Document's archive and restore record it and nothing for its cards"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Document {doc :id} {}
                     :model/Card     {dc :id}  {:document_id doc}]
        (let [entities #{["Document" doc] ["Card" dc]}]
          (is (= {:audit #{["document-delete" "Document" doc]} :revisions #{["Document" doc]}}
                 (records entities #(mt/user-http-request :crowberto :put 200 (str "document/" doc) {:archived true}))))
          (is (= {:audit #{["document-update" "Document" doc]} :revisions #{["Document" doc]}}
                 (records entities #(mt/user-http-request :crowberto :put 200 (str "document/" doc) {:archived false})))))))))

(deftest cascade-revisions-are-one-insert-test
  (testing "the Revisions of a batch are written by one statement"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {a :id} {}
                     :model/Card {b :id} {}]
        (let [inserts (atom 0)]
          (mt/with-dynamic-fn-redefs [revisions.db/insert-revisions! (let [f (mt/original-fn #'revisions.db/insert-revisions!)]
                                                                       (fn [rows] (swap! inserts inc) (f rows)))]
            (events/with-batched-events
              (t2/update! :model/Card :id a {:name "A2"})
              (t2/update! :model/Card :id b {:name "B2"})))
          (is (= 1 @inserts))
          (is (= 2 (t2/count :model/Revision :model "Card" :model_id [:in [a b]] :is_creation false))))))))
