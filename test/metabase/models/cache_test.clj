(ns metabase.models.cache-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.models.cache :as models.cache]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest register-loaded-test
  (testing "ids are remembered per model within a binding, nil ids are skipped"
    (models.cache/with-loaded-rows
      (models.cache/register-loaded! :model/Table 1)
      (models.cache/register-loaded! :model/Table nil)
      (models.cache/register-loaded! :model/Table 2)
      (is (= #{1 2} (models.cache/loaded-ids :model/Table)))
      (is (= #{} (models.cache/loaded-ids :model/Database)))))
  (testing "nothing is remembered outside a binding"
    (models.cache/register-loaded! :model/Table 1)
    (is (= #{} (models.cache/loaded-ids :model/Table))))
  (testing "a nested binding keeps the outer one"
    (models.cache/with-loaded-rows
      (models.cache/with-loaded-rows
        (models.cache/register-loaded! :model/Table 1))
      (is (= #{1} (models.cache/loaded-ids :model/Table))))))

(deftest check-loaded-test
  (with-redefs [config/is-dev? true]
    (testing "a loaded row passes and a row the request did not load throws"
      (models.cache/with-loaded-rows
        (models.cache/register-loaded! :model/Table 1)
        (is (nil? (models.cache/check-loaded! :model/Table 1)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"did not load"
                              (models.cache/check-loaded! :model/Table 2)))))
    (testing "nothing is checked outside a request"
      (is (nil? (models.cache/check-loaded! :model/Table 2))))))

(deftest after-select-registers-loaded-rows-test
  (mt/with-temp [:model/Collection {coll-id :id}  {}
                 :model/Card       {card-id :id}  {:collection_id coll-id}]
    (testing "a request remembers the loaded rows and the rows they reference"
      (request/with-current-user (mt/user->id :rasta)
        (t2/select-one :model/Card :id card-id)
        (t2/select-one :model/Field :id (mt/id :venues :name))
        (is (contains? (models.cache/loaded-ids :model/Card) card-id))
        (is (contains? (models.cache/loaded-ids :model/Collection) coll-id))
        (is (contains? (models.cache/loaded-ids :model/Field) (mt/id :venues :name)))
        (is (contains? (models.cache/loaded-ids :model/Table) (mt/id :venues)))))
    (testing "a row selected without its id or parent column registers nothing for them"
      (let [field-id (mt/id :venues :name)]
        (models.cache/with-loaded-rows
          (t2/select-one [:model/Field :name] :id field-id)
          (is (= {} @models.cache/*loaded*)))))))
