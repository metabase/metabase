(ns metabase.internal-stats.db
  "Application database queries for the internal stats module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.internal-stats.util :as u]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.models.interface :as mi]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn enabled-data-app-count :- ms/IntGreaterThanOrEqualToZero
  "The number of enabled data apps without a sync error."
  []
  (t2/count :data_app :enabled true :sync_error nil))

(mu/defn embedded-dashboard-count :- ms/IntGreaterThanOrEqualToZero
  "The number of unarchived Dashboards with embedding enabled."
  []
  (t2/count :model/Dashboard :enable_embedding true :archived false))

(mu/defn embedded-question-count :- ms/IntGreaterThanOrEqualToZero
  "The number of unarchived question Cards with embedding enabled."
  []
  (t2/count :model/Card :enable_embedding true :archived false :type :question))

(mu/defn proxied-ai-usage-tokens-by-model :- [:sequential (mut/optional-keys (mut/open-schema ::metabot.schema/ai-usage-log))]
  "The model and total tokens of the proxied AiUsageLog rows on `date`, grouped by model."
  [date :- ms/TemporalInstant]
  (t2/select [:model/AiUsageLog :model [:%sum.total_tokens :tokens]]
             {:where    [:and
                         :ai_proxied
                         [:= [:cast :created_at :date] [:cast date :date]]]
              :group-by [:model]}))

(mu/defn proxied-ai-usage-tokens-on :- [:maybe :int]
  "The total tokens of the proxied AiUsageLog rows on `date`, or nil."
  [date :- ms/TemporalInstant]
  (t2/select-one-fn :sum
                    [:model/AiUsageLog [:%sum.total_tokens :sum]]
                    {:where [:and
                             :ai_proxied
                             [:= [:cast :created_at :date] [:cast date :date]]]}))

(mu/defn proxied-metabot-user-message-count-on :- [:maybe ms/IntGreaterThanOrEqualToZero]
  "The number of proxied, unforked user MetabotMessages on `date`."
  [date :- ms/TemporalInstant]
  (t2/select-one-fn :cnt
                    [:model/MetabotMessage [:%count.id :cnt]]
                    :role "user"
                    :forked_from_message_id nil
                    {:where [:and
                             :ai_proxied
                             [:= [:cast :created_at :date] [:cast date :date]]]}))

(mu/defn proxied-metabot-user-count-on :- [:map {:closed true} [:cnt :int]]
  "The `:cnt` of distinct Users with proxied, unforked MetabotMessages on `date`."
  [date :- ms/TemporalInstant]
  ;; New rows stamp `metabot_message.user_id`; legacy rows fall back to the conversation's user.
  (t2/query-one {:select [[[:count [:distinct [:coalesce :m.user_id :c.user_id]]] :cnt]]
                 :from   [[:metabot_message :m]]
                 :join   [[:metabot_conversation :c] [:= :c.id :m.conversation_id]]
                 :where  [:and
                          :ai_proxied
                          [:= :m.forked_from_message_id nil]
                          [:= [:cast :m.created_at :date] [:cast date :date]]]}))

(def ^:private sdk-embed-condition
  [:= :embedding_client "embedding-sdk-react"])

(def ^:private simple-embed-condition
  [:= :embedding_client "embedding-simple"])

(def ^:private interactive-embed-condition
  [:or
   [:= :embedding_client "embedding-iframe-full-app"]
   ;; legacy for backwards compatibility
   [:and [:= :embedding_client "embedding-iframe"]
    [:!= :executor_id nil]]])

(def ^:private static-embed-condition
  [:or
   [:= :embedding_client "embedding-iframe-static"]
   ;; legacy for backwards compatibility
   [:and [:= :embedding_client "embedding-iframe"]
    [:= :executor_id nil]]])

(def ^:private public-link-condition
  [:or
   [:= :embedding_client "embedding-public"]
   [:like :context "public-%"]])

(def ^:private query-execution-statistics
  [:model/QueryExecution
   [(u/count-case sdk-embed-condition)         :sdk_embed]
   [(u/count-case interactive-embed-condition) :interactive_embed]
   [(u/count-case static-embed-condition)      :static_embed]
   [(u/count-case public-link-condition)       :public_link]
   [(u/count-case simple-embed-condition)      :simple_embed]
   ;; fallthru: if a row does NOT match the above, it will match this condition and be counted internal.
   ;; COALESCE needed because when embedding_client IS NULL, the OR of equality checks returns NULL
   ;; (not FALSE), and NOT(NULL) = NULL which would skip the row instead of counting it.
   [(u/count-case [:not [:coalesce [:or sdk-embed-condition
                                    interactive-embed-condition
                                    simple-embed-condition
                                    static-embed-condition
                                    public-link-condition]
                         [:inline false]]]) :internal]])

(mu/defn query-execution-statistics-all-time :- [:maybe ::queries.schema/query-execution]
  "The QueryExecution counts per embedding client over all time."
  []
  (t2/select-one query-execution-statistics))

(mu/defn query-execution-statistics-since :- [:maybe ::queries.schema/query-execution]
  "The QueryExecution counts per embedding client for executions started after `started-after`."
  [started-after :- ms/TemporalInstant]
  (t2/select-one query-execution-statistics {:where [:> :started_at started-after]}))

(mu/defn query-execution-statistics-on :- [:maybe ::queries.schema/query-execution]
  "The QueryExecution counts per embedding client for executions started on the day of `date`."
  [date :- ms/TemporalInstant]
  (t2/select-one query-execution-statistics {:where [:= [:cast :started_at :date] [:cast date :date]]}))

(defn- and-not-nil
  ([not-nil-field]
   (and-not-nil nil not-nil-field))
  ([case-boolean not-nil-field]
   (cond->> [:!= not-nil-field nil]
     case-boolean (conj [:and case-boolean]))))

(defn- card-has-params
  []
  (condp = (mdb/db-type)
    :mysql [:json_contains_path
            :dataset_query
            ^:allow-raw-sql [:inline "one"]
            ^:allow-raw-sql [:inline "$.native.\"template-tags\".*"]]
    :postgres [:jsonb_path_exists
               [:cast :dataset_query :jsonb]
               ^:allow-raw-sql [:inline "$.native.\"template-tags\" ? (exists(@.*))"]]))

(defn- contains-embedding-param
  [param]
  (condp = (mdb/db-type)
    :mysql [:!= [:json_search
                 :embedding_params
                 ^:allow-raw-sql [:inline "one"]
                 param]
            nil]
    :postgres [:jsonb_path_exists
               [:cast :embedding_params :jsonb]
               ^:allow-raw-sql [:inline "$.* ? (@ == $val)"]
               [:jsonb_build_object ^:allow-raw-sql [:inline "val"] param]]))

(def ^:private embedding-on [:= :enable_embedding [:inline true]])

(mu/defn question-statistics-all-time :- [:maybe ::queries.schema/card]
  "Aggregate counts of unarchived, non-internal Cards over all time: totals, native vs GUI, dashboard
  questions, embedded, publicly shared, and (where the app db supports JSON path queries) counts
  broken down by template-tag parameters and embedding-parameter locking."
  []
  (let [json-supported? (contains? #{:mysql :mariadb :postgres} (mdb/db-type))]
    (t2/select-one
     (into [:model/Card]
           (cond-> [[:%count.* :total]
                    [(u/count-case [:= "native" :query_type])
                     :native]
                    [(u/count-case [:!= "native" :query_type])
                     :gui]
                    [(u/count-case [:!= :dashboard_id nil])
                     :is_dashboard_question]
                    [(u/count-case [:= :enable_embedding [:inline true]])
                     :total_embedded]
                    [(u/count-case (and-not-nil :public_uuid))
                     :total_public]]
             ;; json_exists/contains which we use to query json encoded data stored in text
             ;; columns is not supported on h2 databases, so we exclude these stats when
             ;; the app db is h2.
             json-supported? (conj
                              [(u/count-case (card-has-params))
                               :with_params]
                              [(u/count-case (and-not-nil (card-has-params) :public_uuid))
                               :with_params_public]
                              [(u/count-case [:and embedding-on (card-has-params)])
                               :with_params_embedded]
                              [(u/count-case [:and (contains-embedding-param "enabled")
                                              embedding-on])
                               :with_enabled_params]
                              [(u/count-case [:and (contains-embedding-param "locked")
                                              embedding-on])
                               :with_locked_params]
                              [(u/count-case [:and (contains-embedding-param "disabled")
                                              embedding-on])
                               :with_disabled_params])))
     {:where (mi/exclude-internal-content-hsql :model/Card)})))

(mu/defn active-personal-user-email-domain-count :- [:map {:closed true} [:count :int]]
  "The `:count` of distinct email domains of active personal Users."
  []
  (let [domain-expr (condp contains? (mdb/db-type)
                      #{:postgres}  [:split_part :email "@" [:inline 2]]
                      #{:h2 :mysql} [:substring :email [:locate "@" :email]])]
    (t2/query-one {:select [[:%count.* :count]]
                   :from [[^:allow-subquery
                           {:select-distinct [[domain-expr]]
                            :from [:core_user]
                            :where [:and
                                    [:= :is_active true]
                                    [:= :type "personal"]]} :distinct_emails]]})))

(mu/defn active-jwt-user-count :- ms/IntGreaterThanOrEqualToZero
  "The number of active personal Users whose SSO source is JWT."
  []
  ;; Because this count is needed *during* token checks, it uses `t2/table-name` to avoid the `after-select` method on
  ;; users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true :sso_source "jwt" :type "personal"))

(mu/defn active-tenant-user-count :- ms/IntGreaterThanOrEqualToZero
  "The number of active personal Users belonging to a Tenant."
  []
  ;; Because this count is needed *during* token checks, it uses `t2/table-name` to avoid the `after-select` method on
  ;; users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true :tenant_id [:not= nil] :type "personal"))

(mu/defn tenants-with-active-users-count :- [:map {:closed true} [:count :int]]
  "The `:count` of Tenants with at least one active personal User."
  []
  (t2/query-one {:select [[[:count [:distinct :tenant_id]] :count]]
                 :from   [(t2/table-name :model/User)]
                 :where  [:and
                          [:= :is_active true]
                          [:= :type "personal"]
                          [:not= :tenant_id nil]]}))
