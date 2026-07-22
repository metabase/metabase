(ns metabase.mcp.v2.tools.dashboard-test
  "Contract tests for the `dashboard_write` v2 MCP tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, `drop-nil-args`, Malli validation, and teaching-error conversion are exercised for
   free. The op grammar itself is covered by `metabase.mcp.v2.dashboard-ops-test`; this suite
   pins the tool's contract, permission inheritance, and dry-run behavior on top of it."
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tool the assertions below drive.
   [metabase.mcp.v2.tools.dashboard :as tools.dashboard]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment tools.dashboard/keep-me)

(defn- call-tool!
  [user scopes tool args]
  (mt/with-current-user (if (keyword? user) (mt/user->id user) user)
    (registry/call-tool scopes nil tool args)))

(defn- tool-result
  [response]
  (when (:isError response)
    (throw (ex-info (str "tool call failed: " (-> response :content first :text))
                    {:response response})))
  (-> response :content first :text json/decode+kw))

(defn- tool-error
  [response]
  (when-not (:isError response)
    (throw (ex-info "expected a tool error, got success" {:response response})))
  (-> response :content first :text))

(defn- wire
  [x]
  (-> x json/encode json/decode+kw))

(deftest create-dashboard-test
  (testing "GHY-4147: method create makes a dashboard and returns it in concise projection form"
    (mt/with-model-cleanup [:model/Dashboard]
      (let [result (tool-result (call-tool! :crowberto nil "dashboard_write"
                                            (wire {:method "create" :name "Sales"
                                                   :description "Quarterly numbers"})))]
        (is (pos-int? (:id result)))
        (is (= "Sales" (:name result)))
        (testing "concise projection keys only"
          (is (= #{:id :name :description :tabs :parameters :dashcards}
                 (into #{} (keys result)))))))))

(deftest create-requires-name-test
  (testing "GHY-4147: create without a name is a teaching error, not a schema dump"
    (is (re-find #"`name` is required"
                 (tool-error (call-tool! :crowberto nil "dashboard_write" (wire {:method "create"})))))))

(deftest update-requires-id-test
  (testing "GHY-4147: update without an id is a teaching error"
    (is (re-find #"`id` is required"
                 (tool-error (call-tool! :crowberto nil "dashboard_write" (wire {:method "update"})))))))

(deftest create-with-ops-in-one-call-test
  (testing "GHY-4147: create accepts ops, so a dashboard and its cards land in a single call"
    (mt/with-model-cleanup [:model/Dashboard]
      (mt/with-temp [:model/Card card {:name "Revenue"}]
        (let [result (tool-result
                      (call-tool! :crowberto nil "dashboard_write"
                                  (wire {:method "create" :name "Sales"
                                         :ops [{:op "add_card" :id -1 :card_id (:id card)}]})))]
          (is (= 1 (count (:dashcards result))))
          (is (= (:id card) (get-in result [:dashcards 0 :card :id])))
          (testing "the dashcard got a real id, not the temp one"
            (is (pos-int? (get-in result [:dashcards 0 :id])))))))))

(deftest create-with-a-bad-op-writes-nothing-test
  (testing "GHY-4147: a create whose ops fail leaves no dashboard behind — otherwise the agent sees
            an error, retries, and ends up with a pile of empty dashboards"
    (mt/with-model-cleanup [:model/Dashboard]
      (mt/with-temp [:model/Card card {}]
        (let [before (t2/count :model/Dashboard)
              err    (tool-error (call-tool! :crowberto nil "dashboard_write"
                                             (wire {:method "create" :name "Sales"
                                                    :ops [{:op "add_card" :id -1 :card_id (:id card)}
                                                          {:op "remove" :dashcard_id 999999}]})))]
          (is (re-find #"op 1" err))
          (is (= before (t2/count :model/Dashboard))))))))

(deftest ops-are-atomic-test
  (testing "GHY-4147: a batch with a bad op writes nothing — the error names the op index"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}
                   :model/Card      card {}]
      (let [err (tool-error (call-tool! :crowberto nil "dashboard_write"
                                        (wire {:method "update" :id (:id dash)
                                               :ops [{:op "add_card" :id -1 :card_id (:id card)}
                                                     {:op "remove" :dashcard_id 999999}]})))]
        (is (re-find #"op 1" err))
        (is (zero? (t2/count :model/DashboardCard :dashboard_id (:id dash))))))))

(deftest validate-only-writes-nothing-test
  (testing "GHY-4147: validate_only returns the would-be layout without touching the database"
    (mt/with-temp [:model/Dashboard dash {:name "Sales" :description "Quarterly numbers"}
                   :model/Card      card {:name "Revenue"}]
      (let [args      {:method "update" :id (:id dash)
                       :ops [{:op "add_card" :id -1 :card_id (:id card)}]}
            dry       (tool-result (call-tool! :crowberto nil "dashboard_write"
                                               (wire (assoc args :validate_only true))))]
        (is (= 1 (count (:dashcards dry))))
        (is (zero? (t2/count :model/DashboardCard :dashboard_id (:id dash))))
        (testing "the dry run's shape matches a real response, so a caller can read it the same way"
          (let [real (tool-result (call-tool! :crowberto nil "dashboard_write" (wire args)))]
            (is (= (into #{} (keys real)) (into #{} (keys dry))))
            (is (= (into #{} (keys (first (:dashcards real))))
                   (into #{} (keys (first (:dashcards dry))))))))))))

(deftest entity-id-is-accepted-test
  (testing "GHY-4147: `id` accepts a 21-character entity_id as well as a numeric id"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (let [result (tool-result (call-tool! :crowberto nil "dashboard_write"
                                            (wire {:method "update" :id (:entity_id dash)
                                                   :description "Updated"})))]
        (is (= (:id dash) (:id result)))
        (is (= "Updated" (:description result)))))))

(deftest archived-round-trip-test
  (testing "GHY-4147: archived true trashes and false restores — the only removal path"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (call-tool! :crowberto nil "dashboard_write" (wire {:method "update" :id (:id dash) :archived true}))
      (is (true? (t2/select-one-fn :archived :model/Dashboard :id (:id dash))))
      (call-tool! :crowberto nil "dashboard_write" (wire {:method "update" :id (:id dash) :archived false}))
      (is (false? (t2/select-one-fn :archived :model/Dashboard :id (:id dash)))))))

(deftest write-permission-is-inherited-test
  (testing "GHY-4147: a user who cannot write the dashboard gets an error and nothing changes"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection coll {}
                     :model/Dashboard  dash {:name "Sales" :collection_id (:id coll)}]
        (is (some? (tool-error (call-tool! :rasta nil "dashboard_write"
                                           (wire {:method "update" :id (:id dash) :name "Hacked"})))))
        (is (= "Sales" (t2/select-one-fn :name :model/Dashboard :id (:id dash))))))))

(deftest update-scope-is-rechecked-test
  (testing "GHY-4147: a token holding only the create scope cannot update"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (is (some? (tool-error (call-tool! :crowberto #{metabot.scope/agent-dashboard-create}
                                         "dashboard_write"
                                         (wire {:method "update" :id (:id dash) :name "New"}))))))))

(deftest parameter-ops-accept-json-shapes-test
  (testing "GHY-4147: a parameter's JSON-shaped properties are coerced to the shape the REST save stores"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (let [result (tool-result
                    (call-tool! :crowberto nil "dashboard_write"
                                (wire {:method "update" :id (:id dash)
                                       :ops [{:op "add_parameter" :parameter_id "p1" :name "Category"
                                              :type "string/=" :sectionId "string"
                                              :values_query_type "list" :isMultiSelect true}]})))]
        (is (= [{:id "p1" :name "Category" :type "string/="}] (:parameters result)))
        (testing "the stored row carries the decoded enum, as it does when the REST endpoint saves the same body"
          (is (= :list
                 (:values_query_type (first (t2/select-one-fn :parameters :model/Dashboard :id (:id dash)))))))))))

(deftest unknown-card-is-a-teaching-error-test
  (testing "GHY-4147: add_card referencing a card the user cannot read fails before any write"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (is (re-find #"op 0"
                   (tool-error (call-tool! :crowberto nil "dashboard_write"
                                           (wire {:method "update" :id (:id dash)
                                                  :ops [{:op "add_card" :id -1 :card_id 9999999}]}))))))))
