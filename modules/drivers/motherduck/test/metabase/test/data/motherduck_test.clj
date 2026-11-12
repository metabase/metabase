(ns metabase.test.data.motherduck-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.motherduck :as tx.motherduck]))

(def ^:private static-dbdef
  (tx/map->DatabaseDefinition
   {:database-name     "bird-flocks"
    :table-definitions [{:table-name "bird", :field-definitions [], :rows [[1]]}]
    :options           {:static true}}))

(deftest qualified-db-name-test
  (let [qualified-db-name #'tx.motherduck/qualified-db-name]
    (testing "a static dataset gets one shared name, stamped with the date and keyed by its definition"
      (let [shared (qualified-db-name static-dbdef)]
        (is (re-matches #"sha_\d{4}_\d{2}_\d{2}_[0-9a-f]{40}_bird_flocks" shared))
        (is (= shared (qualified-db-name static-dbdef)))
        (is (not= shared (qualified-db-name (assoc-in static-dbdef [:table-definitions 0 :rows] [[2]])))
            "a changed definition gets a different database")))
    (testing "any other dataset gets a private temp_ name"
      (is (re-matches #"temp_.*_bird_flocks" (qualified-db-name (update static-dbdef :options dissoc :static))))
      (is (re-matches #"temp_.*_bird_flocks" (qualified-db-name {:database-name "bird-flocks"}))))
    (testing "a name that is already qualified is kept"
      (is (= "sha_x" (qualified-db-name {:database-name "sha_x"})))
      (is (= "temp_x" (qualified-db-name {:database-name "temp_x", :options {:static true}}))))))

(deftest old-shared-database?-test
  (let [old?  #'tx.motherduck/old-shared-database?
        today (t/local-date (t/instant) (t/zone-id "UTC"))
        stamp (fn [date] (str "sha_" (str/replace (str date) "-" "_") "_abc_test_data"))]
    (testing "today's and yesterday's shared datasets may still be in use"
      (is (false? (old? 12 (stamp today))))
      (is (false? (old? 36 (stamp (t/minus today (t/days 1)))))))
    (testing "a shared dataset is old once its day ended more than `hours` ago"
      (is (true? (old? 12 (stamp (t/minus today (t/days 2)))))))
    (testing "names without a date are kept"
      (is (false? (old? 12 "sha_abc_test_data")))
      (is (false? (old? 12 "temp_2020_01_01_00_x"))))))

(deftest drop-registered-databases!-test
  (testing "one failed DROP doesn't stop the rest"
    (let [dropped (atom [])]
      (mt/with-dynamic-fn-redefs [tx.motherduck/drop-database! (fn [_conn db-name]
                                                                 (when (= "b" db-name)
                                                                   (throw (ex-info "internal MotherDuck error" {})))
                                                                 (swap! dropped conj db-name))]
        (is (= ["b"] (#'tx.motherduck/drop-registered-databases! nil ["a" "b" "c"])))
        (is (= ["a" "c"] @dropped))))))
