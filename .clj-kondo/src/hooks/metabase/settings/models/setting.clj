(ns hooks.metabase.settings.models.setting
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common :as common]))

(defn lint-defsetting-namespace [node context]
  (when-not (re-matches #"^metabase(?:-enterprise)?\.[^\.]+\.settings$" (name (:ns context)))
    (hooks/reg-finding! (assoc (meta node)
                               :message "All defsettings should live in metabase[-enterprise].<module>.settings namespaces"
                               :type :metabase/defsetting-namespace))))

;;; TODO -- move this into a Kondo config file in `.clj-kondo/config/`
(def ^:private ignored-implicit-export?
  '#{active-users-count
     admin-email
     analytics-uuid
     anon-tracking-enabled
     api-key
     attachment-table-row-limit
     audit-max-retention-days
     bcc-enabled?
     breakout-bin-width
     check-for-updates
     cloud-gateway-ips
     config-from-file-sync-databases
     custom-homepage
     custom-homepage-dashboard
     database-enable-actions
     deprecation-notice-version
     dismissed-custom-dashboard-toast
     email-configured?
     email-from-address
     email-from-name
     email-reply-to
     email-smtp-host
     email-smtp-password
     email-smtp-port
     email-smtp-security
     email-smtp-username
     embedding-app-origin
     embedding-secret-key
     enable-password-login
     enable-public-sharing
     enable-query-caching
     engines
     enum-cardinality-threshold
     follow-up-email-sent
     google-auth-auto-create-accounts-domain
     google-auth-client-id
     google-auth-configured
     google-auth-enabled
     has-sample-database?
     has-user-setup
     help-link
     help-link-custom-destination
     instance-creation
     is-hosted?
     is-metabot-enabled
     jdbc-data-warehouse-max-connection-pool-size
     jdbc-data-warehouse-unreturned-connection-timeout-seconds
     jwt-attribute-email
     jwt-attribute-firstname
     jwt-attribute-groups
     jwt-attribute-lastname
     jwt-configured
     jwt-enabled
     jwt-group-mappings
     jwt-group-sync
     jwt-identity-provider-uri
     jwt-user-provisioning-enabled?
     jwt-shared-secret
     last-acknowledged-version
     last-used-native-database-id
     ldap-attribute-email
     ldap-attribute-firstname
     ldap-attribute-lastname
     ldap-bind-dn
     ldap-configured?
     ldap-enabled
     ldap-group-base
     ldap-group-mappings
     ldap-group-membership-filter
     ldap-group-sync
     ldap-host
     ldap-password
     ldap-port
     ldap-user-provisioning-enabled?
     ldap-security
     ldap-sync-user-attributes
     ldap-sync-user-attributes-blacklist
     ldap-user-base
     ldap-user-filter
     load-analytics-content
     map-tile-server-url
     metabot-default-embedding-model
     metabot-feedback-url
     metabot-get-prompt-templates-url
     metabot-prompt-generator-token-limit
     multi-setting-read-only
     notebook-native-preview-sidebar-width
     notification-link-base-url
     num-metabot-choices
     openai-api-key
     openai-available-models
     openai-model
     openai-organization
     other-sso-enabled?
     password-complexity
     persist-models-enabled
     persisted-model-refresh-cron-schedule
     premium-embedding-token
     prometheus-server-port
     query-caching-max-kb
     query-caching-max-ttl
     query-caching-min-ttl
     query-caching-ttl-ratio
     redirect-all-requests-to-https
     reset-token-ttl-hours
     retired-setting
     retry-initial-interval
     retry-max-retries
     retry-max-interval-millis
     retry-multiplier
     retry-jitter-factor
     saml-application-name
     saml-attribute-email
     saml-attribute-firstname
     saml-attribute-group
     saml-attribute-lastname
     saml-configured
     saml-enabled
     saml-group-mappings
     saml-group-sync
     saml-identity-provider-certificate
     saml-identity-provider-issuer
     saml-identity-provider-uri
     saml-keystore-alias
     saml-keystore-password
     saml-keystore-path
     saml-user-provisioning-enabled?
     sdk-iframe-embed-setup-settings
     send-email-on-first-login-from-new-device
     send-new-sso-user-admin-email?
     session-cookie-samesite
     session-cookies
     session-timeout
     setup-token
     show-database-syncing-modal
     show-metabase-links
     site-url
     site-uuid
     site-uuid-for-premium-features-token-checks
     site-uuid-for-unsubscribing-url
     site-uuid-for-version-info-fetching
     slack-app-token
     slack-cached-channels-and-usernames
     slack-channels-and-usernames-last-updated
     slack-files-channel
     slack-token
     slack-token-valid?
     snowplow-available
     snowplow-enabled
     snowplow-url
     sql-jdbc-fetch-size
     ssh-heartbeat-interval-sec
     ssl-certificate-public-key
     startup-time-millis
     token-features
     token-status
     toucan-name
     trial-banner-dismissal-timestamp
     uncached-setting
     user-visibility
     version
     version-info
     version-info-last-checked})

(defn- lint-defsetting-export [node]
  (let [[_defsetting setting-name _docstring & options] (:children node)]
    (when (nil? (second (drop-while (comp not #{[:k :export?]} first) options)))
      (when-not (contains? ignored-implicit-export? (:value setting-name))
        (hooks/reg-finding! (assoc (meta node)
                                   :message "Setting definition must provide an explicit value for :export? indicating whether the setting should be exported or not with serialization."
                                   :type :metabase/defsetting-must-specify-export))))))

(defn- defsetting-replacement-node [node]
  (let [[_defsetting setting-name docstring & options-list] (:children node)
        anon-binding (common/with-macro-meta (hooks/token-node '_) node)
        ;; (defn my-setting [] ...)
        getter-node (-> (list
                         (hooks/token-node 'defn)
                         setting-name
                         (hooks/string-node "Docstring.")
                         (hooks/vector-node []))
                        hooks/list-node
                        (with-meta (meta node)))
        ;; (defn my-setting! [_x] ...)
        setter-node (-> (list
                         (hooks/token-node 'defn)
                         (with-meta
                          (hooks/token-node (symbol (str (hooks/sexpr setting-name) \!)))
                          (meta setting-name))
                         (hooks/string-node "Docstring.")
                         (hooks/vector-node [(hooks/token-node '_value-or-nil)]))
                        hooks/list-node
                        (with-meta (meta node))
                        common/add-lsp-ignore-unused-public-var-metadata)]
    (-> (hooks/list-node
         (list
          (hooks/token-node 'let)
          ;; include description and the options map so they can get validated as well.
          (hooks/vector-node
           [anon-binding docstring
            anon-binding (hooks/map-node options-list)])
          (hooks/reg-keyword! (-> (hooks/keyword-node (keyword (hooks/sexpr setting-name)))
                                  (with-meta (meta setting-name)))
                              'metabase.settings.models.setting/defsetting)
          getter-node
          setter-node))
        (with-meta (meta node)))))

(defn defsetting
  "Rewrite a [[metabase.models.defsetting]] form like

    (defsetting my-setting \"Description\" :type :boolean)

  as

    (let [_ \"Description\"
          _ {:type :boolean}]
      (defn my-setting \"Docstring.\" [])
      (defn my-setting! \"Docstring.\" [_value-or-nil]))

  for linting purposes."
  [{:keys [node], :as context}]
  (lint-defsetting-namespace node context)
  (lint-defsetting-export node)
  (update context :node defsetting-replacement-node))

(defn define-multi-setting-replacement-node [node]
  (let [[defsetting setting-name docstring thunk & options] (:children node)]
    (-> (hooks/list-node
         (list*
          defsetting
          setting-name
          docstring
          (hooks/token-node :multi-thunk) thunk
          options))
        (with-meta (meta node))
        defsetting-replacement-node)))

(defn define-multi-setting
  "Rewrite a [[metabase.models.define-multi-setting]] form like

    (defsetting my-setting \"Description\" :key :type :boolean)

  as

    (let [_ \"Description\"
          _ {:type :boolean, :multi-thunk :key}]
      (defn my-setting \"Docstring.\" [])
      (defn my-setting! \"Docstring.\" [_value-or-nil]))

  for linting purposes."
  [{:keys [node], :as context}]
  (update context :node define-multi-setting-replacement-node))

(defn define-multi-setting-impl
  [context]
  (letfn [(update-node [node]
            (let [[_define-multi-setting-impl setting-name & more] (:children node)]
              (-> (hooks/list-node
                   (list*
                    (hooks/token-node 'do)
                    ;; For a qualified setting name like `oss-namespace/setting`, then leave the symbol as is, so the
                    ;; usage of that namespace/var gets recorded. Otherwise for an unqualified name convert it to a
                    ;; keyword so we don't get unresolved var errors.
                    (if (and (hooks/token-node? setting-name)
                             (qualified-symbol? (hooks/sexpr setting-name)))
                      setting-name
                      (-> (hooks/keyword-node (keyword (hooks/sexpr setting-name)))
                          (with-meta (meta setting-name))))
                    more))
                  (with-meta (meta node)))))]
    (update context :node update-node)))

(comment
  (defn- defsetting* [form]
    (hooks/sexpr
     (:node
      (defsetting
        {:node
         (hooks/parse-string
          (with-out-str
            #_{:clj-kondo/ignore [:unresolved-namespace]}
            (clojure.pprint/pprint
             form)))}))))

  (defn x []
    (defsetting*
      '(defsetting active-users-count
         (deferred-tru "Cached number of active users. Refresh every 5 minutes.")
         :visibility :admin
         :type       :integer
         :default    0
         :getter     (fn []
                       (if-not ((requiring-resolve 'metabase.app-db.core/db-is-set-up?))
                         0
                         (cached-active-users-count)))))))
