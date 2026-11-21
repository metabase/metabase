(ns metabase.transforms.models.transform-tag-test
  "Tests for the transform tag model."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.transforms.models.transform-tag :as transform-tag]
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
      (t2/update! :model/TransformTag :id (:id tag)
                  {:name "default2"})
      (is (= "default2"
             (:name (t2/select-one :model/TransformTag :id (:id tag)))))
      (is (nil? (t2/select-one-fn :built_in_type :model/TransformTag :id (:id tag)))))))

(deftest initial-tags-kept-on-noop-update-test
  (testing "An update that only touches the timestamp leaves a tag built in"
    (doseq [type ["hourly" "daily" "weekly" "monthly"]]
      (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
        (t2/update! :model/TransformTag :id (:id tag) {:updated_at (mi/now)})
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
      (is (thrown? Exception (t2/update! :model/TransformTag :id (:id other) {:name (:name tag)}))))))

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

(defn- tag-names
  "`n` distinct tag names."
  [n]
  (vec (repeatedly n #(str "tag " (mt/random-name)))))

(deftest write-functions-refuse-taken-names-test
  (mt/with-temp [:model/TransformTag tag {}
                 :model/TransformTag other {}]
    (testing "creating a tag with a taken name is a 400"
      (is (= 400 (:status-code (ex-data (try (transform-tag/create-transform-tags! [{:name (:name tag)}])
                                             (catch clojure.lang.ExceptionInfo e e)))))))
    (testing "creating two tags with one name is a 400"
      (let [tag-name (str "tag " (mt/random-name))]
        (is (= 400 (:status-code (ex-data (try (transform-tag/create-transform-tags! [{:name tag-name} {:name tag-name}])
                                               (catch clojure.lang.ExceptionInfo e e))))))))
    (testing "renaming a tag to a taken name is a 400, and to its own name is not"
      (is (= 400 (:status-code (ex-data (try (transform-tag/update-transform-tag! (:id other) {:name (:name tag)})
                                             (catch clojure.lang.ExceptionInfo e e))))))
      (is (nil? (transform-tag/update-transform-tag! (:id other) {:name (:name other)}))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (let [created (atom [])
        count-of (fn [n]
                   (events.tu/statement-count! (fn [] (swap! created into (map :id (transform-tag/create-transform-tags! (mapv #(hash-map :name %) (tag-names n))))))))]
    (try
      (testing "creating tags"
        (is (= (count-of 2) (count-of 6))))
      (testing "deleting tags"
        (let [ids @created]
          (is (= (events.tu/statement-count! (fn [] (transform-tag/delete-transform-tags! (take 2 ids))))
                 (events.tu/statement-count! (fn [] (transform-tag/delete-transform-tags! (take 6 (drop 2 ids)))))))))
      (finally
        (t2/delete! :model/TransformTag :id [:in @created])))))
