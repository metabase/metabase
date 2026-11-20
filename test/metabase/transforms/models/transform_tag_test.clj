(ns metabase.transforms.models.transform-tag-test
  "Tests for the transform tag model."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.transforms.models.transform-tag :as transform-tag]
   [metabase.transforms.write :as transforms.write]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2]))

(comment transform-tag/keep-me)

(deftest initial-tags-translated-on-select
  (doseq [[type name] [["hourly"  (i18n/trs "hourly")]
                       ["daily"   (i18n/trs "daily")]
                       ["weekly"  (i18n/trs "weekly")]
                       ["monthly" (i18n/trs "monthly")]]]
    (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
      (is (= name
             (str (:name (t2/select-one :model/TransformTag :id (:id tag)))))))))

(deftest initial-tags-translated-on-update
  (doseq [type ["hourly" "daily" "weekly" "monthly"]]
    (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
      (transforms.write/update-tag! (:id tag) {:name "default2"} {})
      (is (= "default2"
             (:name (t2/select-one :model/TransformTag :id (:id tag)))))
      (is (nil? (t2/select-one-fn :built_in_type :model/TransformTag :id (:id tag)))))))

(deftest initial-tags-kept-on-noop-update-test
  (testing "An update that only touches the timestamp leaves a tag built in"
    (doseq [type ["hourly" "daily" "weekly" "monthly"]]
      (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
        (transforms.write/update-tag! (:id tag) {:updated_at (mi/now)} {})
        (is (= type (t2/select-one-fn :built_in_type :model/TransformTag :id (:id tag))))))))

(deftest data-analyst-tag-access-follows-the-advanced-permissions-feature-test
  (testing "a data analyst reads, writes and creates transform tags only while advanced-permissions is available"
    (mt/with-temp [:model/TransformTag tag {:name "gated"}]
      (mt/with-data-analyst-role! (mt/user->id :rasta)
        (mt/with-current-user (mt/user->id :rasta)
          (mt/when-ee-evailable
           (mt/with-premium-features #{:advanced-permissions}
             (is (mi/can-read? (t2/hydrate (t2/select-one :model/TransformTag :id 1) :can_read)))
             (is (mi/can-write? (t2/hydrate tag :can_write)))
             (is (mi/can-create? :model/TransformTag {}))))
          (testing "and none once the feature is gone"
            (mt/with-premium-features #{}
              (is (not (mi/can-read? (t2/hydrate (t2/select-one :model/TransformTag :id 1) :can_read))))
              (is (not (mi/can-write? (t2/hydrate tag :can_write))))
              (is (not (mi/can-create? :model/TransformTag {})))))))
      (testing "a superuser is unaffected"
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-premium-features #{}
            (is (mi/can-read? (t2/hydrate (t2/select-one :model/TransformTag :id 1) :can_read)))
            (is (mi/can-write? (t2/hydrate tag :can_write)))
            (is (mi/can-create? :model/TransformTag {}))))))))

(deftest tag-names-are-unique-test
  (mt/with-temp [:model/TransformTag tag {}]
    (is (thrown? Exception (t2/insert! :model/TransformTag {:name (:name tag)})))
    (mt/with-temp [:model/TransformTag other {}]
      (is (thrown? Exception (transforms.write/update-tag! (:id other) {:name (:name tag)} {}))))))

(deftest tag-check-test
  (mt/with-temp [:model/TransformTag tag {}]
    (testing "a superuser may create and update tags"
      (mt/with-current-user (mt/user->id :crowberto)
        (is (some? (api/create-check :model/TransformTag {:name "new"})))
        (is (some? (api/update-check tag {:name "renamed"})))))
    (testing "a user with no data analyst access may not"
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (api/create-check :model/TransformTag {:name "new"})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (api/update-check tag {:name "renamed"})))))))

(deftest tag-writable-by-tag-id-test
  (mt/with-temp [:model/TransformTag tag {}]
    (testing "a tag no transform carries is writable"
      (is (= {(:id tag) true} (transform-tag/tag-id->writable #{(:id tag)}))))
    (testing "no tags answer an empty map"
      (is (= {} (transform-tag/tag-id->writable #{}))))))

(deftest update-tag-publishes-update-event-test
  (let [published (atom [])]
    (events/register-owned-consumer! ::tag-events
                                     (fn [{:keys [model]}] (when (= :model/TransformTag model) :tag))
                                     (fn [_owner events _all] (swap! published into events)))
    (try
      (mt/with-temp [:model/TransformTag tag {:name "Tag"}]
        (reset! published [])
        (mt/with-test-user :crowberto
          (transforms.write/update-tag! (:id tag) {:name "Renamed Tag"} {}))
        (testing "one update event with the row before and after the update"
          (is (=? [{:operation       :update
                    :id              (:id tag)
                    :user-id         (mt/user->id :crowberto)
                    :previous-object {:name "Tag" :updated_at (:updated_at tag)}
                    :object          {:name "Renamed Tag" :updated_at (:updated_at tag)}}]
                  @published))))
      (finally
        (events.tu/unregister! ::tag-events)))))

(deftest update-tag-query-count-test
  (testing "a warm update-tag! of a name issues 3 queries, as master's t2/update! with the hooks did"
    (mt/with-temp [:model/TransformTag {id :id} {:name "Tag"}]
      (mt/with-test-user :crowberto
        (binding [search.ingestion/*disable-updates* true]
          (transforms.write/update-tag! id {:name "Warm Tag"} {})
          (t2/with-call-count [call-count]
            (transforms.write/update-tag! id {:name "Renamed Tag"} {})
            (is (<= (call-count) 3))))))))
