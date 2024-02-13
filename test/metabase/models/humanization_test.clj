(ns metabase.models.humanization-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.humanization :as humanization]
   [metabase.models.table :refer [Table]]
   [metabase.test.util :as tu]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- get-humanized-display-name [actual-name strategy]
  (with-redefs [humanization/humanization-strategy (constantly strategy)]
    (t2.with-temp/with-temp [Table {table-id :id} {:name actual-name}]
      (t2/select-one-fn :display_name Table, :id table-id))))

(deftest humanized-display-name-test
  (testing "check that we get the expected :display_name with humanization *enabled*"
    (doseq [[input strategy->expected] {"toucansare_cool"     {"simple"   "Toucansare Cool"
                                                               "none"     "toucansare_cool"}
                                        "fussybird_sightings" {"simple"   "Fussybird Sightings"
                                                               "none"     "fussybird_sightings"}}
            [strategy expected]        strategy->expected]
      (testing (pr-str (list 'get-humanized-display-name input strategy))
        (is (= expected
               (get-humanized-display-name input strategy)))))))

(deftest rehumanize-test
  (testing "check that existing tables have their :display_names updated appropriately when strategy is changed"
    (doseq [[actual-name expected] {"toucansare_cool"     {:initial  "Toucansare Cool"
                                                           :simple   "Toucansare Cool"
                                                           :none     "toucansare_cool"}
                                    "fussybird_sightings" {:initial  "Fussybird Sightings"
                                                           :simple   "Fussybird Sightings"
                                                           :none     "fussybird_sightings"}}]
      (tu/with-temporary-setting-values [humanization-strategy "simple"]
        (t2.with-temp/with-temp [Table {table-id :id} {:name actual-name}]
          (letfn [(display-name [] (t2/select-one-fn :display_name Table, :id table-id))]
            (testing "initial display name"
              (is (= (:initial expected)
                     (display-name))))
            (testing "switch to :simple"
              (humanization/humanization-strategy! "simple")
              (is (= (:simple expected)
                     (display-name))))
            (testing "switch to :none"
              (humanization/humanization-strategy! "none")
              (is (= (:none expected)
                     (display-name))))))))))

(deftest do-not-overwrite-custom-names-test
  (testing "check that if we give a field a custom display_name that changing strategy doesn't overwrite it"
    (doseq [initial-strategy ["simple" "none"]]
      (tu/with-temporary-setting-values [humanization-strategy initial-strategy]
        (t2.with-temp/with-temp [Table {table-id :id} {:name "toucansare_cool", :display_name "My Favorite Table"}]
          (doseq [new-strategy ["simple" "none"]]
            (testing (format "switch from %s -> %s" initial-strategy new-strategy)
              (humanization/humanization-strategy! new-strategy)
              (is (= "My Favorite Table"
                     (t2/select-one-fn :display_name Table, :id table-id))))))))))

(deftest invalid-strategies-default-to-simple
  (tu/with-temporary-raw-setting-values [humanization-strategy "invalid-choice"]
    (is (= :simple (humanization/humanization-strategy)))
    (is (= "Foo Bar" (humanization/name->human-readable-name "foo_bar")))))
