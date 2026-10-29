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
        (let [dash-name "Created then read back by the toolkit"]
          (mt/with-dynamic-fn-redefs [dashboard-write/hydrated
                                      (fn [_] (throw (ex-info "read back failed" {})))]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read back failed"
                                  (dashboard-write/write! {:attrs {:name dash-name}
                                                           :ops   [{:op "add_card" :id -1 :card_id (:id card)}]}))))
          (is (not (t2/exists? :model/Dashboard :name dash-name))))))))

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
