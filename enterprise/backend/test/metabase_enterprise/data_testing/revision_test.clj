(ns metabase-enterprise.data-testing.revision-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.models.card-test :as data-testing.models.card-test]
   [metabase-enterprise.data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.models.segment-test]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.events]
   [metabase.revisions.models.revision :as revision]
   [metabase.revisions.models.revision.diff :as revision.diff]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private saved-test-defaults
  "The columns a saved test gets unless a test gives them."
  {:name "Test" :inputs [] :expectations []})

(defn- transform-test!
  "A transform test with `props` created through its write function, by rasta unless `props` says otherwise."
  [props]
  (data-testing.models/create-transform-test! (merge saved-test-defaults {:creator_id (mt/user->id :rasta)} props)))

(defn- card-test!
  "A card test with `props` created through its write function, by rasta unless `props` says otherwise."
  [props]
  (data-testing.models.card-test/create-card-test! (merge saved-test-defaults {:creator_id (mt/user->id :rasta)} props)))

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
           (revisions/snapshot :model/TransformTest transform-test)))))

(deftest transform-test-create-and-update-revisions-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Transform {transform-id :id} {}]
      (let [{transform-test-id :id} (transform-test! {:transform_id transform-id
                                                      :creator_id   (mt/user->id :crowberto)
                                                      :name         "Original"})]
        (testing "creation records the initial revision"
          (let [[creation] (revisions/revisions :model/TransformTest transform-test-id)]
            (is (true? (:is_creation creation)))
            (is (= "Original" (get-in creation [:object :name])))
            (is (= (mt/user->id :crowberto) (:user_id creation)))))
        (testing "an update records the changed editable fields"
          (data-testing.models/update-transform-test! transform-test-id {:name "Renamed"})
          (let [[updated creation] (revisions/revisions :model/TransformTest transform-test-id)]
            (is (= "Renamed" (get-in updated [:object :name])))
            (is (false? (:is_creation updated)))
            (is (= "Original" (get-in creation [:object :name])))))))))

(deftest transform-test-revision-revert-test
  (mt/with-premium-features #{:transforms-basic :transforms-testing}
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Transform {transform-id :id} {}]
          (let [{transform-test-id :id} (transform-test! {:transform_id transform-id
                                                          :name         "Original"})]
            (data-testing.models/update-transform-test! transform-test-id {:name "Renamed"})
            (let [creation (last (revisions/revisions :model/TransformTest transform-test-id))]
              (mt/user-http-request :crowberto :post 200 "revision/revert"
                                    {:entity      "transform-test"
                                     :id          transform-test-id
                                     :revision_id (:id creation)})
              (testing "the saved test is restored"
                (is (= "Original" (t2/select-one-fn :name :model/TransformTest :id transform-test-id))))
              (testing "the reversion is the one revision that the revert records"
                (let [[reversion update creation]
                      (revisions/revisions :model/TransformTest transform-test-id)]
                  (is (= 3 (count (revisions/revisions :model/TransformTest transform-test-id))))
                  (is (true? (:is_reversion reversion)))
                  (is (= "Original" (get-in reversion [:object :name])))
                  (is (= "Renamed" (get-in update [:object :name])))
                  (is (true? (:is_creation creation))))))))))))

(deftest transform-test-revision-revert-restores-now-test
  (mt/with-premium-features #{:transforms-basic :transforms-testing}
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Transform     {transform-id :id}      {}
                       :model/TransformTest {transform-test-id :id} {:transform_id transform-id
                                                                     :now          (t/offset-date-time "2026-10-13T00:00:00Z")}]
          (t2/update! :model/TransformTest :id transform-test-id {:now nil})
          (testing "an update of `now` is recorded"
            (is (= 2 (count (revisions/revisions :model/TransformTest transform-test-id)))))
          (mt/user-http-request :crowberto :post 200 "revision/revert"
                                {:entity      "transform-test"
                                 :id          transform-test-id
                                 :revision_id (:id (last (revisions/revisions :model/TransformTest transform-test-id)))})
          (testing "a revert restores the moment"
            (is (= (t/instant "2026-10-13T00:00:00Z")
                   (some-> (t2/select-one-fn :now :model/TransformTest :id transform-test-id) t/instant)))))))))

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
          (mt/with-temp [:model/Transform {transform-id :id} {}]
            (let [{transform-test-id :id} (transform-test! {:transform_id transform-id
                                                            :name         "Original"})]
              (data-testing.models/update-transform-test! transform-test-id {:name "Renamed"})
              (is (=? [{:is_creation false
                        :description "renamed this Transform test from \"Original\" to \"Renamed\"."}
                       {:is_creation true
                        :description "created this."}]
                      (mt/user-http-request :crowberto :get 200 (str "revision/transform-test/" transform-test-id)))))))))))

(deftest transform-test-revision-history-without-display-name-api-test
  (testing "GET /api/revision/transform-test/:id loads when the model has no display name"
    (mt/with-premium-features #{:transforms-basic :transforms-testing}
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/Transform {transform-id :id} {}]
            (let [{transform-test-id :id} (transform-test! {:transform_id transform-id
                                                            :name         "Original"})]
              (data-testing.models/update-transform-test! transform-test-id {:name "Renamed"})
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
                          (messages))))))))))))

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
           (revisions/snapshot :model/CardTest card-test)))))

(deftest card-test-create-and-update-revisions-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [{card-test-id :id} (card-test! {:card_id    card-id
                                            :creator_id (mt/user->id :crowberto)
                                            :name       "Original"})]
        (testing "creation records the initial revision"
          (let [[creation :as revisions] (revisions/revisions :model/CardTest card-test-id)]
            (is (= 1 (count revisions)))
            (is (=? {:is_creation true
                     :user_id     (mt/user->id :crowberto)
                     :object      {:card_id card-id :name "Original"}}
                    creation))))
        (testing "an update records the changed editable fields"
          (data-testing.models.card-test/update-card-test! card-test-id {:name "Renamed"})
          (let [[updated creation] (revisions/revisions :model/CardTest card-test-id)]
            (is (=? {:is_creation false :object {:name "Renamed"}} updated))
            (is (=? {:is_creation true :object {:name "Original"}} creation))))))))

(deftest card-test-revision-revert-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [{card-test-id :id} (card-test! {:card_id card-id
                                              :name    "Original"})]
          (data-testing.models.card-test/update-card-test! card-test-id {:name "Renamed"})
          (let [creation (last (revisions/revisions :model/CardTest card-test-id))]
            (mt/user-http-request :crowberto :post 200 "revision/revert"
                                  {:entity      "card-test"
                                   :id          card-test-id
                                   :revision_id (:id creation)})
            (testing "the saved test is restored"
              (is (= "Original" (t2/select-one-fn :name :model/CardTest :id card-test-id))))
            (testing "the reversion is the one revision that the revert records"
              (let [[reversion update creation :as all]
                    (revisions/revisions :model/CardTest card-test-id)]
                (is (= 3 (count all)))
                (is (=? {:is_reversion true :object {:name "Original"}} reversion))
                (is (=? {:object {:name "Renamed"}} update))
                (is (=? {:is_creation true} creation))))))))))

(deftest card-test-revision-revert-restores-now-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card     {card-id :id}      {}
                     :model/CardTest {card-test-id :id} {:card_id card-id
                                                         :now     (t/offset-date-time "2026-10-13T00:00:00Z")}]
        (t2/update! :model/CardTest :id card-test-id {:now nil})
        (testing "an update of `now` is recorded"
          (is (= 2 (count (revisions/revisions :model/CardTest card-test-id))))
          (is (=? {:object {:now nil}} (first (revisions/revisions :model/CardTest card-test-id)))))
        (mt/user-http-request :crowberto :post 200 "revision/revert"
                              {:entity      "card-test"
                               :id          card-test-id
                               :revision_id (:id (last (revisions/revisions :model/CardTest card-test-id)))})
        (testing "a revert restores the moment"
          (is (= (t/instant "2026-10-13T00:00:00Z")
                 (t/instant (t2/select-one-fn :now :model/CardTest :id card-test-id)))))))))

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
            (let [{card-test-id :id} (card-test! {:card_id old-card})]
              (data-testing.models.card-test/update-card-test! card-test-id {:card_id new-card})
              (let [creation (last (revisions/revisions :model/CardTest card-test-id))]
                (testing "premise: rasta may edit the test as it is now"
                  (mt/with-current-user (mt/user->id :rasta)
                    (is (true? (boolean (mi/can-write? (t2/hydrate (t2/select-one :model/CardTest :id card-test-id) :can_write)))))))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :post 403 "revision/revert"
                                             {:entity      "card-test"
                                              :id          card-test-id
                                              :revision_id (:id creation)})))
                (testing "the test still covers the card rasta may edit"
                  (is (= new-card (t2/select-one-fn :card_id :model/CardTest :id card-test-id))))))))))))

(deftest card-test-runs-are-not-revisioned-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [{card-test-id :id} (card-test! {:card_id card-id})]
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
                (t2/delete! :model/DataTestRun :id run-id)))))))))

(deftest card-test-revision-history-api-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [{card-test-id :id} (card-test! {:card_id card-id
                                              :name    "Original"})]
          (data-testing.models.card-test/update-card-test! card-test-id {:name "Renamed"})
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
                         (mt/user-http-request :rasta :get 403 "revision" :entity "card-test" :id card-test-id))))))))))))

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
            (let [{card-test-id :id} (card-test! {:card_id hidden-card :name "Hidden name"})]
              (data-testing.models.card-test/update-card-test! card-test-id {:card_id visible-card :name "Visible name"})
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
          (let [{card-test-id :id} (card-test! {:card_id old-card :name "On the old card"})]
            (data-testing.models.card-test/update-card-test! card-test-id {:card_id new-card :name "On the new card"})
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
            (let [{card-test-id :id} (card-test! {:card_id old-card})]
              (data-testing.models.card-test/update-card-test! card-test-id {:card_id new-card})
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
      (mt/with-temp [:model/Transform {transform-id :id} {}]
        (let [{transform-test-id :id} (transform-test! {:transform_id transform-id
                                                        :name         "Original"})]
          (data-testing.models/update-transform-test! transform-test-id {:name "Renamed"})
          (check-revert-requires-the-feature :model/TransformTest "transform-test" transform-test-id
                                             #{:transforms-basic} #{:transforms-basic :transforms-testing}))))))

(deftest card-test-revert-requires-feature-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [{card-test-id :id} (card-test! {:card_id card-id
                                            :name    "Original"})]
        (data-testing.models.card-test/update-card-test! card-test-id {:name "Renamed"})
        (check-revert-requires-the-feature :model/CardTest "card-test" card-test-id #{} #{:transforms-testing})))))

(deftest card-test-revert-of-a-test-of-a-card-with-no-query-test
  (mt/with-premium-features #{:transforms-testing}
    (testing "A non-admin who may edit a card with no query is refused a revert of its test"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {coll :id}    {}
                       :model/Card       {card-id :id} {:collection_id coll :dataset_query {}}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll)
          (mt/with-current-user (mt/user->id :crowberto)
            (let [{card-test-id :id} (card-test! {:card_id card-id :name "Original"})]
              (data-testing.models.card-test/update-card-test! card-test-id {:name "Renamed"})
              (let [creation (last (revisions/revisions :model/CardTest card-test-id))
                    body     {:entity "card-test" :id card-test-id :revision_id (:id creation)}]
                (testing "premise: the card has no query and rasta may edit the card"
                  (is (= {} (t2/select-one-fn :dataset_query :model/Card :id card-id)))
                  (mt/with-current-user (mt/user->id :rasta)
                    (is (true? (boolean (mi/can-write? (t2/hydrate (t2/select-one :model/Card :id card-id) :can_write)))))))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :post 403 "revision/revert" body)))
                (is (= "Renamed" (t2/select-one-fn :name :model/CardTest :id card-test-id)))
                (testing "control: an admin reverts"
                  (mt/user-http-request :crowberto :post 200 "revision/revert" body)
                  (is (= "Original" (t2/select-one-fn :name :model/CardTest :id card-test-id))))))))))))

(deftest card-test-revert-without-the-feature-answers-402-and-writes-nothing-test
  (testing "Without :transforms-testing, a revert that passes the checks gets 402 and changes nothing"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll :id}    {}
                     :model/Card       {card-id :id} {:collection_id coll}]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [{card-test-id :id} (card-test! {:card_id card-id :name "Original"})]
            (data-testing.models.card-test/update-card-test! card-test-id {:name "Renamed"})
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
                  (is (false? (boolean (mi/can-read? (t2/hydrate (t2/select-one :model/CardTest :id card-test-id) :can_read))))))
                (is (not (t2/exists? :model/CardTest :id missing-id))))
              (testing "with the feature, the read and write checks refuse rasta"
                (mt/with-premium-features #{:transforms-testing}
                  (refusals #(conj (history %) (revert %)))))
              (mt/with-premium-features #{}
                (testing "without the feature, the checks of the test still refuse rasta"
                  (refusals #(conj (history %) (revert %))))
                (testing "without the feature, a revert that passes the checks gets 402"
                  (let [[method & args] (revert card-test-id)]
                    (mt/assert-has-premium-feature-error
                     "Transforms Testing"
                     (apply mt/user-http-request :crowberto method 402 args)))))
              (is (= "Renamed" (t2/select-one-fn :name :model/CardTest :id card-test-id)))
              (is (= 2 (count (revisions/revisions :model/CardTest card-test-id)))))))))))

(deftest card-test-revert-to-a-revision-about-a-deleted-card-test
  (mt/with-premium-features #{:transforms-testing}
    (testing "Reverting a card test to a revision about a deleted card is refused and changes nothing"
      (mt/with-temp [:model/Card {old-card :id} {}
                     :model/Card {new-card :id} {}]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [{card-test-id :id} (card-test! {:card_id old-card :name "On the old card"})]
            (data-testing.models.card-test/update-card-test! card-test-id {:card_id new-card :name "On the new card"})
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
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [{card-test-id :id} (mt/with-current-user (mt/user->id :rasta)
                                   (card-test! {:card_id    card-id
                                                :creator_id (mt/user->id :rasta)
                                                :name       "Original"}))]
          (testing "premise: the creation revision names the creator"
            (is (=? [{:is_creation true :user_id (mt/user->id :rasta)}]
                    (revisions/revisions :model/CardTest card-test-id))))
          (mt/user-http-request :crowberto :put 200 (str "ee/card-test/" card-test-id) {:name "Renamed"})
          (is (=? [{:is_creation false :user_id (mt/user->id :crowberto) :object {:name "Renamed"}}
                   {:is_creation true}]
                  (revisions/revisions :model/CardTest card-test-id))))))))

;;; ---------------------------------------------- Revision descriptions ----------------------------------------------

(def ^:private one-input
  [{:table {:schema "PUBLIC" :name "PEOPLE"} :format :rows :columns [{:name "ID" :cast_type "INTEGER"}] :rows [{"ID" 1}]}])

(def ^:private one-expectation
  [{:type :empty :name "none" :sql "SELECT 1 WHERE 1 = 0"}])

(deftest test-revisions-describe-changes-to-inputs-expectations-and-subject-test
  ;; A transform is readable, so named, only with transforms enabled.
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Transform {transform-1 :id} {:name "Orders summary"}
                       :model/Transform {transform-2 :id} {:name "People summary"}
                       :model/Card      {card-1 :id}      {:name "Revenue"}
                       :model/Card      {card-2 :id}      {:name "Refunds"}
                       :model/Segment   {segment-1 :id}   (data-testing.test-util/segment-on (mt/id :people) "From Google")
                       :model/Segment   {segment-2 :id}   (data-testing.test-util/segment-on (mt/id :people) "From Twitter")]
          (doseq [[model subject-key [from from-name] [to to-name]]
                  [["TransformTest" :transform_id [transform-1 "Orders summary"] [transform-2 "People summary"]]
                   ["CardTest"      :card_id      [card-1 "Revenue"]               [card-2 "Refunds"]]
                   ["SegmentTest"   :segment_id   [segment-1 "From Google"]        [segment-2 "From Twitter"]]]
                  :let [before  {subject-key from :name "t" :description nil :inputs [] :expectations []}
                        strings #(let [after (merge before %)]
                                   (mapv str (revision.diff/diff-strings* model before after
                                                                          (revision/readable-names [before after]))))]]
            (testing model
              (testing "a change of the inputs"
                (is (= ["changed the inputs"] (strings {:inputs one-input}))))
              (testing "a change of the expectations"
                (is (= ["changed the expectations"] (strings {:expectations one-expectation}))))
              (when-not (= "SegmentTest" model)
                (testing "a change of `now`"
                  (is (= ["changed the time the test reads as now"]
                         (strings {:now (t/offset-date-time "2026-10-13T00:00:00Z")})))))
              (testing "a change of the subject names both subjects"
                (is (= [(str "moved this " (#'revision.diff/model-str->i18n-str model) " from " from-name " to " to-name)]
                       (strings {subject-key to}))))
              (testing "control: a rename names the old and new names"
                (is (= [(str "renamed this " (#'revision.diff/model-str->i18n-str model) " from \"t\" to \"u\"")]
                       (strings {:name "u"})))))))))))

(deftest a-moved-test-names-only-the-subjects-the-reader-may-read-test
  (let [moved (fn [from to]
                (let [before {:segment_id from :name "t"}
                      after  {:segment_id to :name "t"}]
                  (mapv str (revision.diff/diff-strings* "SegmentTest" before after
                                                         (revision/readable-names [before after])))))]
    (testing "a reader sees the id of a segment they may not read, and the name of one they may"
      (perms.tu/with-no-data-perms-for-all-users!
        (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                      :perms/create-queries :query-builder}
          (mt/with-perm-for-group-and-table! (perms-group/all-users) (mt/id :venues) :perms/view-data :blocked
            (mt/with-temp [:model/Segment {hidden :id}  (data-testing.test-util/segment-on (mt/id :venues) "Cheap venues")
                           :model/Segment {visible :id} (data-testing.test-util/segment-on (mt/id :people) "From Google")]
              (mt/with-current-user (mt/user->id :rasta)
                (testing "premise: rasta may read only the segment on the people table"
                  (is (false? (boolean (mi/can-read? (t2/hydrate (t2/select-one :model/Segment :id hidden) :can_read)))))
                  (is (true? (boolean (mi/can-read? (t2/hydrate (t2/select-one :model/Segment :id visible) :can_read))))))
                (is (= [(str "moved this Segment test from #" hidden " to From Google")]
                       (moved hidden visible))))
              (testing "control: an admin sees both names"
                (mt/with-current-user (mt/user->id :crowberto)
                  (is (= ["moved this Segment test from Cheap venues to From Google"]
                         (moved hidden visible))))))))))
    (testing "a deleted segment is shown by its id, also to an admin"
      (mt/with-temp [:model/Segment {deleted :id} (data-testing.test-util/segment-on (mt/id :people) "A segment")
                     :model/Segment {visible :id} (data-testing.test-util/segment-on (mt/id :people) "From Google")]
        (t2/delete! :model/Segment :id deleted)
        (mt/with-current-user (mt/user->id :crowberto)
          (is (= [(str "moved this Segment test from #" deleted " to From Google")]
                 (moved deleted visible))))))))

;;; ------------------------------------------------ Segment tests ------------------------------------------------

(deftest segment-test-revision-serialization-test
  (is (= {:segment_id 2 :name "No nulls" :description "Checks the output" :inputs [] :expectations []}
         (revisions/snapshot :model/SegmentTest (t2/instance :model/SegmentTest
                                                             {:id           1
                                                              :entity_id    "test-entity-id"
                                                              :segment_id   2
                                                              :creator_id   3
                                                              :name         "No nulls"
                                                              :description  "Checks the output"
                                                              :inputs       []
                                                              :expectations []
                                                              :created_at   :not-revisioned
                                                              :updated_at   :not-revisioned})))))

(deftest segment-test-create-update-and-revert-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Segment     {segment-id :id}      (data-testing.test-util/segment-on (mt/id :people) "A segment")
                     :model/SegmentTest {segment-test-id :id} {:segment_id segment-id
                                                               :creator_id (mt/user->id :crowberto)
                                                               :name       "Original"}]
        (testing "creation records the initial revision"
          (is (=? [{:is_creation true :user_id (mt/user->id :crowberto) :object {:segment_id segment-id :name "Original"}}]
                  (revisions/revisions :model/SegmentTest segment-test-id))))
        (t2/update! :model/SegmentTest :id segment-test-id {:name "Renamed"})
        (testing "an update records the changed fields, and both history endpoints describe it"
          (is (=? [{:is_creation false :object {:name "Renamed"}} {:is_creation true}]
                  (revisions/revisions :model/SegmentTest segment-test-id)))
          (let [expected [{:is_creation false :description "renamed this Segment test from \"Original\" to \"Renamed\"."}
                          {:is_creation true :description "created this."}]]
            (is (=? expected (mt/user-http-request :crowberto :get 200 "revision"
                                                   :entity "segment-test" :id segment-test-id)))
            (is (=? expected (mt/user-http-request :crowberto :get 200 (str "revision/segment-test/" segment-test-id))))))
        (testing "a revert restores the saved test"
          (let [creation (last (revisions/revisions :model/SegmentTest segment-test-id))]
            (mt/user-http-request :crowberto :post 200 "revision/revert"
                                  {:entity "segment-test" :id segment-test-id :revision_id (:id creation)})
            (is (= "Original" (t2/select-one-fn :name :model/SegmentTest :id segment-test-id)))))))))

(deftest segment-test-revert-requires-feature-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Segment     {segment-id :id}      (data-testing.test-util/segment-on (mt/id :people) "A segment")
                   :model/SegmentTest {segment-test-id :id} {:segment_id segment-id :name "Original"}]
      (t2/update! :model/SegmentTest :id segment-test-id {:name "Renamed"})
      (check-revert-requires-the-feature :model/SegmentTest "segment-test" segment-test-id #{} #{:transforms-testing}))))

(deftest segment-test-revision-history-after-the-old-segment-is-deleted-test
  (mt/with-premium-features #{:transforms-testing}
    (testing "After a segment test moves to another segment and the old one is deleted, the history loads and hides the revision about the deleted segment from a non-admin"
      (mt/with-temp [:model/Segment {old-segment :id} (data-testing.test-util/segment-on (mt/id :people) "A segment")
                     :model/Segment {new-segment :id} (data-testing.test-util/segment-on (mt/id :people) "A segment")]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/SegmentTest {segment-test-id :id} {:segment_id old-segment :name "On the old segment"}]
            (t2/update! :model/SegmentTest :id segment-test-id {:segment_id new-segment :name "On the new segment"})
            (t2/delete! :model/Segment :id old-segment)
            (testing "premise: the old segment is gone and the test remains"
              (is (not (t2/exists? :model/Segment :id old-segment)))
              (is (t2/exists? :model/SegmentTest :id segment-test-id)))
            (let [history (mt/user-http-request :rasta :get 200 (str "revision/segment-test/" segment-test-id))]
              (is (=? [{:is_creation false}] history))
              (is (= 1 (count history)))
              (is (not (re-find #"On the old segment" (pr-str history)))))))))))

(deftest revert-to-a-revision-without-now-clears-now-test
  (testing "a revision written before tests had `now` has no `:now`; reverting to it returns the test to the real clock"
    (mt/with-premium-features #{:transforms-basic :transforms-testing}
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/Card          {card-id :id}           {}
                         :model/CardTest      {card-test-id :id}      {:card_id card-id :name "Before"}
                         :model/Transform     {transform-id :id}      {}
                         :model/TransformTest {transform-test-id :id} {:transform_id transform-id :name "Before"}]
            (doseq [[model model-name entity id subject] [[:model/CardTest "CardTest" "card-test" card-test-id
                                                           {:card_id card-id}]
                                                          [:model/TransformTest "TransformTest" "transform-test"
                                                           transform-test-id {:transform_id transform-id}]]]
              (testing model
                (let [;; A revision as a release before `now` wrote it.
                      revision-id (t2/insert-returning-pk! :model/Revision
                                                           {:model    model-name
                                                            :model_id id
                                                            :user_id  (mt/user->id :crowberto)
                                                            :object   (merge subject {:name         "Before"
                                                                                      :description  nil
                                                                                      :inputs       []
                                                                                      :expectations []})})]
                  (t2/update! model :id id {:name "After" :now (t/offset-date-time "2026-10-13T00:00:00Z")})
                  (mt/user-http-request :crowberto :post 200 "revision/revert"
                                        {:entity entity :id id :revision_id revision-id})
                  (is (=? {:name "Before" :now nil} (t2/select-one [model :name :now] :id id))))))))))))

(deftest card-test-history-permission-check-is-one-lookup-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card {card-id :id}  {}
                   :model/Card {other-id :id} {}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [{card-test-id :id} (card-test! {:card_id card-id :name "Original"})]
          (data-testing.models.card-test/update-card-test! card-test-id {:name "Renamed"})
          (data-testing.models.card-test/update-card-test! card-test-id {:card_id other-id})
          (data-testing.models.card-test/update-card-test! card-test-id {:name "Renamed again"})
          (let [objects (mapv :object (revisions/revisions :model/CardTest card-test-id))
                queries (fn [objects]
                          (t2/with-call-count [call-count]
                            (revision/revisions-readable? :model/CardTest objects)
                            (call-count)))]
            (is (= 4 (count objects)))
            (is (= (queries (take 1 objects)) (queries objects)))
            (testing "a revision about a deleted card is not readable"
              (t2/delete! :model/Card :id card-id)
              (is (= [true true false false] (revision/revisions-readable? :model/CardTest objects))))))))))
