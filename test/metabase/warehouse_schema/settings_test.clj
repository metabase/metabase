(ns metabase.warehouse-schema.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.warehouse-schema.humanization :as humanization]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.settings :as warehouse-schema.settings]
   [toucan2.core :as t2]))

(defn- get-humanized-display-name! [actual-name strategy]
  (tu/with-temporary-setting-values [humanization-strategy strategy]
    (mt/with-temp [:model/Table {table-id :id} {:name actual-name}]
      (t2/select-one-fn :display_name :model/Table, :id table-id))))

(deftest humanized-display-name-test
  (testing "check that we get the expected :display_name with humanization *enabled*"
    (doseq [[input strategy->expected] {"toucansare_cool"     {"simple"   "Toucansare Cool"
                                                               "none"     "toucansare_cool"}
                                        "fussybird_sightings" {"simple"   "Fussybird Sightings"
                                                               "none"     "fussybird_sightings"}}
            [strategy expected]        strategy->expected]
      (testing (pr-str (list 'get-humanized-display-name input strategy))
        (is (= expected
               (get-humanized-display-name! input strategy)))))))

(deftest rehumanize-test
  (testing "check that existing tables have their :display_names updated appropriately when strategy is changed"
    (doseq [[actual-name expected] {"toucansare_cool"     {:initial  "Toucansare Cool"
                                                           :simple   "Toucansare Cool"
                                                           :none     "toucansare_cool"}
                                    "fussybird_sightings" {:initial  "Fussybird Sightings"
                                                           :simple   "Fussybird Sightings"
                                                           :none     "fussybird_sightings"}}]
      (tu/with-temporary-setting-values [humanization-strategy "simple"]
        (mt/with-temp [:model/Table {table-id :id} {:name actual-name}]
          (letfn [(display-name [] (t2/select-one-fn :display_name :model/Table, :id table-id))]
            (testing "initial display name"
              (is (= (:initial expected)
                     (display-name))))
            (testing "switch to :simple"
              (warehouse-schema.settings/humanization-strategy! "simple")
              (is (= (:simple expected)
                     (display-name))))
            (testing "switch to :none"
              (warehouse-schema.settings/humanization-strategy! "none")
              (is (= (:none expected)
                     (display-name))))))))))

(deftest do-not-overwrite-custom-names-test
  (testing "check that if we give a field a custom display_name that changing strategy doesn't overwrite it"
    (doseq [initial-strategy ["simple" "none"]]
      (tu/with-temporary-setting-values [humanization-strategy initial-strategy]
        (mt/with-temp [:model/Table {table-id :id} {:name "toucansare_cool", :display_name "My Favorite Table"}]
          (doseq [new-strategy ["simple" "none"]]
            (testing (format "switch from %s -> %s" initial-strategy new-strategy)
              (warehouse-schema.settings/humanization-strategy! new-strategy)
              (is (= "My Favorite Table"
                     (t2/select-one-fn :display_name :model/Table, :id table-id))))))))))

(deftest do-not-overwrite-user-set-field-display-names-test
  (testing "a Field's display name is custom when it's set in FieldUserSettings or differs from the old strategy's humanization"
    (tu/with-temporary-setting-values [humanization-strategy "simple"]
      (mt/with-temp [:model/Field {user-set-id :id} {:name "toucansare_cool", :display_name "Toucansare Cool"}
                     :model/Field {custom-id :id} {:name "fussybird_sightings", :display_name "Some Other Name"}
                     :model/Field {synced-id :id} {:name "bird_watchers", :display_name "Bird Watchers"}]
        (field-user-settings/upsert-user-settings {:id user-set-id} {:display_name "User's Name"})
        (warehouse-schema.settings/humanization-strategy! "none")
        (testing "the user-set Field's raw display name is left alone"
          (is (= "Toucansare Cool" (t2/select-one-fn :display_name :model/Field, :id user-set-id))))
        (testing "a raw display name that differs from the old humanization is left alone"
          (is (= "Some Other Name" (t2/select-one-fn :display_name :model/Field, :id custom-id))))
        (testing "a humanized display name is rewritten to the new strategy"
          (is (= "bird_watchers" (t2/select-one-fn :display_name :model/Field, :id synced-id))))))))

(deftest invalid-strategies-default-to-simple
  (tu/with-temporary-raw-setting-values [humanization-strategy "invalid-choice"]
    (is (= :simple (warehouse-schema.settings/humanization-strategy)))
    (is (= "Foo Bar" (humanization/name->human-readable-name "foo_bar")))))
