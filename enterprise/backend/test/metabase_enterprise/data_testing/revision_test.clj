(ns metabase-enterprise.data-testing.revision-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.models]
   [metabase-enterprise.data-testing.models.card-test]
   [metabase-enterprise.data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.events]
   [metabase.revisions.models.revision.diff :as revision.diff]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest transform-test-revision-serialization-test
  (let [transform-test (t2/instance :model/TransformTest
                                    {:id           1
                                     :entity_id    "test-entity-id"
                                     :transform_id 2
                                     :creator_id   3
                                     :name         "No nulls"
                                     :description  "Checks the output"
                                     :inputs       []
                                     :expectations []
                                     :created_at   :not-revisioned
                                     :updated_at   :not-revisioned})]
    (is (= {:transform_id 2
            :name         "No nulls"
            :description  "Checks the output"
            :inputs       []
            :expectations []}
           (revisions/serialize-instance :model/TransformTest 1 transform-test)))))

(deftest transform-test-create-and-update-revisions-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {transform-test-id :id} {:transform_id transform-id
                                                                 :creator_id   (mt/user->id :crowberto)
                                                                 :name         "Original"}]
      (testing "creation records the initial revision"
        (let [[creation] (revisions/revisions :model/TransformTest transform-test-id)]
          (is (true? (:is_creation creation)))
          (is (= "Original" (get-in creation [:object :name])))
          (is (= (mt/user->id :crowberto) (:user_id creation)))))
      (testing "an update records the changed editable fields"
        (t2/update! :model/TransformTest :id transform-test-id {:name "Renamed"})
        (let [[updated creation] (revisions/revisions :model/TransformTest transform-test-id)]
          (is (= "Renamed" (get-in updated [:object :name])))
          (is (false? (:is_creation updated)))
          (is (= "Original" (get-in creation [:object :name]))))))))

(deftest transform-test-revision-revert-test
  (mt/with-premium-features #{:transforms-basic :transforms-testing}
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Transform     {transform-id :id} {}
                       :model/TransformTest {transform-test-id :id} {:transform_id transform-id
                                                                     :name         "Original"}]
          (t2/update! :model/TransformTest :id transform-test-id {:name "Renamed"})
          (let [creation (last (revisions/revisions :model/TransformTest transform-test-id))]
            (mt/user-http-request :crowberto :post 200 "revision/revert"
                                  {:entity      "transform-test"
                                   :id          transform-test-id
                                   :revision_id (:id creation)})
            (testing "the saved test is restored"
              (is (= "Original" (t2/select-one-fn :name :model/TransformTest :id transform-test-id))))
            (testing "the reversion is recorded after the model update revision"
              (let [[reversion reverted-update update creation]
                    (revisions/revisions :model/TransformTest transform-test-id)]
                (is (= 4 (count (revisions/revisions :model/TransformTest transform-test-id))))
                (is (true? (:is_reversion reversion)))
                (is (= "Original" (get-in reversion [:object :name])))
                (is (false? (:is_reversion reverted-update)))
                (is (= "Original" (get-in reverted-update [:object :name])))
                (is (= "Renamed" (get-in update [:object :name])))
                (is (true? (:is_creation creation)))))))))))

(deftest transform-test-runs-are-not-revisioned-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {transform-test-id :id} {:transform_id transform-id}]
      (let [{run-id :id} (data-testing.run-tracking/start-run! :transform transform-test-id (mt/user->id :crowberto))]
        (try
          (data-testing.run-tracking/finish-run! run-id :passed)
          (is (zero? (t2/count :model/Revision :model "DataTestRun" :model_id run-id)))
          (finally
            (t2/delete! :model/DataTestRun :id run-id)))))))

(deftest transform-test-revision-history-api-test
  (testing "GET /api/revision/transform-test/:id describes a rename"
    (mt/with-premium-features #{:transforms-basic :transforms-testing}
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/Transform     {transform-id :id} {}
                         :model/TransformTest {transform-test-id :id} {:transform_id transform-id
                                                                       :name         "Original"}]
            (t2/update! :model/TransformTest :id transform-test-id {:name "Renamed"})
            (is (=? [{:is_creation false
                      :description "renamed this Transform test from \"Original\" to \"Renamed\"."}
                     {:is_creation true
                      :description "created this."}]
                    (mt/user-http-request :crowberto :get 200 (str "revision/transform-test/" transform-test-id))))))))))

(deftest transform-test-revision-history-without-display-name-api-test
  (testing "GET /api/revision/transform-test/:id loads when the model has no display name"
    (mt/with-premium-features #{:transforms-basic :transforms-testing}
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/Transform     {transform-id :id} {}
                         :model/TransformTest {transform-test-id :id} {:transform_id transform-id
                                                                       :name         "Original"}]
            (t2/update! :model/TransformTest :id transform-test-id {:name "Renamed"})
            (mt/with-dynamic-fn-redefs [revision.diff/model-str->i18n-str
                                        (fn [model-str]
                                          (throw (IllegalArgumentException. (str "No matching clause: " model-str))))]
              (mt/with-log-messages-for-level [messages [metabase.revisions.models.revision.diff :warn]]
                (is (=? [{:is_creation false
                          :description "renamed this TransformTest from \"Original\" to \"Renamed\"."}
                         {:is_creation true
                          :description "created this."}]
                        (mt/user-http-request :crowberto :get 200 (str "revision/transform-test/" transform-test-id))))
                (is (=? [{:level :warn, :message #".*TransformTest.*"}]
                        (messages)))))))))))

;;; ------------------------------------------------- Card tests -------------------------------------------------

(deftest card-test-revision-serialization-test
  (let [card-test (t2/instance :model/CardTest
                               {:id           1
                                :entity_id    "test-entity-id"
                                :card_id      2
                                :creator_id   3
                                :name         "No nulls"
                                :description  "Checks the output"
                                :inputs       []
                                :expectations []
                                :created_at   :not-revisioned
                                :updated_at   :not-revisioned})]
    (is (= {:card_id      2
            :name         "No nulls"
            :description  "Checks the output"
            :inputs       []
            :expectations []}
           (revisions/serialize-instance :model/CardTest 1 card-test)))))

(deftest card-test-create-and-update-revisions-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card     {card-id :id}      {}
                   :model/CardTest {card-test-id :id} {:card_id    card-id
                                                       :creator_id (mt/user->id :crowberto)
                                                       :name       "Original"}]
      (testing "creation records the initial revision"
        (let [[creation :as revisions] (revisions/revisions :model/CardTest card-test-id)]
          (is (= 1 (count revisions)))
          (is (=? {:is_creation true
                   :user_id     (mt/user->id :crowberto)
                   :object      {:card_id card-id :name "Original"}}
                  creation))))
      (testing "an update records the changed editable fields"
        (t2/update! :model/CardTest :id card-test-id {:name "Renamed"})
        (let [[updated creation] (revisions/revisions :model/CardTest card-test-id)]
          (is (=? {:is_creation false :object {:name "Renamed"}} updated))
          (is (=? {:is_creation true :object {:name "Original"}} creation)))))))

(deftest card-test-revision-revert-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card     {card-id :id}      {}
                     :model/CardTest {card-test-id :id} {:card_id card-id
                                                         :name    "Original"}]
        (t2/update! :model/CardTest :id card-test-id {:name "Renamed"})
        (let [creation (last (revisions/revisions :model/CardTest card-test-id))]
          (mt/user-http-request :crowberto :post 200 "revision/revert"
                                {:entity      "card-test"
                                 :id          card-test-id
                                 :revision_id (:id creation)})
          (testing "the saved test is restored"
            (is (= "Original" (t2/select-one-fn :name :model/CardTest :id card-test-id))))
          (testing "the reversion is recorded after the model update revision"
            (let [[reversion reverted-update update creation :as all]
                  (revisions/revisions :model/CardTest card-test-id)]
              (is (= 4 (count all)))
              (is (=? {:is_reversion true :object {:name "Original"}} reversion))
              (is (=? {:is_reversion false :object {:name "Original"}} reverted-update))
              (is (=? {:object {:name "Renamed"}} update))
              (is (=? {:is_creation true} creation)))))))))

(deftest card-test-revert-checks-the-reverted-state-test
  (mt/with-premium-features #{:transforms-testing}
    (testing "Reverting a card test to a revision about a card the user may not edit is refused"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {writable :id}  {}
                       :model/Collection {readable :id}  {}
                       :model/Card       {old-card :id}  {:collection_id readable
                                                          :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                       :model/Card       {new-card :id}  {:collection_id writable
                                                          :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable)
          (perms/grant-collection-read-permissions! (perms-group/all-users) readable)
          (mt/with-current-user (mt/user->id :crowberto)
            (mt/with-temp [:model/CardTest {card-test-id :id} {:card_id old-card}]
              (t2/update! :model/CardTest :id card-test-id {:card_id new-card})
              (let [creation (last (revisions/revisions :model/CardTest card-test-id))]
                (testing "premise: rasta may edit the test as it is now"
                  (mt/with-current-user (mt/user->id :rasta)
                    (is (true? (boolean (mi/can-write? :model/CardTest card-test-id))))))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :post 403 "revision/revert"
                                             {:entity      "card-test"
                                              :id          card-test-id
                                              :revision_id (:id creation)})))
                (testing "the test still covers the card rasta may edit"
                  (is (= new-card (t2/select-one-fn :card_id :model/CardTest :id card-test-id))))))))))))

(deftest card-test-runs-are-not-revisioned-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card     {card-id :id}      {}
                   :model/CardTest {card-test-id :id} {:card_id card-id}]
      (mt/with-log-messages-for-level [messages [metabase.revisions.events :warn]]
        (let [revision-count #(t2/count :model/Revision :model "CardTest" :model_id card-test-id)
              before         (revision-count)
              {run-id :id}   (data-testing.run-tracking/start-run! :card card-test-id (mt/user->id :crowberto))]
          (try
            (data-testing.run-tracking/finish-run! run-id :passed)
            (testing "the run adds no revision to the test"
              (is (= before (revision-count))))
            ;; A run event routed to the card-test revision handler fails there and is only logged.
            (testing "no run event reaches a revision handler"
              (is (= [] (messages))))
            (testing "the test has only its creation revision"
              (is (=? [{:is_creation true}] (revisions/revisions :model/CardTest card-test-id))))
            (finally
              (t2/delete! :model/DataTestRun :id run-id))))))))

(deftest card-test-revision-history-api-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card     {card-id :id}      {}
                     :model/CardTest {card-test-id :id} {:card_id card-id
                                                         :name    "Original"}]
        (t2/update! :model/CardTest :id card-test-id {:name "Renamed"})
        (let [expected [{:is_creation false
                         :description "renamed this Card test from \"Original\" to \"Renamed\"."}
                        {:is_creation true
                         :description "created this."}]]
          (testing "GET /api/revision?entity=card-test"
            (is (=? expected
                    (mt/user-http-request :crowberto :get 200 "revision" :entity "card-test" :id card-test-id))))
          (testing "GET /api/revision/card-test/:id"
            (is (=? expected
                    (mt/user-http-request :crowberto :get 200 (str "revision/card-test/" card-test-id)))))
          (testing "a non-admin who can read the card reads the history"
            (is (=? expected
                    (mt/user-http-request :rasta :get 200 (str "revision/card-test/" card-test-id)))))
          (testing "a user who cannot read the card cannot read the history"
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp [:model/Collection {coll-id :id} {}]
                (t2/update! :model/Card :id card-id {:collection_id coll-id})
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :get 403 "revision" :entity "card-test" :id card-test-id)))))))))))

(deftest card-test-revision-history-hides-revisions-about-unreadable-cards-test
  (mt/with-premium-features #{:transforms-testing}
    (testing "A non-admin who may read the test's current card does not see a revision about an older card they may not read"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {readable :id}     {}
                       :model/Collection {hidden :id}       {}
                       :model/Card       {hidden-card :id}  {:collection_id hidden}
                       :model/Card       {visible-card :id} {:collection_id readable}]
          (perms/grant-collection-read-permissions! (perms-group/all-users) readable)
          (mt/with-current-user (mt/user->id :crowberto)
            (mt/with-temp [:model/CardTest {card-test-id :id} {:card_id hidden-card :name "Hidden name"}]
              (t2/update! :model/CardTest :id card-test-id {:card_id visible-card :name "Visible name"})
              (testing "control: an admin sees both revisions"
                (let [history (mt/user-http-request :crowberto :get 200 (str "revision/card-test/" card-test-id))]
                  (is (= 2 (count history)))
                  (is (re-find #"Hidden name" (pr-str history)))))
              (let [history (mt/user-http-request :rasta :get 200 (str "revision/card-test/" card-test-id))]
                (is (=? [{:is_creation false :diff nil}] history))
                (is (= 1 (count history)))
                (is (not (re-find #"Hidden name" (pr-str history))))))))))))

(deftest card-test-revision-history-after-the-old-card-is-deleted-test
  (mt/with-premium-features #{:transforms-testing}
    (testing (str "After a card test moves to another card and the old card is deleted, the history loads, and a non-admin "
                  "sees only the revision about the card that exists")
      (mt/with-temp [:model/Card {old-card :id} {}
                     :model/Card {new-card :id} {}]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/CardTest {card-test-id :id} {:card_id old-card :name "On the old card"}]
            (t2/update! :model/CardTest :id card-test-id {:card_id new-card :name "On the new card"})
            (t2/delete! :model/Card :id old-card)
            (testing "premise: the old card is gone and the test remains"
              (is (not (t2/exists? :model/Card :id old-card)))
              (is (t2/exists? :model/CardTest :id card-test-id)))
            (testing "an admin"
              (testing "GET /api/revision/card-test/:id"
                (is (=? {:status 200 :body [{:is_creation false}]}
                        (mt/user-http-request-full-response :crowberto :get (str "revision/card-test/" card-test-id)))))
              (testing "GET /api/revision?entity=card-test"
                (is (=? {:status 200 :body [{:is_creation false}]}
                        (mt/user-http-request-full-response :crowberto :get "revision"
                                                            :entity "card-test" :id card-test-id)))))
            (testing "a non-admin"
              (let [history (mt/user-http-request :rasta :get 200 (str "revision/card-test/" card-test-id))]
                (is (=? [{:is_creation false}] history))
                (is (= 1 (count history)))
                (is (not (re-find #"On the old card" (pr-str history))))))))))))

(deftest card-test-revert-by-a-user-who-may-edit-both-cards-test
  (mt/with-premium-features #{:transforms-testing}
    (testing "A non-admin who may edit the current and the reverted card reverts a card test"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {writable :id} {}
                       :model/Card       {old-card :id} {:collection_id writable
                                                         :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                       :model/Card       {new-card :id} {:collection_id writable
                                                         :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable)
          (mt/with-current-user (mt/user->id :crowberto)
            (mt/with-temp [:model/CardTest {card-test-id :id} {:card_id old-card}]
              (t2/update! :model/CardTest :id card-test-id {:card_id new-card})
              (let [creation (last (revisions/revisions :model/CardTest card-test-id))]
                (mt/user-http-request :rasta :post 200 "revision/revert"
                                      {:entity      "card-test"
                                       :id          card-test-id
                                       :revision_id (:id creation)})
                (is (= old-card (t2/select-one-fn :card_id :model/CardTest :id card-test-id)))))))))))

(defn- check-revert-requires-the-feature
  "Check that a revert of the saved test `test-id` of `model`, the revision entity `entity`, is refused with 402 under
  the premium features `without` and done under `with`, while both history endpoints serve its revisions under both.
  The test's name must be \"Renamed\", its oldest revision \"Original\"."
  [model entity test-id without with]
  (let [creation-id (:id (last (revisions/revisions model test-id)))
        revert      {:entity entity :id test-id :revision_id creation-id}
        history     (fn []
                      (testing "both history endpoints serve the revisions"
                        (is (=? [{:is_creation false} {:is_creation true}]
                                (mt/user-http-request :crowberto :get 200 "revision" :entity entity :id test-id)))
                        (is (=? [{:is_creation false} {:is_creation true}]
                                (mt/user-http-request :crowberto :get 200 (str "revision/" entity "/" test-id))))))]
    (testing (str "without :transforms-testing, a revert of a " entity " is refused")
      (mt/with-premium-features without
        (history)
        (mt/assert-has-premium-feature-error
         "Transforms Testing"
         (mt/user-http-request :crowberto :post 402 "revision/revert" revert)))
      (is (= "Renamed" (t2/select-one-fn :name model :id test-id))))
    (testing (str "with :transforms-testing, a " entity " is reverted")
      (mt/with-premium-features with
        (history)
        (mt/user-http-request :crowberto :post 200 "revision/revert" revert)
        (is (= "Original" (t2/select-one-fn :name model :id test-id)))))))

(deftest transform-test-revert-requires-feature-test
  (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Transform     {transform-id :id} {}
                     :model/TransformTest {transform-test-id :id} {:transform_id transform-id
                                                                   :name         "Original"}]
        (t2/update! :model/TransformTest :id transform-test-id {:name "Renamed"})
        (check-revert-requires-the-feature :model/TransformTest "transform-test" transform-test-id
                                           #{:transforms-basic} #{:transforms-basic :transforms-testing})))))

(deftest card-test-revert-requires-feature-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card     {card-id :id}      {}
                   :model/CardTest {card-test-id :id} {:card_id card-id
                                                       :name    "Original"}]
      (t2/update! :model/CardTest :id card-test-id {:name "Renamed"})
      (check-revert-requires-the-feature :model/CardTest "card-test" card-test-id #{} #{:transforms-testing}))))

(deftest card-test-revert-of-a-test-of-a-card-with-no-query-test
  (mt/with-premium-features #{:transforms-testing}
    (testing "A non-admin who may edit a card with no query is refused a revert of its test"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {coll :id}    {}
                       :model/Card       {card-id :id} {:collection_id coll :dataset_query {}}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll)
          (mt/with-current-user (mt/user->id :crowberto)
            (mt/with-temp [:model/CardTest {card-test-id :id} {:card_id card-id :name "Original"}]
              (t2/update! :model/CardTest :id card-test-id {:name "Renamed"})
              (let [creation (last (revisions/revisions :model/CardTest card-test-id))
                    body     {:entity "card-test" :id card-test-id :revision_id (:id creation)}]
                (testing "premise: the card has no query and rasta may edit the card"
                  (is (= {} (t2/select-one-fn :dataset_query :model/Card :id card-id)))
                  (mt/with-current-user (mt/user->id :rasta)
                    (is (true? (boolean (mi/can-write? :model/Card card-id))))))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :post 403 "revision/revert" body)))
                (is (= "Renamed" (t2/select-one-fn :name :model/CardTest :id card-test-id)))
                (testing "control: an admin reverts"
                  (mt/user-http-request :crowberto :post 200 "revision/revert" body)
                  (is (= "Original" (t2/select-one-fn :name :model/CardTest :id card-test-id))))))))))))

(deftest card-test-revert-without-the-feature-answers-402-before-the-write-check-test
  (testing "Without :transforms-testing, a non-admin who cannot read the card gets 402 for a revert, also of a missing id"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll :id}    {}
                     :model/Card       {card-id :id} {:collection_id coll}]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/CardTest {card-test-id :id} {:card_id card-id :name "Original"}]
            (t2/update! :model/CardTest :id card-test-id {:name "Renamed"})
            (let [creation-id (:id (last (revisions/revisions :model/CardTest card-test-id)))
                  missing-id  (inc (t2/select-one-fn :id :model/CardTest {:order-by [[:id :desc]]}))
                  history     (fn [id]
                                [[:get "revision" :entity "card-test" :id id]
                                 [:get (str "revision/card-test/" id)]])
                  revert      (fn [id] [:post "revision/revert" {:entity "card-test" :id id :revision_id creation-id}])
                  refusals    (fn [requests]
                                (doseq [[id status] [[card-test-id 403] [missing-id 404]]
                                        [method & args] (requests id)]
                                  (testing (str method " " (first args) " " id)
                                    (apply mt/user-http-request :rasta method status args))))]
              (testing "premise: rasta may not read the test, and the missing id names no test"
                (mt/with-current-user (mt/user->id :rasta)
                  (is (false? (boolean (mi/can-read? :model/CardTest card-test-id)))))
                (is (not (t2/exists? :model/CardTest :id missing-id))))
              (testing "control: with the feature, the read and write checks refuse rasta"
                (mt/with-premium-features #{:transforms-testing}
                  (refusals #(conj (history %) (revert %)))))
              (mt/with-premium-features #{}
                (testing "without the feature, the history endpoints give their usual refusals"
                  (refusals history))
                (testing "without the feature, a revert gets 402 before any check of the test"
                  (doseq [id [card-test-id missing-id]]
                    (let [[method & args] (revert id)]
                      (testing (str method " " (first args) " " id)
                        (mt/assert-has-premium-feature-error
                         "Transforms Testing"
                         (apply mt/user-http-request :rasta method 402 args)))))))
              (is (= "Renamed" (t2/select-one-fn :name :model/CardTest :id card-test-id))))))))))

(deftest card-test-revert-to-a-revision-about-a-deleted-card-test
  (mt/with-premium-features #{:transforms-testing}
    (testing "Reverting a card test to a revision about a deleted card is refused and changes nothing"
      (mt/with-temp [:model/Card {old-card :id} {}
                     :model/Card {new-card :id} {}]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/CardTest {card-test-id :id} {:card_id old-card :name "On the old card"}]
            (t2/update! :model/CardTest :id card-test-id {:card_id new-card :name "On the new card"})
            (let [creation (last (revisions/revisions :model/CardTest card-test-id))]
              (t2/delete! :model/Card :id old-card)
              (testing "premise: the revision names the deleted card, and the test remains"
                (is (= old-card (get-in creation [:object :card_id])))
                (is (not (t2/exists? :model/Card :id old-card)))
                (is (t2/exists? :model/CardTest :id card-test-id)))
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :crowberto :post 403 "revision/revert"
                                           {:entity      "card-test"
                                            :id          card-test-id
                                            :revision_id (:id creation)})))
              (is (= {:card_id new-card :name "On the new card"}
                     (t2/select-one [:model/CardTest :card_id :name] :id card-test-id))))))))))

(deftest card-test-update-revision-records-the-acting-user-test
  (mt/with-premium-features #{:transforms-testing}
    (testing "An update through the API records the user who made it, not the test's creator"
      (mt/with-temp [:model/Card     {card-id :id}      {}
                     :model/CardTest {card-test-id :id} {:card_id    card-id
                                                         :creator_id (mt/user->id :rasta)
                                                         :name       "Original"}]
        (testing "premise: the creation revision names the creator"
          (is (=? [{:is_creation true :user_id (mt/user->id :rasta)}]
                  (revisions/revisions :model/CardTest card-test-id))))
        (mt/user-http-request :crowberto :put 200 (str "ee/card-test/" card-test-id) {:name "Renamed"})
        (is (=? [{:is_creation false :user_id (mt/user->id :crowberto) :object {:name "Renamed"}}
                 {:is_creation true}]
                (revisions/revisions :model/CardTest card-test-id)))))))
