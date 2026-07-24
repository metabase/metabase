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
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.core :as qp]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
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

(defn- venues-token-for-lens
  "The token [[metabase.permissions.data-access-token/data-access-token]] builds over the venues table
  when the three per-dimension contributors yield these raw values.

  A token stores only a one-way digest of each contributor's value, so a test can't assert \"this
  token is the lens `{:role \\\"readonly\\\"}`\" by writing that lens down as the expected value — it
  has to digest the same lens the same way and compare that."
  [{:keys [sandbox impersonation routing]}]
  (dynamic-redefs/with-dynamic-fn-redefs
    [data-access-token/sandbox-token-for-table    (fn [_table-id] sandbox)
     data-access-token/impersonation-token-for-db (fn [_db-id] impersonation)
     data-access-token/routing-token-for-db       (fn [_db-id] routing)]
    (data-access-token/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})))

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
  "Create a shared-collection exploration whose single query is `done`, backed by a StoredResult
  carrying `creator-id` and `data-access-token`. The query is `dataset-query` (default: the
  venues-count query). The query's `:name` embeds [[discovered-value]], as the top-N variants'
  names do. Calls `f` with the created rows."
  [{:keys [creator-id data-access-token dataset-query]} f]
  (let [dataset-query (or dataset-query (venues-count-query))]
    (mt/with-temp [:model/Collection coll {}
                   :model/Card        metric {:name          "metric"
                                              :type          :metric
                                              :creator_id    creator-id
                                              :database_id   (mt/id)
                                              :dataset_query dataset-query}
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
                                              :dataset_query         dataset-query}
                   :model/StoredResult sr {:result_data       (fake-result-bytes)
                                           :creator_id        creator-id
                                           :database_id       (mt/id)
                                           :dataset_query     dataset-query
                                           :data_access_token data-access-token}
                   :model/ExplorationQueryResult _ {:exploration_query_id (:id q)
                                                    :stored_result_id     (:id sr)}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) coll)
      (f {:exploration e :query q :collection coll}))))

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

(deftest sandbox-token-does-not-store-raw-attribute-values-test
  (testing "a token is persisted as plaintext EDN on `stored_result.data_access_token`, and those rows
            outlive the login attributes they were derived from, so the resolved attribute values a
            sandbox contributor carries must not survive into the stored token"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      (let [raw   (sandbox.field-values/sandbox-token-for-table (mt/id :venues))
            token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
        (testing "the raw contributor really does carry the attribute value we expect to be hidden"
          (is (= {"price" "1"} (last raw))))
        (testing "the stored token is the digest of exactly that lens"
          (is (= (venues-token-for-lens {:sandbox raw}) token)))
        (testing "neither the attribute name nor the raw lens survives in it"
          (let [printed (pr-str token)]
            (is (not (str/includes? printed "price")))
            (is (not (str/includes? printed (pr-str raw))))))))))

(deftest sandbox-token-fails-closed-when-attributes-missing-test
  (testing "when the enforcement guard says the user IS sandboxed but the attribute lookup returns nil,
            the token must NOT collapse to nil (the compatibility gate reads nil as 'unrestricted')"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      (with-redefs [sandbox.field-values/field->sandbox-attributes-for-current-user (constantly nil)]
        (let [token (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})]
          (testing "the sandbox dimension is present, scoped to the user (fail closed)"
            (is (= (venues-token-for-lens
                    {:sandbox [::sandbox.field-values/indeterminate-sandbox (mt/user->id :rasta)]})
                   token)))
          (testing "an indeterminate viewer cannot see an unrestricted creator's snapshot"
            (is (false? (perms/data-access-compatible? {} token))))
          (testing "an indeterminate viewer cannot see a genuinely-sandboxed creator's snapshot"
            (is (false? (perms/data-access-compatible?
                         (venues-token-for-lens {:sandbox [1 "2026-01-01" {"price" "1"}]})
                         token))))
          (testing "another user's indeterminate token does not match this one"
            (is (false? (perms/data-access-compatible?
                         (venues-token-for-lens
                          {:sandbox [::sandbox.field-values/indeterminate-sandbox (mt/user->id :lucky)]})
                         token)))))))))

(deftest impersonation-token-for-db-producer-test
  (mt/with-premium-features #{:advanced-permissions}
    (impersonation.tu/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "db_role"}]
                                            :attributes     {"db_role" "readonly"}}
      (testing "an impersonated user's token carries the resolved database role"
        (is (= {:role "readonly"} (data-access-token/impersonation-token-for-db (mt/id))))
        (is (= (venues-token-for-lens {:impersonation {:role "readonly"}})
               (perms/data-access-token {:database-id (mt/id) :table-ids #{(mt/id :venues)}})))
        (testing "the role name itself is digested, not carried into the stored token"
          (is (not (str/includes? (pr-str (perms/data-access-token {:database-id (mt/id)
                                                                    :table-ids   #{(mt/id :venues)}}))
                                  "readonly")))))
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
          (is (= (venues-token-for-lens {:routing {:destination-db-id dest-id}})
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

(deftest resolved-table-ids-skip-viewer-routing-lens-test
  (testing "resolving a query's table footprint must not resolve the *viewer's* routing lens.
            Footprint resolution preprocesses as admin, but do-as-admin keeps the user's id and
            attributes, so without `preprocess-without-per-user-lens` the routing preprocess
            middleware resolves this user's destination db and throws (no :database-routing
            feature) — and the read gate would deny every same-lens viewer"
    (mt/with-temp [:model/Database _ {:name "sr-dest-a" :router_database_id (mt/id)}
                   :model/DatabaseRouter _ {:database_id (mt/id) :user_attribute "db_name"}]
      (mt/with-premium-features #{}
        (sandbox.tu/with-user-attributes! :rasta {"db_name" "sr-dest-a"}
          (mt/with-test-user :rasta
            (is (= #{(mt/id :venues)}
                   (query-perms/query->resolved-source-table-ids (venues-count-query))))))))))

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
          (is (= (venues-token-for-lens {:routing {:destination-db-id dest-a-id}}) token)))
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
                      :dim             {:dimension-id   "d-category"
                                        :display-name   "Category"
                                        :effective-type :type/Text
                                        :semantic-type  :type/Category}
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

;;; ------------------------------------- card-sourced queries --------------------------------------
;;;
;;; The lens capture derives the tables to fingerprint from the stored `dataset_query`. A query
;;; sourced from a card (`:source-table "card__N"`) names no table id directly, so the capture must
;;; resolve the card chain down to the underlying tables — otherwise both creator's and viewer's
;;; sandbox dimensions come up empty and the gate falls open.

(defn- venues-rows-query
  "A plain rows query over VENUES — stands in for the model/card a metric is built on."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- card-sourced-count-query
  "A count aggregation whose source is `card-id` — the shape of a metric built on a model/card."
  [card-id]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/card mp card-id))
        (lib/aggregate (lib/count)))))

(deftest sandboxed-viewer-blocked-from-card-sourced-snapshot-test
  (testing "a snapshot whose query is sourced from a card over a sandboxed table still gates: the
            sandboxed viewer must not stream the unsandboxed creator's blob even though the raw
            query names no table id directly"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      (mt/with-temp [:model/Card base {:name          "venues model"
                                       :database_id   (mt/id)
                                       :dataset_query (venues-rows-query)}]
        (with-done-exploration!
          {:creator-id        (mt/user->id :lucky)
           ;; the unsandboxed creator's captured lens: unrestricted
           :data-access-token {}
           :dataset-query     (card-sourced-count-query (:id base))}
          (fn [{:keys [exploration query]}]
            (testing "metadata is readable via collection perms"
              (mt/user-http-request :rasta :get 200 (format "exploration/%d" (:id exploration))))
            (testing "but the cached result is blocked"
              (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query))))))))))

(deftest sandboxed-viewer-blocked-from-nested-card-chain-snapshot-test
  (testing "card-on-card chains resolve recursively: a query sourced from card B, itself sourced
            from card A over the sandboxed table, still picks up the underlying table's lens"
    (met/with-gtaps-for-user! :rasta (price-sandbox)
      (mt/with-temp [:model/Card base {:name          "venues model"
                                       :database_id   (mt/id)
                                       :dataset_query (venues-rows-query)}]
        (mt/with-temp [:model/Card middle {:name          "model on model"
                                           :database_id   (mt/id)
                                           :dataset_query (let [mp (mt/metadata-provider)]
                                                            (lib/query mp (lib.metadata/card mp (:id base))))}]
          (with-done-exploration!
            {:creator-id        (mt/user->id :lucky)
             :data-access-token {}
             :dataset-query     (card-sourced-count-query (:id middle))}
            (fn [{:keys [query]}]
              (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query))))))))))

(deftest unsandboxed-viewer-streams-card-sourced-snapshot-test
  (testing "no false lockout: when neither creator nor viewer is sandboxed, a card-sourced snapshot
            still streams"
    (mt/with-temp [:model/Card base {:name          "venues model"
                                     :database_id   (mt/id)
                                     :dataset_query (venues-rows-query)}]
      (with-done-exploration!
        {:creator-id        (mt/user->id :lucky)
         :data-access-token {}
         :dataset-query     (card-sourced-count-query (:id base))}
        (fn [{:keys [query]}]
          (mt/user-http-request :rasta :get 202 (format "exploration/query/%d" (:id query))))))))

(deftest unresolvable-card-chain-fails-closed-test
  (testing "when the source-card chain cannot be resolved (the card was deleted), the viewer's lens
            is indeterminate: non-admins are denied rather than treating the query as touching no
            tables, while an admin — never sandboxed, impersonated, or routed off the router db —
            falls back to the same admin-only access as a nil token"
    (mt/with-temp [:model/Card base {:name          "venues model"
                                     :database_id   (mt/id)
                                     :dataset_query (venues-rows-query)}]
      (let [dataset-query (card-sourced-count-query (:id base))]
        (with-done-exploration!
          {:creator-id        (mt/user->id :lucky)
           :data-access-token {}
           :dataset-query     dataset-query}
          (fn [{:keys [query]}]
            (t2/delete! :model/Card :id (:id base))
            (testing "a non-admin viewer is denied"
              (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query))))
            (testing "an admin still streams the snapshot"
              (mt/user-http-request :crowberto :get 202 (format "exploration/query/%d" (:id query))))))))))

(deftest missing-dataset-query-throws-test
  (testing "stored_result.dataset_query is NOT NULL in the schema, so a map lacking the key means a
            caller passed a trimmed row — the gate fails loudly (500) for every user, admins
            included, so the bug is caught in development instead of silently changing access"
    (let [snapshot {:data_access_token {} :database_id (mt/id)}]
      (doseq [user [:crowberto :rasta]]
        (testing user
          (mt/with-test-user user
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"missing its dataset_query"
                                  (queries/viewer-can-view-cached-result? snapshot)))))))))

(deftest impersonation-and-routing-token-edn-round-trip-test
  (testing "a real token survives the stored_result.data_access_token EDN round-trip. Its per-target
            keys are integer table/database ids, which is why the column is EDN and not JSON — JSON
            would mangle them into strings and every viewer comparison would then miss"
    (let [token (merge (venues-token-for-lens {:impersonation {:role "readonly"}})
                       (venues-token-for-lens {:routing {:destination-db-id 42}}))]
      (is (= #{:impersonation :routing} (set (keys token))))
      (mt/with-temp [:model/StoredResult sr {:result_data       (fake-result-bytes)
                                             :creator_id        (mt/user->id :lucky)
                                             :database_id       (mt/id)
                                             :dataset_query     (venues-count-query)
                                             :data_access_token token}]
        (is (= token (t2/select-one-fn :data_access_token :model/StoredResult :id (:id sr))))))))
