(ns metabase.metabot.toolkit.dashboard-write-test
  "The shared dashboard write pipeline, called the way a Metabot tool will call it.
   The dashboard is read without MCP's id resolution, and errors are checked as data, never as MCP's wording.
   MCP's `dashboard_write` tests cover the same paths through that tool."
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.toolkit.dashboard-ops :as dashboard-ops]
   [metabase.metabot.toolkit.dashboard-write :as dashboard-write]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- hydrated
  [dashboard-id]
  (t2/hydrate (t2/select-one :model/Dashboard :id dashboard-id) [:dashcards :series :card] :tabs))

(defn- error-data
  [thunk]
  (try (thunk) nil (catch clojure.lang.ExceptionInfo e (dashboard-ops/error-data e))))

(deftest update-test
  (testing "write! saves the ops and the attributes in one update, and returns the saved dashboard hydrated"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card      card {:name "Orders"}
                     :model/Dashboard dash {:name "Sales"}]
        (is (=? {:name      "Revenue"
                 :dashcards [{:card_id (:id card), :card {:name "Orders"}}]}
                (dashboard-write/write! {:dashboard (hydrated (:id dash))
                                         :attrs     {:name "Revenue"}
                                         :ops       [{:op "add_card" :id -1 :card_id (:id card)}]})))
        (is (=? {:name "Revenue", :dashcards [{:card_id (:id card)}]}
                (hydrated (:id dash))))))))

(deftest dry-run-test
  (testing "with validate-only? write! returns what the save would produce, shaped the same, and writes nothing"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card      card {:name "Orders"}
                     :model/Dashboard dash {:name "Sales"}]
        (is (=? {:name      "Revenue"
                 :dashcards [{:id -1, :card_id (:id card), :card {:name "Orders"}}]}
                (dashboard-write/write! {:dashboard      (hydrated (:id dash))
                                         :attrs          {:name "Revenue"}
                                         :ops            [{:op "add_card" :id -1 :card_id (:id card)}]
                                         :validate-only? true})))
        (is (=? {:name "Sales", :dashcards empty?}
                (hydrated (:id dash))))))))

(deftest create-test
  (testing "without a dashboard write! creates one with its ops applied"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card card {}]
        (let [dash (dashboard-write/write! {:attrs {:name "Created by the toolkit"}
                                            :ops   [{:op "add_card" :id -1 :card_id (:id card)}]})]
          (try
            (is (=? {:name "Created by the toolkit", :dashcards [{:card_id (:id card)}]}
                    dash))
            (finally
              (t2/delete! :model/Dashboard :id (:id dash))))))))
  (testing "an invalid op creates nothing"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [dash-name "Never created by the toolkit"]
        (is (=? {::dashboard-ops/error :invalid-op, :op-index 0}
                (error-data #(dashboard-write/write! {:attrs {:name dash-name} :ops [{:op "frobnicate"}]}))))
        (is (not (t2/exists? :model/Dashboard :name dash-name)))))))

(deftest create-read-back-failure-test
  (testing "a create whose read back fails leaves nothing behind, so the error it reports is true"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card card {}]
        (doseq [ops [nil [{:op "add_card" :id -1 :card_id (:id card)}]]]
          (testing (if ops "with ops" "without ops")
            (let [dash-name "Created then read back by the toolkit"]
              (mt/with-dynamic-fn-redefs [dashboard-write/hydrated
                                          (fn [_] (throw (ex-info "read back failed" {})))]
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read back failed"
                                      (dashboard-write/write! {:attrs {:name dash-name}, :ops ops}))))
              (is (not (t2/exists? :model/Dashboard :name dash-name))))))))))

(deftest malformed-ops-test
  (testing "ops that are not a list fail as :invalid-op on every path, before anything reads them"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
        (doseq [ops            [5 {}]
                validate-only? [true false]]
          (testing (pr-str ops validate-only?)
            (is (=? {::dashboard-ops/error :invalid-op}
                    (error-data #(dashboard-write/write! {:dashboard      (hydrated (:id dash))
                                                          :attrs          {:name "Revenue"}
                                                          :ops            ops
                                                          :validate-only? validate-only?}))))))
        (is (= "Sales" (:name (hydrated (:id dash)))))))))

(deftest invalid-payload-test
  (testing "ops that compile to a payload the save would reject fail with :invalid-payload, before any write"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
        (is (=? {::dashboard-ops/error :invalid-payload, :explanation {:parameters some?}}
                (error-data #(dashboard-write/write!
                              {:dashboard (hydrated (:id dash))
                               :attrs     {}
                               :ops       [{:op "add_parameter" :parameter_id "p" :name "P" :type "not-a-type"}]}))))
        (is (empty? (:parameters (hydrated (:id dash)))))))))

(deftest unreadable-card-test
  (testing "a card the user cannot read is refused as unknown, before any write"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card       card       {:collection_id (:id collection)}
                   :model/Dashboard  dash       {:name "Sales"}]
      (mt/with-non-admin-groups-no-collection-perms collection
        (mt/with-current-user (mt/user->id :rasta)
          (is (=? {::dashboard-ops/error :unknown-card, :card-id (:id card)}
                  (error-data #(dashboard-write/write! {:dashboard      (hydrated (:id dash))
                                                        :attrs          {}
                                                        :ops            [{:op "add_card" :id -1 :card_id (:id card)}]
                                                        :validate-only? true})))))))))

(deftest save-without-ops-checks-what-a-dry-run-checks-test
  (testing "a save without ops refuses the attributes its dry run refuses, before any write"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
        (doseq [validate-only? [true false]]
          (testing (if validate-only? "dry run" "save")
            (is (=? {::dashboard-ops/error :invalid-payload, :explanation {:cache_ttl some?}}
                    (error-data #(dashboard-write/write! {:dashboard      (hydrated (:id dash))
                                                          :attrs          {:cache_ttl 0}
                                                          :validate-only? validate-only?}))))))
        (is (nil? (:cache_ttl (hydrated (:id dash))))))))
  (testing "a create is held to what creating a dashboard requires, with or without ops"
    (mt/with-current-user (mt/user->id :crowberto)
      (doseq [ops            [nil [{:op "add_text" :id -1 :markdown "hi"}]]
              validate-only? [true false]]
        (testing (pr-str ops validate-only?)
          (is (=? {::dashboard-ops/error :invalid-payload, :explanation {:name some?}}
                  (error-data #(dashboard-write/write! {:attrs          {:description "No name"}
                                                        :ops            ops
                                                        :validate-only? validate-only?})))))
        (is (not (t2/exists? :model/Dashboard :description "No name")))))))

(deftest save-without-ops-keeps-the-layout-test
  (testing "a save without ops changes the attributes and leaves the dashcards as they are"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card          card {}
                     :model/Dashboard     dash {:name "Sales"}
                     :model/DashboardCard dc   {:dashboard_id (:id dash), :card_id (:id card)}]
        (is (=? {:name "Revenue", :dashcards [{:id (:id dc)}]}
                (dashboard-write/write! {:dashboard (hydrated (:id dash)), :attrs {:name "Revenue"}})))))))

(deftest permission-is-checked-first-test
  (testing "a user who may not write is refused before anything else is checked, on a dry run and a save alike"
    (mt/with-temp [:model/Collection collection {}
                   :model/Dashboard  dash       {:name "Sales", :collection_id (:id collection)}]
      (mt/with-non-admin-groups-no-collection-perms collection
        (mt/with-current-user (mt/user->id :rasta)
          (doseq [validate-only? [true false]]
            (testing (if validate-only? "dry run" "save")
              (testing "update"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                      (dashboard-write/write! {:dashboard      (hydrated (:id dash))
                                                               :attrs          {:cache_ttl 0}
                                                               :validate-only? validate-only?}))))
              (testing "create"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                      (dashboard-write/write! {:attrs          {:name          "New"
                                                                                :collection_id (:id collection)
                                                                                :cache_ttl     0}
                                                               :validate-only? validate-only?}))))))
          (is (=? {:name "Sales"} (hydrated (:id dash))))
          (is (not (t2/exists? :model/Dashboard :name "New"))))))))

(deftest parameters-in-attrs-are-refused-test
  (testing "parameters are edited with ops, so attributes carrying them are refused on every path"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
        (doseq [dashboard      [nil (hydrated (:id dash))]
                validate-only? [true false]]
          (testing (pr-str (some? dashboard) validate-only?)
            (is (=? {::dashboard-ops/error :invalid-payload, :explanation {:parameters some?}}
                    (error-data #(dashboard-write/write! {:dashboard      dashboard
                                                          :attrs          {:name       "With parameters"
                                                                           :parameters []}
                                                          :validate-only? validate-only?}))))))
        (is (not (t2/exists? :model/Dashboard :name "With parameters")))))))
