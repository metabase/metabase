(ns metabase.testing-api.api
  "Endpoints for testing."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [java-time.api :as t]
   [java-time.clock]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.test-spec :as lib.schema.test-spec]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.task.search-index :as task.search-index]
   [metabase.util.date-2 :as u.date]
   [metabase.util.files :as u.files]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (com.mchange.v2.c3p0 PoolBackedDataSource)
   (java.util Queue)
   (java.util.concurrent.locks ReentrantReadWriteLock)))

(set! *warn-on-reflection* true)

;; EVERYTHING BELOW IS FOR H2 ONLY.

(defn- assert-h2 [app-db]
  (assert (= (:db-type app-db) :h2)
          "Snapshot/restore only works for :h2 application databases."))

(defn- snapshot-path-for-name
  ^String [snapshot-name]
  (let [path (u.files/get-path "e2e" "snapshots"
                               (str (str/replace (name snapshot-name) #"\W" "_") ".sql"))]
    (str (.toAbsolutePath path))))

;;;; SAVE

(defn- save-snapshot! [snapshot-name]
  (assert-h2 (mdb/app-db))
  (let [path (snapshot-path-for-name snapshot-name)]
    (log/infof "Saving snapshot to %s" path)
    (jdbc/query {:datasource (mdb/app-db)} ["SCRIPT TO ?" path]))
  :ok)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/snapshot/:name"
  "Snapshot the database for testing purposes."
  [{snapshot-name :name} :- [:map
                             [:name ms/NonBlankString]]]
  (task.search-index/wait-for-init!)
  (search.ingestion/wait-for-idle!)
  (save-snapshot! snapshot-name)
  nil)

;;;; RESTORE

(defn- reset-app-db-connection-pool!
  "Immediately destroy all open connections in the app DB connection pool."
  []
  (let [data-source (mdb/data-source)]
    (when (instance? PoolBackedDataSource data-source)
      (log/info "Destroying application database connection pool")
      (.hardReset ^PoolBackedDataSource data-source))))

(defn- restore-app-db-from-snapshot!
  "Drop all objects in the application DB, then reload everything from the SQL dump at `snapshot-path`."
  [^String snapshot-path]
  (log/infof "Restoring snapshot from %s" snapshot-path)
  (api/check-404 (.exists (java.io.File. snapshot-path)))
  (with-open [conn (.getConnection (mdb/app-db))]
    (doseq [sql-args [["SET LOCK_TIMEOUT 180000"]
                      ["DROP ALL OBJECTS"]
                      ["RUNSCRIPT FROM ?" snapshot-path]]]
      (jdbc/execute! {:connection conn} sql-args))

    ;; We've found a delightful bug in H2 where if you:
    ;; - create a table, then
    ;; - create a view based on the table, then
    ;; - modify the original table, then
    ;; - generate a snapshot

    ;; the generated snapshot has the `CREATE VIEW` *before* the `CREATE TABLE`. This results in a view that can't be
    ;; queried successfully until it is recompiled. Our workaround is to recompile ALL views immediately after we
    ;; restore the app DB from a snapshot. Bug report is here: https://github.com/h2database/h2database/issues/3942
    (doseq [table-name
            (->> (jdbc/query {:connection conn} ["SELECT table_name FROM information_schema.views WHERE table_schema=?" "PUBLIC"])
                 (map :table_name))]
      ;; parameterization doesn't work with view names. If someone maliciously named a table, this is bad. On the
      ;; other hand, this is not running in prod and you already had to have enough access to maliciously name the
      ;; table, so this is probably safe enough.
      (jdbc/execute! {:connection conn} (format "ALTER VIEW %s RECOMPILE" table-name)))))

(defn- restore-snapshot! [snapshot-name]
  (assert-h2 (mdb/app-db))
  (let [path                         (snapshot-path-for-name snapshot-name)
        ^ReentrantReadWriteLock lock (:lock (mdb/app-db))]
    ;; acquire the application DB WRITE LOCK which will prevent any other threads from getting any new connections until
    ;; we release it.
    (try
      (.. lock writeLock lock)
      (reset-app-db-connection-pool!)
      (restore-app-db-from-snapshot! path)
      (mdb/increment-app-db-unique-indentifier!)
      (finally
        (.. lock writeLock unlock)
        ;; don't know why this happens but when I try to test things locally with `bun run test-cypress-open-no-backend`
        ;; and a backend server started with `dev/start!` the snapshots are always missing columns added by DB
        ;; migrations. So let's just check and make sure it's fully up to date in this scenario. Not doing this outside
        ;; of dev because it seems to work fine for whatever reason normally and we don't want tests taking 5 million
        ;; years to run because we're wasting a bunch of time initializing Liquibase and checking for unrun migrations
        ;; for every test when we don't need to. -- Cam
        ;;
        ;; Important! This needs to happen AFTER we unlock the app DB, otherwise migrations will hang for the evil ones
        ;; that are initializing Quartz and opening new connections to do stuff on different threads.
        (when config/is-dev?
          (mdb/migrate! (mdb/app-db) :up)))))
  :ok)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/restore/:name"
  "Restore a database snapshot for testing purposes."
  [{snapshot-name :name} :- [:map
                             [:name ms/NonBlankString]]]
  ;; reset the system clock, in case `/set-time` was called without cleanup
  (alter-var-root #'java-time.clock/*clock* (constantly nil))
  (.clear ^Queue @#'search.ingestion/queue)
  (restore-snapshot! snapshot-name)
  (search/sync-from-restored-db!)
  nil)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/echo"
  "Simple echo handler. Fails when you POST with `?fail=true`."
  [_route-params
   {:keys [fail]} :- [:map
                      [:fail {:default false} ms/BooleanValue]]
   body]
  (if fail
    {:status 400
     :body {:error-code "oops"}}
    {:status 200
     :body body}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/set-time"
  "Make java-time see world at exact time."
  [_route-params
   _query-params
   {:keys [time add-ms]} :- [:map
                             [:time   {:optional true} [:maybe ms/TemporalString]]
                             [:add-ms {:optional true} [:maybe ms/Int]]]]
  (let [clock (when-let [time' (cond
                                 time   (u.date/parse time)
                                 add-ms (t/plus (t/zoned-date-time)
                                                (t/duration add-ms :millis)))]
                (t/mock-clock (t/instant time') (t/zone-id time')))]
    ;; if time' is `nil`, we'll get system clock back
    (alter-var-root #'java-time.clock/*clock* (constantly clock))
    {:result (if clock :set :reset)
     :time   (t/instant)}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/echo"
  "Simple echo handler. Fails when you GET with `?fail=true`."
  [_route-params
   {:keys [fail body]} :- [:map
                           [:fail {:default false} ms/BooleanValue]
                           [:body ms/JSONString]]]
  (if fail
    {:status 400
     :body {:error-code "oops"}}
    {:status 200
     :body (json/decode+kw body)}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/mark-stale"
  "Mark the card or dashboard as stale"
  [_route-params
   _query-params
   {:keys [id model date-str]} :- [:map
                                   [:id       ms/PositiveInt]
                                   [:model    :string]
                                   [:date-str {:optional true} [:maybe :string]]]]
  (let [date (if date-str
               (try (t/local-date "yyyy-MM-dd" date-str)
                    (catch Exception _
                      (throw (ex-info (str "invalid date: '"
                                           date-str
                                           "' expected format: 'yyyy-MM-dd'")
                                      {:status 400}))))
               (t/minus (t/local-date) (t/months 7)))]
    (case model
      "card"      (t2/update! :model/Card :id id {:last_used_at date})
      "dashboard" (t2/update! :model/Dashboard :id id {:last_viewed_at date}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/stats"
  "Triggers a send of instance usage stats"
  []
  (analytics/phone-home-stats!)
  {:success true})

(defenterprise refresh-cache-configs!
  "Manually triggers the preemptive caching refresh job on EE. No-op on OSS."
  metabase-enterprise.cache.task.refresh-cache-configs
  [])

(defenterprise clear-metabot-limit-cache!
  "Clears the metabot usage limit memoization cache on EE so that limit checks re-evaluate immediately.
  No-op on OSS."
  metabase-enterprise.metabot.usage
  [])

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/refresh-caches"
  "Manually triggers the cache refresh task, if Enterprise code is available."
  []
  (refresh-cache-configs!))

(api.macros/defendpoint :post "/query" :- ::lib.schema/query
  "Creates a query from a test query spec."
  [_route-params
   _query-params
   {:keys [database], :as query-spec} :- [:merge
                                          [:map
                                           [:database ::lib.schema.id/database]]
                                          [:ref ::lib.schema.test-spec/test-query-spec]]]
  (-> (lib-be/application-database-metadata-provider database)
      (lib/test-query query-spec)))

(def ^:private TestAdvisory
  "Schema for a single advisory in the testing seed endpoint."
  [:map
   [:advisory_id       ms/NonBlankString]
   [:title             ms/NonBlankString]
   [:severity          [:enum "critical" "high" "medium" "low"]]
   [:description       ms/NonBlankString]
   [:advisory_url      {:optional true} [:maybe ms/NonBlankString]]
   [:remediation       ms/NonBlankString]
   [:affected_versions [:sequential [:map [:min :string] [:fixed :string]]]]
   [:matching_query    {:optional true} [:maybe [:map-of :keyword :string]]]
   [:match_status      [:enum "unknown" "active" "resolved" "not_affected" "error"]]
   [:published_at      :any]
   [:updated_at        :any]])

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/security-advisories"
  "Nuke all existing security advisories and insert the provided ones."
  [_route-params
   _query-params
   {:keys [advisories]} :- [:map
                            [:advisories [:sequential TestAdvisory]]]]
  (t2/delete! :model/SecurityAdvisory)
  (t2/insert-returning-instances! :model/SecurityAdvisory advisories))

(api.macros/defendpoint :post "/native-query" :- ::lib.schema/query
  "Creates a native query from a test query spec."
  [_route-params
   _query-params
   {:keys [database], :as native-query-spec} :- [:merge
                                                 [:map
                                                  [:database ::lib.schema.id/database]]
                                                 [:ref ::lib.schema.test-spec/test-native-query-spec]]]
  (-> (lib-be/application-database-metadata-provider database)
      (lib/test-native-query native-query-spec)))

;;;; Metabot AI usage seeding

(def ^:private e2e-usage-source "e2e-test")

(def ^:private e2e-usage-auditing-group-name "E2E Usage Auditing")

(def ^:private e2e-usage-auditing-conversation-ids
  ["00000000-0000-0000-0000-000000000101"
   "00000000-0000-0000-0000-000000000102"
   "00000000-0000-0000-0000-000000000103"
   "00000000-0000-0000-0000-000000000104"
   "00000000-0000-0000-0000-000000000105"
   "00000000-0000-0000-0000-000000000106"
   "00000000-0000-0000-0000-000000000107"
   "00000000-0000-0000-0000-000000000108"
   "00000000-0000-0000-0000-000000000109"
   "00000000-0000-0000-0000-000000000110"
   "00000000-0000-0000-0000-000000000111"])

(defn- e2e-usage-auditing-group-id!
  []
  (or (t2/select-one-pk :model/PermissionsGroup :name e2e-usage-auditing-group-name)
      (t2/insert-returning-pk! :model/PermissionsGroup {:name e2e-usage-auditing-group-name})))

(defn- ensure-seeded-usage-auditing-group-membership!
  [user-id]
  (let [group-id (e2e-usage-auditing-group-id!)]
    (when-not (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id)
      (perms/add-user-to-group! user-id group-id))))

(defn- delete-seeded-usage-auditing-data!
  []
  (t2/delete! :model/AiUsageLog {:where [:in :conversation_id e2e-usage-auditing-conversation-ids]})
  (t2/delete! :model/MetabotMessage {:where [:in :conversation_id e2e-usage-auditing-conversation-ids]})
  (t2/delete! :model/MetabotConversation {:where [:in :id e2e-usage-auditing-conversation-ids]}))

(defn- insert-seeded-usage-auditing-conversation!
  [{:keys [id user-id created-at source profile-id prompt-tokens completion-tokens total-tokens roles ip-address tenant-id]}]
  (t2/insert! :model/MetabotConversation
              {:id         id
               :user_id    user-id
               :summary    "E2E usage auditing conversation"
               :created_at created-at
               :ip_address ip-address})
  (doseq [role roles]
    (t2/insert! :model/MetabotMessage
                {:conversation_id id
                 :user_id         user-id
                 :role            role
                 :profile_id      profile-id
                 :data            []
                 :total_tokens    0
                 :created_at      created-at}))
  (t2/insert! :model/AiUsageLog
              (cond-> {:source            source
                       :model             "anthropic/claude-sonnet-4-6"
                       :conversation_id   id
                       :user_id           user-id
                       :prompt_tokens     prompt-tokens
                       :completion_tokens completion-tokens
                       :total_tokens      total-tokens
                       :created_at        created-at}
                tenant-id (assoc :tenant_id tenant-id))))

(defn- seed-usage-auditing-data!
  ([user-id second-user-id]
   (seed-usage-auditing-data! user-id second-user-id nil nil))
  ([user-id second-user-id tenant-id second-tenant-id]
   (let [today          (t/offset-date-time (t/zone-offset "+00"))
         yesterday      (t/minus today (t/days 1))
         two-days       (t/minus today (t/days 2))
         previous-week  (t/minus today (t/days 8))
         previous-month (t/minus today (t/days 45))
         out-of-bounds  (t/minus today (t/days 395))]
     (ensure-seeded-usage-auditing-group-membership! user-id)
     (ensure-seeded-usage-auditing-group-membership! second-user-id)
     (when tenant-id
       (t2/update! :model/User user-id {:tenant_id tenant-id}))
     (when second-tenant-id
       (t2/update! :model/User second-user-id {:tenant_id second-tenant-id}))
     (delete-seeded-usage-auditing-data!)
     (doseq [conversation [{:id                (nth e2e-usage-auditing-conversation-ids 0)
                            :user-id           user-id
                            :created-at        (t/minus today (t/hours 2))
                            :source            "metabot_agent"
                            :profile-id        "nlq"
                            :prompt-tokens     100
                            :completion-tokens 50
                            :total-tokens      150
                            :roles             ["user" "assistant"]
                            :ip-address        "10.0.0.1"}
                           {:id                (nth e2e-usage-auditing-conversation-ids 1)
                            :user-id           user-id
                            :created-at        (t/minus two-days (t/hours 1))
                            :source            "slackbot"
                            :profile-id        "internal"
                            :prompt-tokens     200
                            :completion-tokens 100
                            :total-tokens      300
                            :roles             ["user" "user" "assistant"]
                            :ip-address        "10.0.0.2"}
                           {:id                (nth e2e-usage-auditing-conversation-ids 2)
                            :user-id           second-user-id
                            :created-at        yesterday
                            :source            "sql-gen"
                            :profile-id        "sql"
                            :prompt-tokens     300
                            :completion-tokens 150
                            :total-tokens      450
                            :roles             ["user" "assistant"]
                            :ip-address        "10.0.0.3"}
                           {:id                (nth e2e-usage-auditing-conversation-ids 3)
                            :user-id           second-user-id
                            :created-at        (t/minus yesterday (t/hours 2))
                            :source            "document_generate_content"
                            :profile-id        "document-generate-content"
                            :prompt-tokens     400
                            :completion-tokens 200
                            :total-tokens      600
                            :roles             ["user" "assistant" "assistant"]
                            :ip-address        "10.0.0.4"}
                           {:id                (nth e2e-usage-auditing-conversation-ids 4)
                            :user-id           user-id
                            :created-at        two-days
                            :source            "metabot_agent"
                            :profile-id        "nlq"
                            :prompt-tokens     500
                            :completion-tokens 250
                            :total-tokens      750
                            :roles             ["user" "assistant"]
                            :ip-address        "10.0.0.1"}
                           {:id                (nth e2e-usage-auditing-conversation-ids 5)
                            :user-id           second-user-id
                            :created-at        (t/minus two-days (t/hours 3))
                            :source            "sql-gen"
                            :profile-id        "embedding_next"
                            :prompt-tokens     600
                            :completion-tokens 300
                            :total-tokens      900
                            :roles             ["user" "assistant"]
                            :ip-address        "10.0.0.5"}
                           {:id                (nth e2e-usage-auditing-conversation-ids 6)
                            :user-id           user-id
                            :created-at        (t/minus today (t/minutes 30))
                            :source            "slackbot"
                            :profile-id        "slackbot"
                            :prompt-tokens     700
                            :completion-tokens 350
                            :total-tokens      1050
                            :roles             ["user" "assistant"]
                            :ip-address        "10.0.0.6"}
                           {:id                (nth e2e-usage-auditing-conversation-ids 7)
                            :user-id           user-id
                            :created-at        (t/minus today (t/minutes 15))
                            :source            "metabot_agent"
                            :profile-id        "transforms_codegen"
                            :prompt-tokens     800
                            :completion-tokens 400
                            :total-tokens      1200
                            :roles             ["user" "assistant"]
                            :ip-address        "10.0.0.7"}
                           {:id                (nth e2e-usage-auditing-conversation-ids 8)
                            :user-id           second-user-id
                            :created-at        previous-month
                            :source            "sql-gen"
                            :profile-id        "sql"
                            :prompt-tokens     900
                            :completion-tokens 450
                            :total-tokens      1350
                            :roles             ["user" "assistant"]
                            :ip-address        "10.0.0.8"}
                           {:id                (nth e2e-usage-auditing-conversation-ids 9)
                            :user-id           user-id
                            :created-at        out-of-bounds
                            :source            "metabot_agent"
                            :profile-id        "internal"
                            :prompt-tokens     1000
                            :completion-tokens 500
                            :total-tokens      1500
                            :roles             ["user" "assistant"]
                            :ip-address        "10.0.0.99"}
                           {:id                (nth e2e-usage-auditing-conversation-ids 10)
                            :user-id           user-id
                            :created-at        previous-week
                            :source            "metabot_agent"
                            :profile-id        "nlq"
                            :prompt-tokens     110
                            :completion-tokens 55
                            :total-tokens      165
                            :roles             ["user" "assistant"]
                            :ip-address        "10.0.0.1"}]]
       (insert-seeded-usage-auditing-conversation!
        (cond-> conversation
          (= (:user-id conversation) user-id) (assoc :tenant-id tenant-id)
          (= (:user-id conversation) second-user-id) (assoc :tenant-id second-tenant-id))))
     {:inserted (count e2e-usage-auditing-conversation-ids)
      :date     (str (t/local-date today))})))

(api.macros/defendpoint :post "/metabot/seed-ai-usage"
  :- [:map [:inserted :int]]
  "Insert `count` rows into `ai_usage_log` for the given `user_id`, then clear the metabot limit
  cache so limit checks re-evaluate immediately.  Intended only for E2E tests."
  [_route-params
   _query-params
   {:keys [user_id count]} :- [:map
                               [:user_id ms/PositiveInt]
                               [:count   ms/PositiveInt]]]
  (dotimes [_ count]
    (t2/insert! :model/AiUsageLog
                {:source            e2e-usage-source
                 :model             "test/model"
                 :prompt_tokens     0
                 :completion_tokens 0
                 :total_tokens      0
                 :user_id           user_id}))
  (clear-metabot-limit-cache!)
  {:inserted count})

(api.macros/defendpoint :delete "/metabot/seed-ai-usage"
  :- [:map [:deleted :int]]
  "Delete all `ai_usage_log` rows inserted by the seeding endpoint for the given `user_id`, then
  clear the metabot limit cache.  Intended only for E2E tests."
  [_route-params
   _query-params
   {:keys [user_id]} :- [:map
                         [:user_id ms/PositiveInt]]]
  (let [deleted (t2/delete! :model/AiUsageLog :user_id user_id :source e2e-usage-source)]
    (clear-metabot-limit-cache!)
    {:deleted deleted}))

(api.macros/defendpoint :post "/metabot/seed-usage-auditing"
  :- [:map
      [:inserted :int]
      [:date ms/NonBlankString]]
  "Seed deterministic Metabot conversation, message, and token usage rows for the usage auditing E2E charts."
  [_route-params
   _query-params
   {:keys [user_id second_user_id tenant_id second_tenant_id]} :- [:map
                                                                   [:user_id ms/PositiveInt]
                                                                   [:second_user_id ms/PositiveInt]
                                                                   [:tenant_id {:optional true} [:maybe ms/PositiveInt]]
                                                                   [:second_tenant_id {:optional true} [:maybe ms/PositiveInt]]]]
  (seed-usage-auditing-data! user_id second_user_id tenant_id second_tenant_id))
