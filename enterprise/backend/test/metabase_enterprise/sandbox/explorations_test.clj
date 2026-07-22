(ns metabase-enterprise.sandbox.explorations-test
  "Tests the per-lens data-access gate on `GET /api/exploration/query/:id`. A cached exploration
  result blob is computed once under its creator's lens; a non-creator viewer may stream it only
  when their own sandbox/impersonation/routing lens is *compatible* with the creator's (see
  `metabase.permissions.data-access-token`). Metadata access (collection perms) stays open
  regardless."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.util-test :as impersonation.tu]
   [metabase-enterprise.sandbox.models.params.field-values :as sandbox.field-values]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase-enterprise.test :as met]
   [metabase.explorations.query-plan.variants :as variants]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-access-token :as data-access-token]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor.core :as qp]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- venues-count-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(defn- price-sandbox
  "A GTAP def filtering venues to rows whose `price` equals the user's `price` login attribute, so
  two users 'share a sandbox' only when their `price` attribute matches."
  []
  {:gtaps      {:venues {:remappings {"price" [:dimension [:field (mt/id :venues :price) nil]]}}}
   :attributes {"price" "1"}})

(defn- fake-result-bytes []
  (qp/do-with-serialization
   (fn [in result-fn]
     (in {:data {:cols [{:name "count"}] :rows [[1]]} :row_count 1 :status :completed})
     (result-fn))))

(def ^:private discovered-value
  "Stands in for a dimension value the *creator's* lens discovered and baked into the query name —
  the kind of derived metadata an incompatible viewer must not be handed back."
  "Bird Sanctuary")

(defn- with-done-exploration!
  "Create a shared-collection exploration whose single venues-count query is `done`, backed by a
  StoredResult carrying `creator-id` and `data-access-token`. The query's `:name` embeds
  [[discovered-value]], as the top-N variants' names do. Calls `f` with the created rows."
  [{:keys [creator-id data-access-token]} f]
  (mt/with-temp [:model/Collection coll {}
                 :model/Card        metric {:name          "metric"
                                            :type          :metric
                                            :creator_id    creator-id
                                            :database_id   (mt/id)
                                            :dataset_query (venues-count-query)}
                 :model/Exploration e {:name "shared" :creator_id creator-id :collection_id (:id coll)}
                 :model/ExplorationThread th {:exploration_id (:id e)}
                 :model/ExplorationBlock g {:exploration_thread_id (:id th)}
                 :model/ExplorationPage p {:exploration_block_id (:id g) :card_id (:id metric)
                                           :dimension_id "d1" :query_type "default"}
                 :model/ExplorationQuery q {:exploration_thread_id (:id th)
                                            :page_id               (:id p)
                                            :card_id               (:id metric)
                                            :dimension_id          "d1"
                                            :name                  (str "Count for " discovered-value)
                                            :status                "done"
                                            :dataset_query         (venues-count-query)}
                 :model/StoredResult sr {:result_data       (fake-result-bytes)
                                         :creator_id        creator-id
                                         :database_id       (mt/id)
                                         :dataset_query     (venues-count-query)
                                         :data_access_token data-access-token}
                 :model/ExplorationQueryResult _ {:exploration_query_id (:id q)
                                                  :stored_result_id     (:id sr)}]
    (perms/grant-collection-read-permissions! (perms-group/all-users) coll)
    (f {:exploration e :query q :collection coll})))

(deftest same-sandbox-viewer-sees-cached-result-test
  (testing "a viewer whose sandbox lens matches the creator's may stream the cached result"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      ;; rasta is bound as current-user with price=1; capture the lens the snapshot is stored under
      (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
        (with-done-exploration!
          {:creator-id (mt/user->id :lucky) :data-access-token token}
          (fn [{:keys [exploration query]}]
            (testing "metadata is readable via collection perms"
              (mt/user-http-request :rasta :get 200 (format "exploration/%d" (:id exploration))))
            (testing "and the cached result streams (same lens)"
              (mt/user-http-request :rasta :get 202 (format "exploration/query/%d" (:id query))))))))))

(deftest different-sandbox-viewer-blocked-from-cached-result-test
  (testing "a viewer with the same sandbox policy but a different attribute value is blocked (403)"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      ;; snapshot stored under price=1 ...
      (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
        (with-done-exploration!
          {:creator-id (mt/user->id :lucky) :data-access-token token}
          (fn [{:keys [exploration query]}]
            ;; ... but rasta now resolves to price=2 -> a different lens
            (sandbox.tu/with-user-attributes! :rasta {"price" "2"}
              (testing "metadata still readable"
                (mt/user-http-request :rasta :get 200 (format "exploration/%d" (:id exploration))))
              (testing "but the cached result is blocked"
                (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query)))))))))))

(defn- exploration-derived-data
  "The bits of `GET /api/exploration/:id` that are derived from the creator's query results."
  [body]
  (let [thread (first (:threads body))]
    {:queries (:queries thread)
     :blocks  (:blocks thread)
     :leaks?  (str/includes? (pr-str body) discovered-value)}))

(deftest different-sandbox-viewer-is-denied-derived-metadata-test
  (testing "a viewer whose lens differs from the creator's gets the exploration shell but none of the
            metadata derived from the creator's results — query names and dataset_queries bake in
            values discovered under the creator's lens, so handing them over would leak around the
            403 on the result blob itself"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      ;; snapshot stored under price=1 ...
      (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
        (with-done-exploration!
          {:creator-id (mt/user->id :lucky) :data-access-token token}
          (fn [{:keys [exploration]}]
            ;; ... but rasta now resolves to price=2 -> a different lens
            (sandbox.tu/with-user-attributes! :rasta {"price" "2"}
              (let [body (mt/user-http-request :rasta :get 200
                                               (format "exploration/%d" (:id exploration)))
                    {:keys [queries blocks leaks?]} (exploration-derived-data body)]
                (testing "the shell is still readable via collection perms"
                  (is (= "shared" (:name body))))
                (is (= [] queries)
                    "no query rows — their :name and :dataset_query carry creator-discovered values")
                (is (= [] blocks)
                    "no block/page tree — its titles are built from those same query names")
                (is (not leaks?)
                    (str "the discovered value " (pr-str discovered-value)
                         " must not appear anywhere in the response"))))))))))

(deftest same-sandbox-viewer-sees-derived-metadata-test
  (testing "a viewer whose lens matches the creator's still gets the full derived metadata —
            the gate must not lock out legitimate collaborators"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
        (with-done-exploration!
          {:creator-id (mt/user->id :lucky) :data-access-token token}
          (fn [{:keys [exploration]}]
            (let [body (mt/user-http-request :rasta :get 200
                                             (format "exploration/%d" (:id exploration)))
                  {:keys [queries leaks?]} (exploration-derived-data body)]
              (is (= 1 (count queries)) "the query row is returned")
              (is leaks? "and its creator-derived name is visible to a same-lens viewer"))))))))

(deftest creator-with-unchanged-lens-sees-own-derived-metadata-test
  (testing "a creator whose lens is unchanged since the snapshot still sees their own derived
            metadata — the re-gate must not lock the creator out of results they can still see"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
        (with-done-exploration!
          {:creator-id (mt/user->id :rasta) :data-access-token token}
          (fn [{:keys [exploration]}]
            (let [body (mt/user-http-request :rasta :get 200
                                             (format "exploration/%d" (:id exploration)))
                  {:keys [queries leaks?]} (exploration-derived-data body)]
              (is (= 1 (count queries)))
              (is leaks? "the creator reads back the values their own lens produced"))))))))

(deftest creator-with-changed-lens-is-denied-derived-metadata-test
  (testing "being the snapshot's creator is not a permanent pass. A creator whose sandbox attribute
            changed since the snapshot is re-gated against their *current* lens exactly like any
            other viewer: they get the shell but none of the metadata derived from results computed
            under a lens they no longer have (their permissions may have narrowed)."
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      ;; snapshot stored under rasta's own price=1 lens ...
      (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
        (with-done-exploration!
          {:creator-id (mt/user->id :rasta) :data-access-token token}
          (fn [{:keys [exploration]}]
            ;; ... but rasta now resolves to price=2 -> a different lens
            (sandbox.tu/with-user-attributes! :rasta {"price" "2"}
              (let [body (mt/user-http-request :rasta :get 200
                                               (format "exploration/%d" (:id exploration)))
                    {:keys [queries blocks leaks?]} (exploration-derived-data body)]
                (testing "the shell is still readable via collection perms"
                  (is (= "shared" (:name body))))
                (is (= [] queries)
                    "no query rows — their :name and :dataset_query carry values from a now-incompatible lens")
                (is (= [] blocks)
                    "no block/page tree — its titles are built from those same query names")
                (is (not leaks?)
                    (str "the discovered value " (pr-str discovered-value)
                         " must not appear anywhere in the response"))))))))))

(deftest unsandboxed-viewer-with-perms-sees-cached-result-test
  (testing "an unsandboxed viewer with data perms may stream a sandboxed creator's result (superset)"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
        ;; crowberto is a superuser -> unsandboxed, full data access -> sees the snapshot
        (with-done-exploration!
          {:creator-id (mt/user->id :lucky) :data-access-token token}
          (fn [{:keys [query]}]
            (mt/user-http-request :crowberto :get 202 (format "exploration/query/%d" (:id query)))))))))

(deftest admin-sees-sandboxed-result-when-sandbox-is-on-all-users-test
  (testing "an admin (superuser) is a member of All Users, but must NOT pick up a phantom sandbox
            token from an All-Users sandbox — they see any creator's snapshot (regression: the
            sandbox token must apply the enforcement guard, not just check group membership)"
    (met/with-gtaps-for-all-users!
      {:gtaps {:venues {:remappings {"price" [:dimension [:field (mt/id :venues :price) nil]]}}}}
      (testing "the superuser's data-access token has no sandbox dimension"
        (is (= {} (request/with-current-user (mt/user->id :crowberto)
                    (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})))))
      ;; capture a genuinely-sandboxed creator's lens
      (let [token (sandbox.tu/with-user-attributes! :rasta {"price" "1"}
                    (request/with-current-user (mt/user->id :rasta)
                      (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})))]
        (testing "the captured creator lens really is a sandbox token"
          (is (seq (:sandbox token))))
        (with-done-exploration!
          {:creator-id (mt/user->id :rasta) :data-access-token token}
          (fn [{:keys [query]}]
            (testing "and the admin streams the cached result"
              (mt/user-http-request :crowberto :get 202 (format "exploration/query/%d" (:id query))))))))))

(deftest viewer-without-data-perms-blocked-from-cached-result-test
  (testing "a viewer with collection-read but no data perms cannot stream the result (403), but reads metadata"
    (mt/with-no-data-perms-for-all-users!
      (with-done-exploration!
        {:creator-id (mt/user->id :lucky) :data-access-token {}}
        (fn [{:keys [exploration query]}]
          (mt/user-http-request :rasta :get 200 (format "exploration/%d" (:id exploration)))
          (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query))))))))

(deftest creator-with-unchanged-lens-streams-own-result-test
  (testing "a creator whose lens is unchanged since the snapshot still streams their own result"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
        (with-done-exploration!
          {:creator-id (mt/user->id :rasta) :data-access-token token}
          (fn [{:keys [query]}]
            (mt/user-http-request :rasta :get 202 (format "exploration/query/%d" (:id query)))))))))

(deftest creator-with-changed-lens-blocked-from-own-result-test
  (testing "the snapshot's creator does NOT get a permanent pass to their own blob: a creator whose
            sandbox attribute changed since the snapshot is re-gated against their *current* lens and
            blocked (403), because the blob was computed under a lens they no longer have"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      ;; snapshot stored under rasta's own price=1 lens ...
      (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
        (with-done-exploration!
          {:creator-id (mt/user->id :rasta) :data-access-token token}
          (fn [{:keys [query]}]
            ;; ... but rasta now resolves to price=2 -> a different lens
            (sandbox.tu/with-user-attributes! :rasta {"price" "2"}
              (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query))))))))))

(deftest pending-query-status-is-not-gated-test
  (testing "a pending query's 409 status payload is not data-gated — even for a sandboxed viewer — it
            carries no result blob and no error_message to leak (the error_message case is gated; see
            error-message-gated-to-viewers-without-data-perms-test)"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      (mt/with-temp [:model/Collection coll {}
                     :model/Card metric {:name "m" :type :metric :creator_id (mt/user->id :lucky)
                                         :database_id (mt/id) :dataset_query (venues-count-query)}
                     :model/Exploration e {:name "shared" :creator_id (mt/user->id :lucky) :collection_id (:id coll)}
                     :model/ExplorationThread th {:exploration_id (:id e)}
                     :model/ExplorationBlock g {:exploration_thread_id (:id th)}
                     :model/ExplorationPage p {:exploration_block_id (:id g) :card_id (:id metric)
                                               :dimension_id "d1" :query_type "default"}
                     :model/ExplorationQuery q {:exploration_thread_id (:id th)
                                                :page_id (:id p)
                                                :card_id (:id metric)
                                                :dimension_id "d1"
                                                :status "pending"
                                                :dataset_query (venues-count-query)}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll)
        (let [body (mt/user-http-request :rasta :get 409 (format "exploration/query/%d" (:id q)))]
          (is (= "pending" (:status body))))))))

(deftest error-message-hidden-from-clients-test
  (testing "a query's `error_message` is creator-run QP output that can embed table/column names and
            SQL fragments, so the 409 error path NEVER returns it to the client — every viewer, admin
            included, gets a generic notice. The real error is logged at ERROR when the query fails."
    (mt/with-temp [:model/Collection coll {}
                   :model/Card metric {:name "m" :type :metric :creator_id (mt/user->id :lucky)
                                       :database_id (mt/id) :dataset_query (venues-count-query)}
                   :model/Exploration e {:name "shared" :creator_id (mt/user->id :lucky) :collection_id (:id coll)}
                   :model/ExplorationThread th {:exploration_id (:id e)}
                   :model/ExplorationBlock g {:exploration_thread_id (:id th)}
                   :model/ExplorationPage p {:exploration_block_id (:id g) :card_id (:id metric)
                                             :dimension_id "d1" :query_type "default"}
                   :model/ExplorationQuery q {:exploration_thread_id (:id th)
                                              :page_id (:id p)
                                              :card_id (:id metric)
                                              :dimension_id "d1"
                                              :status "error"
                                              :error_message "Table \"SECRET_INTERNAL_TABLE\" does not exist; SELECT secret_col FROM ..."
                                              :dataset_query (venues-count-query)}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) coll)
      ;; :crowberto is a superuser; :rasta a plain collection-reader — neither may see the raw error.
      (doseq [user [:rasta :crowberto]]
        (testing (str user)
          (let [body (mt/user-http-request user :get 409 (format "exploration/query/%d" (:id q)))]
            (is (= "error" (:status body)))
            (is (some? (:error_message body)) "the viewer is still told it failed")
            (is (not (str/includes? (:error_message body) "SECRET_INTERNAL_TABLE"))
                "the creator's raw error (table/column names, SQL) must never reach the client")))))))

(deftest sandbox-token-fails-closed-when-attributes-missing-test
  (testing "when the enforcement guard says the user IS sandboxed but the attribute lookup returns nil,
            the token must NOT collapse to nil (the compatibility gate reads nil as 'unrestricted')"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      (with-redefs [sandbox.field-values/field->sandbox-attributes-for-current-user (constantly nil)]
        (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
          (testing "the sandbox dimension is present, scoped to the user (fail closed)"
            (is (= {:sandbox {(mt/id :venues) [::sandbox.field-values/indeterminate-sandbox
                                               (mt/user->id :rasta)]}}
                   token)))
          (testing "an indeterminate viewer cannot see an unrestricted creator's snapshot"
            (is (false? (perms/data-access-compatible? {} token))))
          (testing "an indeterminate viewer cannot see a genuinely-sandboxed creator's snapshot"
            (is (false? (perms/data-access-compatible?
                         {:sandbox {(mt/id :venues) [1 "2026-01-01" {"price" "1"}]}}
                         token))))
          (testing "another user's indeterminate token does not match this one"
            (is (false? (perms/data-access-compatible?
                         {:sandbox {(mt/id :venues) [::sandbox.field-values/indeterminate-sandbox
                                                     (mt/user->id :lucky)]}}
                         token)))))))))

(deftest impersonation-token-for-db-producer-test
  (mt/with-premium-features #{:advanced-permissions}
    (impersonation.tu/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "db_role"}]
                                            :attributes     {"db_role" "readonly"}}
      (testing "an impersonated user's token carries the resolved database role"
        (is (= {:role "readonly"} (data-access-token/impersonation-token-for-db (mt/id))))
        (is (= {:impersonation {(mt/id) {:role "readonly"}}}
               (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}}))))
      (testing "a superuser is not impersonated: no token"
        (request/with-current-user (mt/user->id :crowberto)
          (is (nil? (data-access-token/impersonation-token-for-db (mt/id)))))))))

(deftest impersonation-gate-end-to-end-test
  (testing "the impersonation lens gates cached exploration results per resolved role"
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation.tu/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "db_role"}]
                                              :attributes     {"db_role" "readonly"}}
        ;; rasta is bound as current user with role=readonly; capture the lens the snapshot is stored under
        (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
          (with-done-exploration!
            {:creator-id (mt/user->id :lucky) :data-access-token token}
            (fn [{:keys [query]}]
              (testing "a viewer resolving to the same role streams the cached result (EDN round-trip included)"
                (mt/user-http-request :rasta :get 202 (format "exploration/query/%d" (:id query))))
              (testing "a viewer resolving to a different role is blocked"
                (sandbox.tu/with-user-attributes! :rasta {"db_role" "readwrite"}
                  (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query)))))
              (testing "an unimpersonated superuser streams the cached result"
                (mt/user-http-request :crowberto :get 202 (format "exploration/query/%d" (:id query)))))))))))

(deftest routing-token-for-db-producer-test
  (mt/with-temp [:model/Database {dest-id :id} {:name "sr-dest-a" :router_database_id (mt/id)}
                 :model/DatabaseRouter _ {:database_id (mt/id) :user_attribute "db_name"}]
    (testing "a routed non-admin's token carries the resolved destination database id"
      (sandbox.tu/with-user-attributes! :rasta {"db_name" "sr-dest-a"}
        (mt/with-test-user :rasta
          (is (= {:destination-db-id dest-id} (data-access-token/routing-token-for-db (mt/id))))
          (is (= {:routing {(mt/id) {:destination-db-id dest-id}}}
                 (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}}))))))
    (testing "the __METABASE_ROUTER__ sentinel resolves to the router itself: no token"
      (sandbox.tu/with-user-attributes! :rasta {"db_name" "__METABASE_ROUTER__"}
        (mt/with-test-user :rasta
          (is (nil? (data-access-token/routing-token-for-db (mt/id)))))))
    (testing "a superuser with no routing attribute resolves to the router itself: no token"
      (mt/with-test-user :crowberto
        (is (nil? (data-access-token/routing-token-for-db (mt/id))))))
    (testing "a routed non-admin missing the required attribute throws (callers treat a throw as deny)"
      (mt/with-test-user :rasta
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Required user attribute is missing"
                              (data-access-token/routing-token-for-db (mt/id))))))))

(deftest routing-gate-end-to-end-test
  (testing "the routing lens gates cached exploration results per destination database"
    (mt/with-temp [:model/Database {dest-a-id :id} {:name "sr-dest-a" :router_database_id (mt/id)}
                   :model/Database _ {:name "sr-dest-b" :router_database_id (mt/id)}
                   :model/DatabaseRouter _ {:database_id (mt/id) :user_attribute "db_name"}]
      ;; capture the lens of a creator routed to destination A
      (let [token (sandbox.tu/with-user-attributes! :rasta {"db_name" "sr-dest-a"}
                    (request/with-current-user (mt/user->id :rasta)
                      (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})))]
        (testing "the captured creator lens carries the routing dimension"
          (is (= {:routing {(mt/id) {:destination-db-id dest-a-id}}} token)))
        (with-done-exploration!
          {:creator-id (mt/user->id :lucky) :data-access-token token}
          (fn [{:keys [query]}]
            (testing "a viewer routed to the same destination streams the cached result (EDN round-trip included)"
              (sandbox.tu/with-user-attributes! :rasta {"db_name" "sr-dest-a"}
                (mt/user-http-request :rasta :get 202 (format "exploration/query/%d" (:id query)))))
            (testing "a viewer routed to a different destination is blocked"
              (sandbox.tu/with-user-attributes! :rasta {"db_name" "sr-dest-b"}
                (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query)))))
            (testing "a superuser (router cohort, absent routing dimension) streams the cached result"
              (mt/user-http-request :crowberto :get 202 (format "exploration/query/%d" (:id query))))))))))

(defn- products-count-card
  "Hand-built `:card` ctx — a count metric on PRODUCTS. The discovery path only reads `:id` (for the
  cache key) and `:dataset_query`, so no real Card row is needed."
  [card-id]
  (let [mp (mt/metadata-provider)]
    {:id            card-id
     :dataset_query (lib/->legacy-MBQL (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                           (lib/aggregate (lib/count))))}))

(defn- products-category-sandbox
  "A GTAP def filtering PRODUCTS to rows whose `category` equals the user's `cat` login attribute."
  []
  {:gtaps      {:products {:remappings {"cat" [:dimension [:field (mt/id :products :category) nil]]}}}
   :attributes {"cat" "Widget"}})

(deftest discovery-runs-under-the-bound-users-sandbox-test
  (testing "top-K discovery is a real warehouse query, so the values it bakes into a chart's MBQL and
            name must come from the bound user's lens — a sandboxed creator must never discover the
            global value set"
    (met/with-gtaps-for-user! :rasta (products-category-sandbox)
      (let [ctx      {:mp              (mt/metadata-provider)
                      :card            (products-count-card 9100001)
                      :target          [:field (mt/id :products :category) nil]
                      :dim             {:dimension_id   "d-category"
                                        :display_name   "Category"
                                        :effective_type :type/Text
                                        :semantic_type  :type/Category}
                      :segment         nil
                      :params          {:k 10}
                      :explore-filters nil}
            discover (fn [user-id]
                       (request/with-current-user user-id
                         (#'variants/cached-discovery ctx)))]
        (is (= ["Widget"] (discover (mt/user->id :rasta)))
            "the sandboxed user discovers only the category their sandbox exposes")
        (is (< 1 (count (discover (mt/user->id :crowberto))))
            "an unsandboxed superuser discovers the full set — so the single value above was the
             sandbox at work, not a small table")))))

(deftest impersonation-and-routing-token-edn-round-trip-test
  (testing "keyword-keyed impersonation/routing tokens survive the stored_result.data_access_token EDN round-trip"
    (let [token {:impersonation {(mt/id) {:role "readonly"}}
                 :routing       {(mt/id) {:destination-db-id 42}}}]
      (mt/with-temp [:model/StoredResult sr {:result_data       (fake-result-bytes)
                                             :creator_id        (mt/user->id :lucky)
                                             :database_id       (mt/id)
                                             :dataset_query     (venues-count-query)
                                             :data_access_token token}]
        (is (= token (t2/select-one-fn :data_access_token :model/StoredResult :id (:id sr))))))))
