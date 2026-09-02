(ns metabase.internal-stats.queries
  "Application database queries for the internal stats module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.internal-stats.util :as u]
   [toucan2.core :as t2]))

(defn enabled-data-app-count
  "The number of enabled data apps without a sync error."
  []
  (t2/count :data_app :enabled true :sync_error nil))

(defn embedded-dashboard-count
  "The number of unarchived Dashboards with embedding enabled."
  []
  (t2/count :model/Dashboard :enable_embedding true :archived false))

(defn embedded-question-count
  "The number of unarchived question Cards with embedding enabled."
  []
  (t2/count :model/Card :enable_embedding true :archived false :type :question))

(defn proxied-ai-usage-tokens-by-model
  "The model and total tokens of the proxied AiUsageLog rows on `date`, grouped by model."
  [date]
  (t2/select [:model/AiUsageLog :model [:%sum.total_tokens :tokens]]
             {:where    [:and
                         :ai_proxied
                         [:= [:cast :created_at :date] [:cast date :date]]]
              :group-by [:model]}))

(defn proxied-ai-usage-tokens-on
  "The total tokens of the proxied AiUsageLog rows on `date`, or nil."
  [date]
  (t2/select-one-fn :sum
                    [:model/AiUsageLog [:%sum.total_tokens :sum]]
                    {:where [:and
                             :ai_proxied
                             [:= [:cast :created_at :date] [:cast date :date]]]}))

(defn proxied-metabot-user-message-count-on
  "The number of proxied, unforked user MetabotMessages on `date`."
  [date]
  (t2/select-one-fn :cnt
                    [:model/MetabotMessage [:%count.id :cnt]]
                    :role "user"
                    :forked_from_message_id nil
                    {:where [:and
                             :ai_proxied
                             [:= [:cast :created_at :date] [:cast date :date]]]}))

(defn proxied-metabot-user-count-on
  "The `:cnt` of distinct Users with proxied, unforked MetabotMessages on `date`."
  [date]
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

(defn query-execution-statistics-all-time
  "The QueryExecution counts per embedding client over all time."
  []
  (t2/select-one query-execution-statistics))

(defn query-execution-statistics-since
  "The QueryExecution counts per embedding client for executions started after `started-after`."
  [started-after]
  (t2/select-one query-execution-statistics {:where [:> :started_at started-after]}))

(defn query-execution-statistics-on
  "The QueryExecution counts per embedding client for executions started on the day of `date`."
  [date]
  (t2/select-one query-execution-statistics {:where [:= [:cast :started_at :date] [:cast date :date]]}))

(defn card-statistics
  "The aggregate `columns` over the Cards matching the Honey SQL `where` clause."
  [columns where]
  (t2/select-one (into [:model/Card] columns) {:where where}))

(defn active-personal-user-email-domain-count
  "The `:count` of distinct email domains of active personal Users, `domain-expr` being the Honey SQL expression
  extracting the domain from `:email`."
  [domain-expr]
  (t2/query-one {:select [[:%count.* :count]]
                 :from [[^:allow-subquery
                         {:select-distinct [[domain-expr]]
                          :from [:core_user]
                          :where [:and
                                  [:= :is_active true]
                                  [:= :type "personal"]]} :distinct_emails]]}))

(defn active-jwt-user-count
  "The number of active personal Users whose SSO source is JWT."
  []
  ;; Because this count is needed *during* token checks, it uses `t2/table-name` to avoid the `after-select` method on
  ;; users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true :sso_source "jwt" :type "personal"))

(defn active-tenant-user-count
  "The number of active personal Users belonging to a Tenant."
  []
  ;; Because this count is needed *during* token checks, it uses `t2/table-name` to avoid the `after-select` method on
  ;; users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true :tenant_id [:not= nil] :type "personal"))

(defn tenants-with-active-users-count
  "The `:count` of Tenants with at least one active personal User."
  []
  (t2/query-one {:select [[[:count [:distinct :tenant_id]] :count]]
                 :from   [(t2/table-name :model/User)]
                 :where  [:and
                          [:= :is_active true]
                          [:= :type "personal"]
                          [:not= :tenant_id nil]]}))
