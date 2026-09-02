(ns metabase.mcp.v2.tools.dashboard-test
  "Contract tests for the `dashboard_write` v2 MCP tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, nil-arg stripping, Malli validation, and teaching-error conversion are exercised for
   free. The op grammar itself is covered by `metabase.mcp.v2.dashboard-ops-test`; this suite
   pins the tool's contract, permission inheritance, and dry-run behavior on top of it."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tool the assertions below drive.
   [metabase.mcp.v2.tools.dashboard :as tools.dashboard]
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

(deftest create-collection-target-test
  (mt/with-model-cleanup [:model/Dashboard]
    (let [create! (fn [args]
                    (tool-result (call-tool! :crowberto nil "dashboard_write"
                                             (wire (merge {:method "create"} args)))))]
      (testing "GHY-4218: an omitted collection_id saves to the caller's personal collection"
        (is (= (:id (collection/user->personal-collection (mt/user->id :crowberto)))
               (t2/select-one-fn :collection_id :model/Dashboard
                                 :id (:id (create! {:name "dashboard-test personal"}))))))
      (testing "GHY-4218: collection_id \"root\" still saves to the root collection"
        (is (nil? (t2/select-one-fn :collection_id :model/Dashboard
                                    :id (:id (create! {:name "dashboard-test root" :collection_id "root"}))))))
      (testing "GHY-4218: an explicit collection_id is unaffected"
        (mt/with-temp [:model/Collection {coll-id :id} {}]
          (is (= coll-id
                 (t2/select-one-fn :collection_id :model/Dashboard
                                   :id (:id (create! {:name "dashboard-test explicit"
                                                      :collection_id coll-id}))))))))))

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

(deftest validate-only-reports-the-replacement-card-test
  (testing "a dry run of replace_card must name the NEW card: the projection prefers the hydrated `:card` over
            `:card_id`, so a stale one would report the replace as a no-op and an agent validating before
            committing would see the wrong thing"
    (mt/with-temp [:model/Dashboard     dash  {:name "Sales"}
                   :model/Card          old   {:name "Old revenue"}
                   :model/Card          new-c {:name "New revenue"}
                   :model/DashboardCard dc    {:dashboard_id (:id dash) :card_id (:id old)}]
      (let [args {:method "update" :id (:id dash)
                  :ops    [{:op "replace_card" :dashcard_id (:id dc) :card_id (:id new-c)}]}
            dry  (tool-result (call-tool! :crowberto nil "dashboard_write"
                                          (wire (assoc args :validate_only true))))
            real (tool-result (call-tool! :crowberto nil "dashboard_write" (wire args)))]
        (is (= {:id (:id new-c) :name "New revenue"}
               (-> dry :dashcards first :card)))
        (is (= (-> real :dashcards first :card)
               (-> dry :dashcards first :card))
            "the dry run and the real save must agree")))))

(deftest patch-dashcard-accepts-json-parameter-mappings-test
  (testing "`parameter_mappings` is advertised as patchable, and a mapping arrives as raw JSON with string
            clause heads. Without the same target coercion `wire_parameter` does, every such patch failed
            validation with \"should be :dimension\" — a documented key that could never be used."
    (mt/with-temp [:model/Dashboard     dash {:name "Sales"}
                   :model/Card          card {:name "Revenue"}
                   :model/DashboardCard dc   {:dashboard_id (:id dash) :card_id (:id card)}]
      (let [result (call-tool! :crowberto nil "dashboard_write"
                               (wire {:method "update" :id (:id dash)
                                      :ops [{:op "patch_dashcard" :dashcard_id (:id dc)
                                             :patch {:parameter_mappings
                                                     [{:parameter_id "p1"
                                                       :card_id (:id card)
                                                       :target ["dimension" ["field" (mt/id :venues :price) nil]]}]}}]}))]
        (is (not (:isError result)) (-> result :content first :text))
        (is (=? [{:parameter_id "p1" :target [:dimension [:field (mt/id :venues :price) nil]]}]
                (t2/select-one-fn :parameter_mappings :model/DashboardCard :id (:id dc))))))))

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

(deftest write-readback-redacts-unreadable-cards-test
  (testing "GHY-4219: the row a write reads back is redacted like a read. Writing a dashboard needs
            only its own collection, so a writer can hold a dashcard pointing at a card they cannot
            read — the readback must still collapse it to an id, never leak the name."
    (mt/with-temp [:model/Collection    {open-id :id}     {}
                   :model/Collection    {locked-id :id}   {}
                   :model/Dashboard     {dash-id :id}     {:name "Sales" :collection_id open-id}
                   :model/Card          {hidden-card :id} {:name "Hidden" :collection_id locked-id}
                   :model/DashboardCard {hidden-dc :id}   {:dashboard_id dash-id
                                                           :card_id      hidden-card
                                                           :row          0 :col 0}]
      (mt/with-non-admin-groups-no-collection-perms locked-id
        (let [result (tool-result (call-tool! :rasta nil "dashboard_write"
                                              (wire {:method "update" :id dash-id
                                                     :name   "Renamed"})))
              [dc]   (:dashcards result)]
          (is (= "Renamed" (:name result))
              "the write itself succeeds — rasta can write the dashboard's own collection")
          (is (= hidden-dc (:id dc)))
          (is (= {:id hidden-card} (:card dc))
              "the unreadable card comes back as an id with no name"))))))

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
          (let [stored (first (t2/select-one-fn :parameters :model/Dashboard :id (:id dash)))]
            (is (= :list (:values_query_type stored)))
            (testing "and a slug derived from the name, so the parameter is URL-addressable"
              (is (= "category" (:slug stored))))))))))

(deftest update-parameter-clear-test
  (testing "GHY-4191: `update_parameter` can remove a property it once set. Null can't say it —
            `compact-op` strips nulls per op for the same reason the top-level boundary does — so
            `clear` names them. A parameter is a map, so clearing removes the key outright rather
            than storing an explicit null, which is not the same thing to the REST shape."
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (let [param #(first (t2/select-one-fn :parameters :model/Dashboard :id (:id dash)))
            run!  (fn [ops] (tool-result (call-tool! :crowberto nil "dashboard_write"
                                                     (wire {:method "update" :id (:id dash) :ops ops}))))]
        (run! [{:op "add_parameter" :parameter_id "p1" :name "Category" :type "string/="
                :default ["Widget"] :sectionId "string"}])
        (is (= ["Widget"] (:default (param))) "precondition: the default is set")
        (testing "clearing removes the key rather than nulling it"
          (run! [{:op "update_parameter" :parameter_id "p1" :clear ["default"]}])
          (is (not (contains? (param) :default)))
          (testing "and leaves the parameter's other properties alone"
            (is (= "Category" (:name (param))))
            (is (= "string" (:sectionId (param))))))
        (testing "clearing alongside an ordinary set in the same op"
          (run! [{:op "update_parameter" :parameter_id "p1" :default ["Gadget"]}])
          (is (= ["Gadget"] (:default (param))))
          (run! [{:op "update_parameter" :parameter_id "p1" :name "Cat" :clear ["default" "sectionId"]}])
          (is (= "Cat" (:name (param))))
          (is (not (contains? (param) :default)))
          (is (not (contains? (param) :sectionId))))
        (testing "setting and clearing the same property in one op is a contradiction"
          (is (re-find #"both set and cleared"
                       (tool-error (call-tool! :crowberto nil "dashboard_write"
                                               (wire {:method "update" :id (:id dash)
                                                      :ops [{:op "update_parameter" :parameter_id "p1"
                                                             :default ["X"] :clear ["default"]}]})))))
          (testing "and the atomic save means nothing changed"
            (is (= "Cat" (:name (param))))))))))

(deftest unknown-card-is-a-teaching-error-test
  (testing "GHY-4147: add_card referencing a card the user cannot read fails before any write"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}]
      (is (re-find #"op 0"
                   (tool-error (call-tool! :crowberto nil "dashboard_write"
                                           (wire {:method "update" :id (:id dash)
                                                  :ops [{:op "add_card" :id -1 :card_id 9999999}]}))))))))

(deftest create-applies-display-attributes-test
  (testing "GHY-4147: width and auto_apply_filters are honored on create, not silently dropped"
    (mt/with-model-cleanup [:model/Dashboard]
      (let [result (tool-result (call-tool! :crowberto nil "dashboard_write"
                                            (wire {:method "create" :name "Sales"
                                                   :width "full" :auto_apply_filters false})))]
        (is (= {:width "full" :auto_apply_filters false}
               (t2/select-one [:model/Dashboard :width :auto_apply_filters] :id (:id result))))))))

(deftest null-attributes-are-dropped-at-the-boundary-test
  (testing "GHY-4147: strict clients fill every declared property with null, and
            the registry strips those before the handler — so a null attribute leaves
            the stored value alone rather than reaching a NOT NULL column like `width`."
    (mt/with-temp [:model/Dashboard dash {:name "Sales" :width "full" :auto_apply_filters false}]
      (let [result (tool-result (call-tool! :crowberto nil "dashboard_write"
                                            (wire {:method "update" :id (:id dash)
                                                   :name nil :width nil
                                                   :auto_apply_filters nil :archived nil})))]
        (is (= "Sales" (:name result)))
        (is (= {:name "Sales" :width "full" :auto_apply_filters false :archived false}
               (t2/select-one [:model/Dashboard :name :width :auto_apply_filters :archived]
                              :id (:id dash))))))))

(deftest clear-list-clears-attributes-test
  (testing "GHY-4191: `clear` names the properties to unset, which null cannot say — the boundary
            strips nulls because strict clients flood every declared property with one."
    (mt/with-temp [:model/Dashboard dash {:name                "Sales"
                                          :description         "old"
                                          :collection_position 1
                                          :cache_ttl           10}]
      (testing "the named properties are unset, and unnamed ones are untouched"
        (tool-result (call-tool! :crowberto nil "dashboard_write"
                                 (wire {:method "update" :id (:id dash)
                                        :clear ["description" "cache_ttl"]})))
        (is (= {:name "Sales" :description nil :collection_position 1 :cache_ttl nil}
               (t2/select-one [:model/Dashboard :name :description :collection_position :cache_ttl]
                              :id (:id dash)))))
      (testing "clearing alongside an ordinary set in the same call"
        (tool-result (call-tool! :crowberto nil "dashboard_write"
                                 (wire {:method "update" :id (:id dash)
                                        :name "Renamed" :clear ["collection_position"]})))
        (is (= {:name "Renamed" :collection_position nil}
               (t2/select-one [:model/Dashboard :name :collection_position] :id (:id dash)))))
      (testing "a property that isn't clearable is refused rather than silently ignored. The
                schema enum rejects it at the boundary and names the ones that are clearable, so
                the handler's own check (see common-test) is only a backstop against the enum and
                the tool's `:clearable` set drifting apart"
        (let [err (tool-error (call-tool! :crowberto nil "dashboard_write"
                                          (wire {:method "update" :id (:id dash)
                                                 :clear ["name"]})))]
          (is (re-find #"clear" err))
          (is (re-find #"description" err)))
        (is (= "Renamed" (t2/select-one-fn :name :model/Dashboard :id (:id dash))))))))

(deftest clearable-attributes-cannot-be-cleared-with-null-test
  (testing "GHY-4147: the flip side of the boundary strip, pinned so it stays a decision rather
            than a surprise. These four columns are nullable and clearing them is meaningful, but
            null is already spoken for as \"I did not set this\", so it cannot express it — the
            `clear` list added in GHY-4191 is how a caller says it instead."
    (mt/with-temp [:model/Collection coll {}
                   :model/Dashboard  dash {:name                "Sales"
                                           :description         "old"
                                           :collection_id       (:id coll)
                                           :collection_position 1
                                           :cache_ttl           10}]
      (tool-result (call-tool! :crowberto nil "dashboard_write"
                               (wire {:method "update" :id (:id dash)
                                      :description nil :collection_id nil
                                      :collection_position nil :cache_ttl nil})))
      (is (= {:description "old" :collection_id (:id coll) :collection_position 1 :cache_ttl 10}
             (t2/select-one [:model/Dashboard :description :collection_id :collection_position :cache_ttl]
                            :id (:id dash)))))))

(deftest collection-id-root-sentinel-clears-test
  (testing "GHY-4147: `collection_id` is the one clearable attribute with an escape hatch — the
            \"root\" sentinel resolves to nil, so a dashboard can be moved back to the top level"
    (mt/with-temp [:model/Collection coll {}
                   :model/Dashboard  dash {:name "Sales" :collection_id (:id coll)}]
      (tool-result (call-tool! :crowberto nil "dashboard_write"
                               (wire {:method "update" :id (:id dash) :collection_id "root"})))
      (is (nil? (t2/select-one-fn :collection_id :model/Dashboard :id (:id dash)))))))

(deftest add-card-with-series-test
  (testing "GHY-4147: add_card's series cards are fetched like card_id is — the response projects
            them by name, and a create (which dry-runs its ops first) does not blow up on them"
    (mt/with-model-cleanup [:model/Dashboard]
      (mt/with-temp [:model/Card base   {:name "Revenue"}
                     :model/Card overlay {:name "Forecast"}]
        (let [result (tool-result
                      (call-tool! :crowberto nil "dashboard_write"
                                  (wire {:method "create" :name "Sales"
                                         :ops [{:op "add_card" :id -1 :card_id (:id base)
                                                :series [(:id overlay)]}]})))]
          (is (= [{:id (:id overlay) :name "Forecast"}]
                 (get-in result [:dashcards 0 :series]))))))))

(deftest unknown-series-card-is-a-teaching-error-test
  (testing "GHY-4147: a series card the user cannot read is rejected like card_id is, rather than
            being placed unchecked or reaching the projection unfetched"
    (mt/with-temp [:model/Dashboard dash {:name "Sales"}
                   :model/Card      card {:name "Revenue"}]
      (is (re-find #"op 0"
                   (tool-error (call-tool! :crowberto nil "dashboard_write"
                                           (wire {:method "update" :id (:id dash)
                                                  :ops [{:op "add_card" :id -1 :card_id (:id card)
                                                         :series [9999999]}]}))))))))
