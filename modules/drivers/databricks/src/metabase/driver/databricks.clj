(ns metabase.driver.databricks
  (:refer-clojure :exclude [get-in not-empty])
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.hive-like :as driver.hive-like]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [get-in not-empty]]
   [ring.util.codec :as codec])
  (:import
   [java.sql
    Connection
    PreparedStatement
    ResultSet
    ResultSetMetaData
    Statement
    Types]
   [java.time
    LocalDate
    LocalDateTime
    LocalTime
    OffsetDateTime
    OffsetTime
    ZonedDateTime]))

(set! *warn-on-reflection* true)

(driver/register! :databricks, :parent :hive-like)

(defmethod driver/host-carrying-parameters :databricks
  [_driver]
  ["ProxyHost" "CFProxyHost" "OAuth2ConnAuthAuthorizeEndpoint" "OAuth2ConnAuthTokenEndpoint"
   "OAuth2AuthorizationEndPoint" "OAuth2TokenEndpoint" "OAuthDiscoveryURL" "OIDCDiscoveryEndpoint"])

(defmethod driver/non-host-parameters :databricks
  [_driver]
  ["ProxyPort" "CFProxyPort" "UseProxy" "UseCFProxy" "UseSystemProxy" "ProxyIgnoreList" "OAuth2RedirectUrlPort"
   "EnableOIDCDiscovery" "OAuthDiscoveryMode"])

(doseq [[feature supported?] {:basic-aggregations              true
                              :binning                         true
                              :database-routing                true
                              :describe-fields                 true
                              :expression-aggregations         true
                              :expression-literals             true
                              :expressions                     true
                              :multi-level-schema              true
                              :native-parameters               true
                              :nested-queries                  true
                              :set-timezone                    true
                              :stage-ctes                      true
                              :standard-deviation-aggregations true
                              :test/jvm-timezone-setting       false}]
  (defmethod driver/database-supports? [:databricks feature] [_driver _feature _db] supported?))

(defmethod sql-jdbc.sync/database-type->base-type :databricks
  [driver database-type]
  (condp re-matches (u/lower-case-en (name database-type))
    #"timestamp" :type/DateTimeWithLocalTZ
    #"timestamp_ntz" :type/DateTime
    ((get-method sql-jdbc.sync/database-type->base-type :hive-like)
     driver database-type)))

(defmethod driver/disallowed-connection-parameters :databricks
  [driver]
  (into ((get-method driver/disallowed-connection-parameters :sql-jdbc) driver)
        [;; Lets volume `PUT` and `GET` read and write local files
         "VolumeOperationAllowedLocalPaths"
         ;; Older spelling of `VolumeOperationAllowedLocalPaths`, which the client still honors
         "StagingAllowedLocalPaths"
         ;; Reads Google credentials from a local file
         "GoogleCredentialsFile"
         ;; Reads a private key from a local file
         "Auth_JWT_Key_File"
         ;; Writes the driver log to a chosen local directory
         "LogPath"]))

(defn- catalog-present?
  [jdbc-spec catalog]
  (let [sql "select 0 from `system`.`information_schema`.`catalogs` where catalog_name = ?"]
    (= 1 (count (jdbc/query jdbc-spec [sql catalog])))))

(defmethod driver/can-connect? :databricks
  [driver details]
  (driver/validate-db-details! driver details)
  (sql-jdbc.conn/with-connection-spec-for-testing-connection [jdbc-spec [driver details]]
    (and (catalog-present? jdbc-spec (:catalog details))
         (sql-jdbc.conn/can-connect-with-spec? jdbc-spec))))

(defmethod driver/adjust-schema-qualification :databricks
  [_driver database schema]
  (let [details      (driver.conn/effective-details database)
        multi-level? (:multi-level-schema details)
        catalog      (:catalog details)
        prefix       (str catalog ".")]
    (cond
      (and multi-level? (not (str/includes? schema ".")))
      (str prefix schema)

      (and (not multi-level?) (str/starts-with? schema prefix))
      (subs schema (count prefix))

      :else
      schema)))

(defn- split-catalog+schema
  [schema]
  (str/split schema #"\."))

(defmethod sql.qp/->honeysql [:databricks ::h2x/identifier]
  [_driver [tag identifier-type components :as _identifier]]
  (let [components (if (or (and (= identifier-type :table)
                                (>= (count components) 2))
                           (and (= identifier-type :field)
                                (>= (count components) 3)))
                     ;; period is an illegal character for identifiers in databricks so if it's present we can split and
                     ;; quote safely. docs.databricks.com/aws/en/sql/language-manual/sql-ref-names
                     (let [first-split (split-catalog+schema (first components))]
                       (into first-split (rest components)))
                     components)]
    (sql.qp/->honeysql :hive-like [tag identifier-type components])))

(defn- get-tables-sql
  [driver {:keys [catalog multi-level-schema]}]
  (assert (string? (not-empty catalog)))
  (sql/format {:select [[:t.table_name :name]
                        (if multi-level-schema
                          [[:concat :t.table_catalog [:inline "."] :t.table_schema] :schema]
                          [:t.table_schema :schema])
                        [:t.comment :description]]
               :from [[:system.information_schema.tables :t]]
               :where [:and
                       (when-not multi-level-schema [:= :t.table_catalog catalog])
                       [:<> :t.table_schema [:inline "information_schema"]]
                       [:not [:startswith :t.table_catalog [:inline "__databricks"]]]]}
              :dialect (sql.qp/quote-style driver)))

(defmethod driver/describe-database* :databricks
  [driver database]
  {:tables
   (reify clojure.lang.IReduceInit
     (reduce [_this rf init]
       (try
         (let [[inclusion-patterns
                exclusion-patterns] (driver.s/db-details->schema-filter-patterns database)
               included? (fn [schema]
                           (sql-jdbc.describe-database/include-schema-logging-exclusion inclusion-patterns exclusion-patterns schema))]
           (reduce rf init
                   (eduction
                    (filter (comp included? :schema))
                    (sql-jdbc.execute/reducible-query database (get-tables-sql driver (driver.conn/effective-details database))))))
         (catch Throwable e
           (throw (ex-info (format "Error in %s describe-database: %s" driver (ex-message e))
                           {}
                           e))))))})

(defn- schema-names-filter [schema-names multi-level-schema catalog-column schema-column]
  (when schema-names
    (if multi-level-schema
      ;; Use OR / AND because they are faster than IN for tuples on Databricks
      (into [:or]
            (map (fn [schema-name]
                   (let [[catalog schema] (split-catalog+schema schema-name)]
                     [:and [:= catalog-column catalog] [:= schema-column schema]])))
            schema-names)
      [:in schema-column schema-names])))

(defmethod sql-jdbc.sync/describe-fields-sql :databricks
  [driver & {:keys [schema-names table-names] {:keys [catalog multi-level-schema]} :details}]
  (assert (string? (not-empty catalog)) "`catalog` is required for sync.")
  (sql/format {:select [[:c.column_name :name]
                        [:c.full_data_type :database-type]
                        [:c.ordinal_position :database-position]
                        (if multi-level-schema
                          [[:concat :c.table_catalog [:inline "."] :c.table_schema] :table-schema]
                          [:c.table_schema :table-schema])
                        [:c.table_name :table-name]
                        [[:case [:= :cs.constraint_type [:inline "PRIMARY KEY"]] true :else false] :pk?]
                        [[:case [:not= :c.comment [:inline ""]] :c.comment :else nil] :field-comment]]
               :from [[:system.information_schema.columns :c]]
               ;; Following links contains contains diagram of `information_schema`:
               ;; https://docs.databricks.com/en/sql/language-manual/sql-ref-information-schema.html
               :left-join [[{:select   [[:tc.table_catalog :table_catalog]
                                        [:tc.table_schema :table_schema]
                                        [:tc.table_name :table_name]
                                        [:ccu.column_name :column_name]
                                        [:tc.constraint_type :constraint_type]]
                             :from     [[:system.information_schema.table_constraints :tc]]
                             :join     [[:system.information_schema.constraint_column_usage :ccu]
                                        [:and
                                         [:= :tc.constraint_catalog :ccu.constraint_catalog]
                                         [:= :tc.constraint_schema :ccu.constraint_schema]
                                         [:= :tc.constraint_name :ccu.constraint_name]]]
                             :where [:= :tc.constraint_type [:inline "PRIMARY KEY"]]
                             ;; In case on pk constraint is used by multiple columns this query would return duplicate
                             ;; rows. Group by ensures all rows are distinct. This may not be necessary, but rather
                             ;; safe than sorry.
                             :group-by [:tc.table_catalog
                                        :tc.table_schema
                                        :tc.table_name
                                        :ccu.column_name
                                        :tc.constraint_type]}
                            :cs]
                           [:and
                            [:= :c.table_catalog :cs.table_catalog]
                            [:= :c.table_schema :cs.table_schema]
                            [:= :c.table_name :cs.table_name]
                            [:= :c.column_name :cs.column_name]]]
               :where [:and
                       (when-not multi-level-schema [:= :c.table_catalog catalog])
                       [:not [:startswith :c.table_catalog [:inline "__databricks"]]]
                       [:not [:in :c.table_schema [[:inline "information_schema"]]]]
                       (schema-names-filter schema-names multi-level-schema :c.table_catalog :c.table_schema)
                       (when table-names [:in :c.table_name table-names])]
               :order-by [:table-schema :table-name :database-position]}
              :dialect (sql.qp/quote-style driver)))

(defmethod sql-jdbc.sync/describe-fks-sql :databricks
  [driver & {:keys [schema-names table-names] {:keys [catalog multi-level-schema]} :details}]
  (assert (string? (not-empty catalog)) "`catalog` is required for sync.")
  (sql/format {:select
               [(if multi-level-schema
                  [[:concat :fk_kcu.table_catalog [:inline "."] :fk_kcu.table_schema] "fk-table-schema"]
                  [:fk_kcu.table_schema "fk-table-schema"])
                [:fk_kcu.table_name "fk-table-name"]
                [:fk_kcu.column_name "fk-column-name"]
                (if multi-level-schema
                  [[:concat :pk_kcu.table_catalog [:inline "."] :pk_kcu.table_schema] "pk-table-schema"]
                  [:pk_kcu.table_schema "pk-table-schema"])
                [:pk_kcu.table_name "pk-table-name"]
                [:pk_kcu.column_name "pk-column-name"]]
               :from [[:system.information_schema.key_column_usage :fk_kcu]]
               :join [[:system.information_schema.referential_constraints :rc]
                      [:and
                       [:= :fk_kcu.constraint_catalog :rc.constraint_catalog]
                       [:= :fk_kcu.constraint_schema :rc.constraint_schema]
                       [:= :fk_kcu.constraint_name :rc.constraint_name]]
                      [:system.information_schema.key_column_usage :pk_kcu]
                      [[:and
                        [:= :pk_kcu.constraint_catalog :rc.unique_constraint_catalog]
                        [:= :pk_kcu.constraint_schema :rc.unique_constraint_schema]
                        [:= :pk_kcu.constraint_name :rc.unique_constraint_name]]]]
               :where [:and
                       (when-not multi-level-schema [:= :fk_kcu.table_catalog [:inline catalog]])
                       [:not [:startswith :fk_kcu.table_catalog [:inline "__databricks"]]]
                       [:not [:in :fk_kcu.table_schema ["information_schema"]]]
                       (schema-names-filter schema-names multi-level-schema :fk_kcu.table_catalog :fk_kcu.table_schema)
                       (when table-names [:in :fk_kcu.table_name table-names])]
               :order-by [:fk-table-schema :fk-table-name]}
              :dialect (sql.qp/quote-style driver)))

(defmethod sql-jdbc.execute/set-timezone-sql :databricks
  [_driver]
  "SET TIME ZONE %s;")

(defmethod driver/db-default-timezone :databricks
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database nil
   (fn [^Connection conn]
     (with-open [stmt (.prepareStatement conn "select current_timezone()")
                 rset (.executeQuery stmt)]
       (when (.next rset)
         (.getString rset 1))))))

(defn- preprocess-additional-options
  [additional-options]
  (when (string? (not-empty additional-options))
    (str/replace-first additional-options #"^(?!;)" ";")))

(defn- infer-auth-mode
  [{:keys [auth-mode use-m2m]}]
  (or auth-mode
      (if use-m2m "m2m" "pat")))

(defn- normalize-details [details]
  (when details
    (cond-> details
      (not (contains? details :auth-mode))
      (assoc :auth-mode (infer-auth-mode details)))))

(defmethod driver/normalize-db-details :databricks
  [_driver database]
  (-> database
      (m/update-existing :details normalize-details)
      (m/update-existing :write_data_details normalize-details)))

(defmethod driver/db-details-to-test-and-migrate :databricks
  [_driver {:keys [auth-mode] :as details}]
  (when (nil? auth-mode)
    [(assoc details :auth-mode (infer-auth-mode details))]))

(def ^:private hosted-allowed-wif-providers
  ;; OIDC is the only WIF mode on Metabase Cloud where the identity is admin-supplied. AWS/AZURE
  ;; pull an attestation from the Metabase Cloud host, which would authenticate as Metabase Cloud.
  #{"OIDC"})

(defn- wif-jdbc-properties
  [{:keys [wif-provider wif-token wif-token-file-path wif-client-id wif-audience]}]
  (when (and (driver-api/is-hosted?)
             (not (contains? hosted-allowed-wif-providers wif-provider)))
    (throw (ex-info (tru (str "Workload identity federation with the {0} provider is not available "
                              "on Metabase Cloud. Use OIDC with an explicit token.")
                         wif-provider)
                    {:wif-provider wif-provider})))
  (let [token     (case wif-provider
                    "OIDC" (cond
                             (not (str/blank? wif-token-file-path))
                             (str/trim (slurp (driver-api/ensure-readable-path! wif-token-file-path)))

                             (not (str/blank? wif-token))
                             wif-token)
                    "GCP"  (driver.u/wif-ambient-token-http wif-provider wif-audience)
                    (throw (ex-info (format "Unsupported WIF provider: %s" (pr-str wif-provider))
                                    {:wif-provider wif-provider})))
        expiry-ms (u/ignore-exceptions (some-> token driver.u/jwt-expiry-ms))]
    (cond-> {:AuthMech         11
             :Auth_Flow        0
             :Auth_AccessToken token}
      (not (str/blank? wif-client-id)) (assoc :Identity_Federation_Client_Id wif-client-id)
      expiry-ms                        (assoc :password-expiry-timestamp expiry-ms))))

(defmethod sql-jdbc.conn/connection-details->spec :databricks
  [_driver {:keys [catalog host http-path token client-id oauth-secret log-level additional-options]
            :as details}]
  (assert (string? (not-empty catalog)) "Catalog is mandatory.")
  (let [base-spec
        {:classname      "com.databricks.client.jdbc.Driver"
         :subprotocol    "databricks"
         :subname        (str "//" host ":443/"
                              ";ConnCatalog=" (codec/url-encode catalog)
                              (preprocess-additional-options additional-options))
         :transportMode  "http"
         :ssl            1
         :HttpPath       http-path
         :UserAgentEntry (format "Metabase/%s" (:tag driver-api/mb-version-info))
         :UseNativeQuery 1
         :UseThriftClient (if-let [[_ use-thrift] (and additional-options
                                                       (re-matches #"UseThriftClient=(.*)"
                                                                   additional-options))]
                            (parse-long use-thrift)
                            0)}]
    (merge base-spec
           (when log-level
             {:LogLevel log-level})
           (case (infer-auth-mode details)
             "wif" (wif-jdbc-properties details)
             "m2m" {:AuthMech        11
                    :Auth_Flow       1
                    :OAuth2ClientId  client-id
                    :OAuth2Secret    oauth-secret}
             "pat" {:AuthMech 3
                    :uid      "token"
                    :pwd      token}))))

(defmethod sql.qp/quote-style :databricks
  [_driver]
  :mysql)

(defmethod sql.qp/date [:databricks :day-of-week] [driver _ expr]
  (sql.qp/adjust-day-of-week driver [:dayofweek (h2x/->timestamp expr)]))

(defmethod driver/db-start-of-week :databricks
  [_]
  :sunday)

(defmethod sql.qp/date [:databricks :week]
  [driver _unit expr]
  (let [week-extract-fn (fn [expr]
                          (-> [:date_sub
                               (h2x/+ (h2x/->timestamp expr)
                                      [::driver.hive-like/interval 1 :day])
                               [:dayofweek (h2x/->timestamp expr)]]
                              (h2x/with-database-type-info "timestamp")))]
    (sql.qp/adjust-start-of-week driver week-extract-fn expr)))

;;; ----------------------------------------------- Query tags ------------------------------------------------------

;; Databricks query tags are key/value pairs attached to every statement of a session and exposed in
;; `system.query.history.query_tags`. We set them with `SET QUERY_TAGS[...]` right before a query runs on a (pooled)
;; connection. See https://docs.databricks.com/aws/en/sql/user/queries/query-tags

(def ^:private max-query-tags 20)

(def ^:private max-query-tag-key-length 32)

(def ^:private max-query-tag-value-length 128)

(def ^:private invalid-query-tag-key-regex
  "Characters Databricks does not allow in tag keys."
  #"[,:\-/=.]")

(def ^:private query-tags-comment-regex
  "A `-- query_tags: team:data, env:prod, experiment` line comment in native SQL."
  #"(?im)^[ \t]*--[ \t]*query[_-]tags[ \t]*:[ \t]*(.+?)[ \t]*$")

(def ^:private query-tag-template-variable-regex
  "`{{dashboard.id}}` in a tag template."
  #"\{\{\s*([^{}\s]+)\s*\}\}")

(defn- valid-query-tag-key? [k]
  (and (string? k)
       (not (str/blank? k))
       (<= (count k) max-query-tag-key-length)
       (not (re-find invalid-query-tag-key-regex k))
       (not (str/starts-with? k "@@"))))

(defn- tag-value
  "Tag value for a context value; multiple values are joined with `,`."
  [v]
  (cond
    (nil? v)        nil
    (sequential? v) (str/join "," (map tag-value v))
    (keyword? v)    (name v)
    :else           (str v)))

(defn- user-query-tags
  "Tags the user asked for in a native query with a `-- query_tags: key:value, key2:value2, key_only` comment. Uses the
  same `key:value,key:value` format as the Databricks `query_tags` connection parameter. A key without a value becomes a
  key-only tag. Invalid keys are dropped with a warning instead of failing the query."
  [sql]
  (when (string? sql)
    (not-empty
     (into {}
           (comp (mapcat (fn [[_ tags]] (str/split tags #",")))
                 (map str/trim)
                 (remove str/blank?)
                 (keep (fn [tag]
                         (let [[k v] (map str/trim (str/split tag #":" 2))]
                           (if (valid-query-tag-key? k)
                             [k (not-empty v)]
                             (log/warnf "Ignoring invalid Databricks query tag key %s" (pr-str k)))))))
           (re-seq query-tags-comment-regex sql)))))

(defn- parameter-names
  "Names a query parameter can be referred to by in a template: its slug (dashboard filter or template tag) and the
  template tag it targets, e.g. `[:variable [:template-tag \"company_id\"]]`."
  [{:keys [slug target]}]
  (let [[_ [clause tag-name]] (when (sequential? target) target)]
    (cond-> #{}
      slug                                                    (conj slug)
      (and (= clause :template-tag) (string? tag-name))       (conj tag-name)
      (and (= clause :template-tag) (string? (:id tag-name))) (conj (:id tag-name)))))

(defn- stringify-keys [m]
  (into {} (map (fn [[k v]] [(name k) v])) m))

(defn- query-tag-context
  "Everything a tag template can refer to, as nested maps with string keys: `{{card.id}}` is `[\"card\" \"id\"]`.
  Parameters come from `:user-parameters`, which the query processor keeps on the query it hands to the driver."
  [query]
  (let [{:keys [executed-by context card-id card-name card-entity-id collection-id dashboard-id dashboard-name
                dashboard-entity-id pulse-id action-id transform-id]} (:info query)
        {:keys [query-hash query-type]} (driver-api/query->remark-data query)
        user                            (driver-api/current-user-details)]
    {"query"     {"hash" query-hash, "type" query-type, "context" context}
     "card"      {"id" card-id, "name" card-name, "entity_id" card-entity-id, "collection_id" collection-id}
     "dashboard" {"id" dashboard-id, "name" dashboard-name, "entity_id" dashboard-entity-id}
     "pulse"     {"id" pulse-id}
     "action"    {"id" action-id}
     "transform" {"id" transform-id}
     "database"  {"id" (:database query)}
     "user"      {"id"         (or executed-by (:id user))
                  "email"      (:email user)
                  "attributes" (stringify-keys (:attributes user))}
     "parameter" (into {}
                       (for [{:keys [value] :as param} (:user-parameters query)
                             :when (some? value)
                             param-name (parameter-names param)]
                         [param-name value]))
     "instance"  {"uuid" (driver-api/site-uuid), "url" (driver-api/site-url)}}))

(defn- render-query-tag-template
  "`template` with its `{{a.b}}` variables replaced from `context`, or nil when any variable has no value, so that a
  tag like `company: {{parameter.company_id}}` is left out of queries that have no such parameter."
  [template context]
  (let [missing? (volatile! false)
        rendered (str/replace template query-tag-template-variable-regex
                              (fn [[_ path]]
                                (let [value (get-in context (str/split path #"\."))]
                                  (if (nil? value)
                                    (do (vreset! missing? true) "")
                                    (tag-value value)))))]
    (when-not @missing?
      (str/trim rendered))))

(defn- parse-query-tags-template
  "The `Query tags` connection detail: one `key: value template` per line, `#` lines are comments. A key without a
  value becomes a key-only tag."
  [template]
  (for [line  (str/split-lines (str template))
        :let  [line (str/trim line)]
        :when (and (seq line) (not (str/starts-with? line "#")))
        :let  [[k v] (str/split line #":" 2)]]
    [(str/trim k) (some-> v str/trim not-empty)]))

(defn- template-query-tags
  "Tags from the `Query tags` connection detail rendered against the context of `query`. Invalid keys are dropped with
  a warning instead of failing the query."
  [template query]
  (let [context (query-tag-context query)]
    (into {}
          (keep (fn [[k v]]
                  (cond
                    (not (valid-query-tag-key? k))
                    (log/warnf "Ignoring invalid Databricks query tag key %s" (pr-str k))

                    (nil? v)
                    [k nil]

                    :else
                    (when-some [rendered (render-query-tag-template v context)]
                      [k (not-empty rendered)]))))
          (parse-query-tags-template template))))

(defn- query-tags
  "Map of tag key -> value (nil for key-only tags) to attach to `query`: the `-- query_tags:` comment of a native
  query, overridden by the `Query tags` template of the connection. At most [[max-query-tags]] tags."
  [query template]
  (->> (merge (user-query-tags (-> query :stages peek :native))
              (template-query-tags template query))
       (take max-query-tags)
       (into {})))

(defn- sql-string-literal
  "Spark SQL string literal; backslash is the escape character."
  [s]
  (str "'" (-> (str s)
               (str/replace "\\" "\\\\")
               (str/replace "'" "\\'"))
       "'"))

(defn- set-query-tags-sql
  "`SET QUERY_TAGS[...] = ...` statement that sets `tags` and removes `unset-keys`."
  [tags unset-keys]
  (str "SET "
       (str/join ", "
                 (concat (for [[k v] tags]
                           (format "QUERY_TAGS[%s] = %s"
                                   (sql-string-literal k)
                                   (if (nil? v)
                                     "NULL"
                                     (sql-string-literal (subs v 0 (min (count v) max-query-tag-value-length))))))
                         (for [k unset-keys]
                           (format "QUERY_TAGS[%s] = UNSET" (sql-string-literal k)))))))

(def ^:private ^java.util.Map connection->query-tag-keys
  "Physical connection -> keys of the tags we last set on its session. Tags live on the Databricks session, and pooled
  connections are reused, so we need to know what to UNSET before the next query."
  (java.util.Collections/synchronizedMap (java.util.WeakHashMap.)))

(defn- physical-connection
  "The connection behind a pool proxy, so the same session maps to the same key across checkouts."
  ^Connection [^Connection conn]
  (try
    (or (.unwrap conn Connection) conn)
    (catch Throwable _
      conn)))

(defn- apply-query-tags!
  "Make the session of `conn` carry exactly `tags`: set them, and UNSET whatever we set on this session before."
  [^Connection conn tags]
  (let [conn-key   (physical-connection conn)
        prev-keys  (or (.get connection->query-tag-keys conn-key) #{})
        new-keys   (set (keys tags))
        unset-keys (set/difference prev-keys new-keys)]
    (when (or (seq tags) (seq unset-keys))
      (with-open [^Statement stmt (.createStatement conn)]
        (.execute stmt (set-query-tags-sql tags unset-keys)))
      (if (seq new-keys)
        (.put connection->query-tag-keys conn-key new-keys)
        (.remove connection->query-tag-keys conn-key)))))

(defn- query-tags-for-connection
  "Tags for the query the connection is checked out for (see `:query` in [[sql-jdbc.execute/ConnectionOptions]]), or
  nil when there is no query or the database has no `Query tags` template."
  [db-or-id-or-spec {:keys [query]}]
  (when (and query (map? db-or-id-or-spec))
    (when-let [template (not-empty (str/trim (str (:query-tags (driver.conn/effective-details db-or-id-or-spec)))))]
      (query-tags query template))))

(defmethod sql-jdbc.execute/do-with-connection-with-options :databricks
  [driver db-or-id-or-spec options f]
  (sql-jdbc.execute/do-with-resolved-connection
   driver
   db-or-id-or-spec
   options
   (fn [^Connection conn]
     (let [read-only? (.isReadOnly conn)]
       (try
         (.setReadOnly conn false)
         ;; Method is re-implemented because `legacy_time_parser_policy` has to be set to pass the test suite.
         ;; https://docs.databricks.com/en/sql/language-manual/parameters/legacy_time_parser_policy.html
         (with-open [^Statement stmt (.createStatement conn)]
           (.execute stmt "set legacy_time_parser_policy = legacy"))
         (apply-query-tags! conn (query-tags-for-connection db-or-id-or-spec options))
         (finally
           (.setReadOnly conn read-only?))))
     (sql-jdbc.execute/set-default-connection-options! driver db-or-id-or-spec conn options)
     (f conn))))

(defmethod sql.qp/datetime-diff [:databricks :second]
  [_driver _unit x y]
  [:-
   [:unix_timestamp y (if (instance? LocalDate y)
                        (h2x/literal "yyyy-MM-dd")
                        (h2x/literal "yyyy-MM-dd HH:mm:ss"))]
   [:unix_timestamp x (if (instance? LocalDate x)
                        (h2x/literal "yyyy-MM-dd")
                        (h2x/literal "yyyy-MM-dd HH:mm:ss"))]])

(def ^:private timestamp-database-type-names #{"TIMESTAMP" "TIMESTAMP_NTZ"})

;; Both timestamp types, TIMESTAMP and TIMESTAMP_NTZ, are returned in `Types/TIMESTAMP` sql type. TIMESTAMP is wall
;; clock with date in session timezone. Hence the following implementation adds the results timezone in LocalDateTime
;; gathered from JDBC driver and then adjusts the value to ZULU. Presentation tweaks (ie. changing to report for users'
;; pleasure) are done in `wrap-value-literals` middleware.
(defmethod sql-jdbc.execute/read-column-thunk [:databricks java.sql.Types/TIMESTAMP]
  [_driver ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  ;; TIMESTAMP is returned also for TIMESTAMP_NTZ type!!! Hence only true branch is hit until this is fixed upstream.
  (let [database-type-name (.getColumnTypeName rsmeta i)]
    (assert (timestamp-database-type-names database-type-name))
    (if (= "TIMESTAMP" database-type-name)
      (fn []
        (assert (some? (driver-api/results-timezone-id)))
        (when-let [t (.getTimestamp rs i)]
          (t/with-offset-same-instant
            (t/offset-date-time
             (t/zoned-date-time (t/local-date-time t)
                                (t/zone-id (driver-api/results-timezone-id))))
            (t/zone-id "Z"))))
      (fn []
        (when-let [t (.getTimestamp rs i)]
          (t/local-date-time t))))))

(defn- date-time->results-local-date-time
  "For datetime types with zone info generate LocalDateTime as in that zone. Databricks java driver does not support
  setting OffsetDateTime or ZonedDateTime parameters. It uses parameters as in session timezone. Hence, this function
  shifts LocalDateTime so wall clock corresponds to Databricks' timezone."
  [dt]
  (if (instance? LocalDateTime dt)
    dt
    (let [tz-str      (try (driver-api/results-timezone-id)
                           (catch Throwable _
                             (log/trace "Failed to get `results-timezone-id`. Using system timezone.")
                             (driver-api/system-timezone-id)))
          adjusted-dt (t/with-zone-same-instant (t/zoned-date-time dt) (t/zone-id tz-str))]
      (t/local-date-time adjusted-dt))))

(defn- set-parameter-to-local-date-time
  [driver prepared-statement index object]
  ((get-method sql-jdbc.execute/set-parameter [::sql-jdbc.legacy/use-legacy-classes-for-read-and-set LocalDateTime])
   driver prepared-statement index (date-time->results-local-date-time object)))

(defmethod sql-jdbc.execute/set-parameter [:databricks OffsetDateTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index object))

(defmethod sql-jdbc.execute/set-parameter [:databricks ZonedDateTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index object))

;;
;; `set-parameter` is implemented also for LocalTime and OffsetTime, even though Databricks does not support time types.
;; It enables creation of `attempted-murders` dataset, hence making the driver compatible with more of existing tests.
;;

(defmethod sql-jdbc.execute/set-parameter [:databricks LocalTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index
                                    (t/local-date-time (t/local-date 1970 1 1) object)))

(defmethod sql-jdbc.execute/set-parameter [:databricks OffsetTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index
                                    (t/local-date-time (t/local-date 1970 1 1) object)))

(defmethod sql-jdbc.execute/set-parameter [:databricks (Class/forName "[B")]
  [_driver ^PreparedStatement _prepared-statement ^Integer _index _object]
  (throw (ex-info "Databricks driver cannot ingest byte array." {}))
  ;; I really did try all of these options. Databricks team says we need to use the OSS version. See
  ;; https://metaboat.slack.com/archives/C07L35T7UFQ/p1750703587969479

  ;; .setBytes() with raw byte array
  ;; Fails with
  ;; HIVE_PARAMETER_QUERY_DATA_TYPE_ERR_NON_SUPPORT_DATA_TYPE
  #_(.setBytes prepared-statement index object)

  ;; byte array as object
  ;; Ingests toString of reference and tests fail with
  ;; [CANNOT_PARSE_TIMESTAMP] Unparseable date: "[B@3b56756d".
  #_(.setObject prepared-statement index object)

  ;; byte array as object with jdbc type BINARY
  ;; Ingests toString of reference and tests fail with
  ;; [CANNOT_PARSE_TIMESTAMP] Unparseable date: "[B@3b56756d".
  #_(.setObject prepared-statement index object Types/BINARY)

  ;; byte array as object with jdbc type BINARY
  ;; Fails with
  ;; HIVE_PARAMETER_QUERY_DATA_TYPE_ERR_NON_SUPPORT_DATA_TYPE
  #_(.setObject prepared-statement index object Types/VARBINARY)

  ;; Array of Bytes with jdbc type ARRAY
  ;; Fails with
  ;; [Databricks][JDBC](11500) Given type does not match given object: [Ljava.lang.Byte;@1e1ac2b6.
  #_(.setObject prepared-statement index (into-array Byte (map #(Byte/valueOf %) object)) Types/ARRAY)

  ;; Array of Bytes with jdbc type BINARY
  ;; Fails with
  ;; [Databricks][JDBC](11500) Given type does not match given object: [Ljava.lang.Byte;@1e1ac2b6.
  #_(.setObject prepared-statement index (into-array Byte (map #(Byte/valueOf %) object)) Types/BINARY)

  ;; Array of Bytes with jdbc type BINARY
  ;; Fails with
  ;; [Databricks][JDBC](11500) Given type does not match given object: [Ljava.lang.Byte;@1e1ac2b6.
  #_(.setObject prepared-statement index (into-array Byte (map #(Byte/valueOf %) object)) Types/VARBINARY)

  ;; Array of Bytes with no jdbc type
  ;; Fails with
  ;; HIVE_PARAMETER_QUERY_DATA_TYPE_ERR_NON_SUPPORT_DATA_TYPE
  #_(.setObject prepared-statement index (into-array Byte (map #(Byte/valueOf %) object)))

  ;; .setArray with array of Bytes with jdbc type "BINARY"
  ;; Fails with
  ;; [Databricks][JDSI](20300) Data type not supported: BINARY ({1})
  #_(let [connection (.getConnection prepared-statement)]
      (.setArray prepared-statement index
                 (.createArrayOf connection "BINARY"
                                 (into-array Byte (map #(Byte/valueOf %) object)))))

  ;; .setArray with array of Bytes with jdbc type "VARBINARY"
  ;; Fails with
  ;; Array is not valid
  #_(let [connection (.getConnection prepared-statement)]
      (.setArray prepared-statement index
                 (.createArrayOf connection "VARBINARY"
                                 (into-array Byte (map #(Byte/valueOf %) object)))))

  ;; .setArray with array of Bytes with jdbc type "ARRAY"
  ;; Fails with
  ;; [Databricks][JDSI](20300) Data type not supported: ARRAY ({1})
  #_(let [connection (.getConnection prepared-statement)]
      (.setArray prepared-statement index
                 (.createArrayOf connection "ARRAY"
                                 (into-array Byte (map #(Byte/valueOf %) object)))))

  ;; .setArray with array of Bytes with jdbc type "ARRAY<BINARY>"
  ;; Ingest "succeeds" but there are no rows in the table
  #_(let [connection (.getConnection prepared-statement)]
      (.setArray prepared-statement index
                 (.createArrayOf connection "ARRAY<BINARY>"
                                 (into-array Byte (map #(Byte/valueOf %) object)))))

  ;; Hex string
  ;; Fails with:
  ;; [Databricks][JDBC](11500) Given type does not match given object: 3230313930343231313634333030.
  #_(.setObject prepared-statement index (codecs/bytes->hex object) Types/BINARY)

  ;; base64 string
  ;; Fails with:
  ;; [Databricks][JDBC](11500) Given type does not match given object: MjAxOTA0MjExNjQzMDA=.
  #_(.setObject prepared-statement index (codecs/bytes->b64-str object) Types/BINARY))

(defmethod sql.qp/->integer :databricks
  [driver value]
  (sql.qp/->integer-with-round driver value))

(defmethod sql.qp/->honeysql [:databricks ::sql.qp/cast-to-text]
  [driver [_ _opts expr]]
  (sql.qp/->honeysql driver [::sql.qp/cast {} expr "string"]))

(defmethod sql-jdbc/impl-table-known-to-not-exist? :databricks
  [_ e]
  (= (sql-jdbc/get-sql-state e) "42P01"))

(defmethod sql-jdbc.execute/read-column-thunk [:databricks Types/ARRAY]
  [_driver ^java.sql.ResultSet rs _rsmeta ^Integer i]
  ;; This differs from the sql-jdbc implementation due to a change in
  ;; Databricks' JDBC driver from 2.7.3 to 3.0.1. It returns the type
  ;; of an array column as Types/ARRAY now, but the object is a
  ;; java.lang.String, so we can't call .getArray on it and instead
  ;; should return it as is.
  (fn [] (.getObject rs i)))
