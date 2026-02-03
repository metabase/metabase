(ns metabase.embedding.settings
  "Settings related to embedding Metabase in other applications."
  (:require
   [clojure.string :as str]
   [metabase.analytics.core :as analytics]
   [metabase.premium-features.core :as premium-features]
   [metabase.server.settings :as server.settings]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

(defsetting embedding-secret-key
  (deferred-tru "Secret key used to sign JSON Web Tokens for requests to `/api/embed` endpoints.")
  :encryption :when-encryption-key-set
  :visibility :admin
  :audit :no-value
  :setter (fn [new-value]
            (when (seq new-value)
              (assert (u/hexadecimal-string? new-value)
                      (i18n/tru "Invalid embedding-secret-key! Secret key must be a hexadecimal-encoded 256-bit key (i.e., a 64-character string).")))
            (setting/set-value-of-type! :string :embedding-secret-key new-value)))

(defsetting show-static-embed-terms
  (deferred-tru "Check if the static embedding licensing should be hidden in the static embedding flow")
  :type    :boolean
  :default true
  :export? true
  :getter  (fn []
             (if (premium-features/hide-embed-branding?)
               false
               (setting/get-value-of-type :boolean :show-static-embed-terms))))

(defsetting show-sdk-embed-terms
  (deferred-tru "Check if admin should see the SDK licensing terms popup")
  :type    :boolean
  :default true
  :can-read-from-env? false
  :doc false
  :export? true)

(defsetting show-simple-embed-terms
  (deferred-tru "Check if admin should see the simple embedding terms popup")
  :type    :boolean
  :default true
  :can-read-from-env? false
  :doc false
  :export? true)

(mu/defn- make-embedding-toggle-setter
  "Creates a boolean setter for various boolean embedding-enabled flavors, all tracked by snowplow."
  [setting-key :- :keyword event-name :- :string]
  (fn [new-value]
    (u/prog1 new-value
      (let [old-value (setting/get-value-of-type :boolean setting-key)]
        (when (not= new-value old-value)
          (setting/set-value-of-type! :boolean setting-key new-value)
          (when (and new-value (str/blank? (embedding-secret-key)))
            (embedding-secret-key! (u.random/secure-hex 32)))
          (analytics/track-event! :snowplow/embed_share
                                  {:event                      (keyword (str event-name (if new-value "-enabled" "-disabled")))
                                   :embedding-app-origin-set   (boolean
                                                                (or (setting/get-value-of-type :string :embedding-app-origin)
                                                                    (setting/get-value-of-type :string :embedding-app-origins-interactive)
                                                                    (let [sdk-origins (setting/get-value-of-type :string :embedding-app-origins-sdk)]
                                                                      ;; Don't track "localhost:*" as a meaningful origin since it was
                                                                      ;; the old default and may still exist in migrated instances
                                                                      (and sdk-origins (not (str/blank? sdk-origins)) (not= "localhost:*" sdk-origins)))))
                                   :number-embedded-questions  (t2/count :model/Card :enable_embedding true)
                                   :number-embedded-dashboards (t2/count :model/Dashboard :enable_embedding true)}))))))

(defsetting ^:deprecated enable-embedding
  ;; To be removed in 0.53.0
  (deferred-tru "Allow admins to securely embed questions and dashboards within other applications?")
  :type       :boolean
  :default    false
  :visibility :authenticated
  :export?    true
  :audit      :getter
  :deprecated "0.51.0"
  :setter     (make-embedding-toggle-setter :enable-embedding "embedding"))

(defsetting ^:deprecated embedding-app-origin
  ;; To be removed in 0.53.0
  (deferred-tru "Allow this origin to embed the full Metabase application.")
  ;; This value is usually gated by [[enable-embedding]]
  :feature    :embedding
  :deprecated "0.51.0"
  :type       :string
  :export?    false
  :visibility :public
  :audit      :getter
  :encryption :no)

(defsetting enable-embedding-sdk
  (deferred-tru "Allow admins to embed Metabase via the SDK?")
  :type       :boolean
  :default    false
  :visibility :authenticated
  :export?    false
  :audit      :getter
  :setter     (make-embedding-toggle-setter :enable-embedding-sdk "sdk-embedding"))

(defsetting enable-embedding-simple
  (deferred-tru "Allow admins to embed Metabase via modular embedding?")
  :type       :boolean
  :default    false
  :visibility :authenticated
  :export?    false
  :audit      :getter
  :setter     (make-embedding-toggle-setter :enable-embedding-simple "simple-embedding"))

(defsetting enable-embedding-interactive
  (deferred-tru "Allow admins to embed Metabase via interactive embedding?")
  :type       :boolean
  :default    false
  :visibility :authenticated
  :export?    false
  :audit      :getter
  :setter     (make-embedding-toggle-setter :enable-embedding-interactive "interactive-embedding"))

(defsetting embedding-app-origins-interactive
  (deferred-tru "Allow these space delimited origins to embed Metabase interactive.")
  :type       :string
  :feature    :embedding
  :export?    false
  :visibility :public
  :encryption :no
  :audit      :getter)

(defsetting enable-embedding-static
  (deferred-tru "Allow admins to embed Metabase via static embedding?")
  :type       :boolean
  :default    false
  :visibility :authenticated
  :export?    false
  :audit      :getter
  :setter     (make-embedding-toggle-setter :enable-embedding-static "static-embedding"))

(mu/defn- ignore-localhost :- :string
  "Remove localhost:* or localhost:<port> from the list of origins."
  [s :- [:maybe :string]]
  (->> (str/split (or s "") #"\s+")
       (remove #(re-matches #"localhost:(\*|\d+)" %))
       distinct
       (str/join " ")
       str/trim))

(defn- -embedding-app-origins-sdk []
  (setting/get-value-of-type :string :embedding-app-origins-sdk))

(defn- validate-no-localhost-when-disabled
  "Throws an exception if localhost origins are present when disable-cors-on-localhost is enabled."
  [origins-string]
  (when (and (server.settings/disable-cors-on-localhost)
             (seq origins-string)
             (re-find #"localhost" origins-string))
    (throw (ex-info
            "Localhost is not allowed because DISABLE_CORS_ON_LOCALHOST is set."
            {:status-code 400}))))

(defn- -embedding-app-origins-sdk!
  "The setter for [[embedding-app-origins-sdk]].

  Checks that we have SDK embedding feature and that it's enabled, then sets the value accordingly.
  Also validates that localhost origins are not added when disable-cors-on-localhost is enabled."
  [new-value]
  ;; Validate before processing if disable-cors-on-localhost is enabled
  (validate-no-localhost-when-disabled new-value)
  (let [processed-value (->> new-value
                             ignore-localhost)]
    ;; Why ignore-localhost?, because localhost:* will always be allowed, so we don't need to store it, if we
    ;; were to store it, and the value was set N times, it would have localhost:* prefixed N times. Also, we
    ;; should not store localhost:port, since it's covered by localhost:* (which is the minimum value).
    (setting/set-value-of-type! :string :embedding-app-origins-sdk processed-value)))

(defsetting embedding-app-origins-sdk
  (deferred-tru "Allow Metabase SDK access to these space delimited origins.")
  :type       :string
  :export?    false
  :visibility :public
  :feature    :embedding-sdk
  :default    ""
  :encryption :no
  :audit      :getter
  :getter     #'-embedding-app-origins-sdk
  :setter     #'-embedding-app-origins-sdk!)

(defn- check-enable-settings!
  "Ensure either: nothing is set, the deprecated setting is set, or only supported settings are set"
  [env]
  (let [deprecated-enable-env-var-set? (some? (:mb-enable-embedding env))
        supported-enable-env-vars-set (select-keys env [:mb-enable-embedding-sdk :mb-enable-embedding-interactive :mb-enable-embedding-static])]
    (when (and deprecated-enable-env-var-set? (seq supported-enable-env-vars-set))
      (throw (ex-info "Both deprecated and new enable-embedding env vars are set, please remove MB_ENABLE_EMBEDDING."
                      {:deprecated-enable-env-vars-set deprecated-enable-env-var-set?
                       :current-enable-env-vars-set    supported-enable-env-vars-set})))))

(defn- sync-enable-settings!
  "If Only the deprecated enable-embedding is set, we want to sync the new settings to the deprecated one."
  [env]
  ;; we use [[find]], so we get the value if it is ∈ #{true false}, and skips nil
  (when-let [[_ enable-embedding-from-env] (find env :mb-enable-embedding)]
    (log/warn (str/join "\n"
                        ["Setting MB_ENABLE_EMBEDDING is deprecated as of Metabase 0.51.0 and will be removed in a future version."
                         (str "Setting MB_ENABLE_EMBEDDING_SDK, MB_ENABLE_EMBEDDING_INTERACTIVE, "
                              "and MB_ENABLE_EMBEDDING_STATIC to match MB_ENABLE_EMBEDDING, which is "
                              (pr-str enable-embedding-from-env) ".")]))
    (enable-embedding-sdk! enable-embedding-from-env)
    (enable-embedding-interactive! enable-embedding-from-env)
    (enable-embedding-static! enable-embedding-from-env)))

(defn- check-origins-settings!
  "Ensure either: nothing is set, the deprecated setting is set, or only supported settings are set"
  [env]
  (let [deprecated-origin-env-var-set? (some? (:mb-embedding-app-origin env))
        supported-origins-env-vars-set (select-keys env
                                                    [:mb-embedding-app-origins-sdk :mb-embedding-app-origins-interactive])]
    (when (and deprecated-origin-env-var-set? (seq supported-origins-env-vars-set))
      (throw (ex-info "Both deprecated and new enable-embedding env vars are set, please remove MB_ENABLE_EMBEDDING."
                      {:deprecated-enable-env-vars-set deprecated-origin-env-var-set?
                       :current-enable-env-vars-set    supported-origins-env-vars-set})))))

(defn- sync-origins-settings!
  "If Only the deprecated enable-embedding is set, we want to sync the new settings to the deprecated one."
  [env]
  ;; we use [[find]], so we get the value if it is ∈ #{true false}, and skips nil
  (when-let [[_ app-origin-from-env] (find env :mb-embedding-app-origin)]
    (log/warn (str/join "\n"
                        ["Setting MB_EMBEDDING_APP_ORIGIN is deprecated as of Metabase 0.51.0 and will be removed in a future version."
                         (str "Setting MB_EMBEDDING_APP_ORIGINS_SDK, MB_EMBEDDING_APP_ORIGINS_INTERACTIVE "
                              " to match MB_ENABLE_EMBEDDING, which is "
                              (pr-str app-origin-from-env) ".")]))
    (when (premium-features/has-feature? :embedding-sdk)
      (embedding-app-origins-sdk! app-origin-from-env))
    (when (premium-features/has-feature? :embedding)
      (embedding-app-origins-interactive! app-origin-from-env))))

(defn- check-settings!
  "We want to disallow setting both deprecated embed settings, and the new ones at the same time. This is to prevent
   confusion and to make sure that we're not setting the same thing twice."
  [env]
  (check-enable-settings! env)
  (check-origins-settings! env))

(defn- sync-settings!
  "Sync settings to ensure that we can accept `MB_ENABLE_EMBEDDING` and `MB_EMBEDDING_APP_ORIGIN`. This should always
  be called after [[check-settings]] so we don't overwrite a setting!"
  [env]
  (sync-enable-settings! env)
  (sync-origins-settings! env))

(defn check-and-sync-settings-on-startup!
  "Check and sync settings on startup. This is to ensure that we don't have any conflicting settings. A conflicting
  setting would be setting a deprecated setting and a new setting at the same time. If a deprecated setting is set
  (and none of its corresponding new settings are set), we want to sync the deprecated setting to the new settings and
  print a deprecation warning."
  [env]
  (check-settings! env)
  (sync-settings! env))

(mu/defn some-embedding-enabled? :- :boolean
  "Is any kind of embedding setup?"
  []
  (or
   #_{:clj-kondo/ignore [:deprecated-var]} (enable-embedding)
   (enable-embedding-static)
   (enable-embedding-interactive)
   (enable-embedding-sdk)
   (enable-embedding-simple)))

;; settings for the embedding homepage
(defsetting embedding-homepage
  (deferred-tru "Embedding homepage status, indicating if it''s visible, hidden or has been dismissed")
  :type       :keyword
  :default    :hidden
  :export?    true
  :visibility :admin)

(defsetting setup-embedding-autoenabled
  (deferred-tru "Indicates if embedding has enabled automatically during the setup because the user was interested in embedding")
  :type       :boolean
  :default    false
  :export?    true
  :visibility :admin)

(defsetting setup-license-active-at-setup
  (deferred-tru "Indicates if at the end of the setup a valid license was active")
  :type       :boolean
  :default    false
  :export?    true
  :visibility :admin)

(defsetting embedding-hub-test-embed-snippet-created
  (deferred-tru "Indicates if a test embed snippet has been created for tracking in the embedding hub")
  :type       :boolean
  :default    false
  :export?    true
  :visibility :admin
  :can-read-from-env? false
  :doc false)

(defsetting embedding-hub-production-embed-snippet-created
  (deferred-tru "Indicates if a production embed snippet has been created for tracking in the embedding hub")
  :type       :boolean
  :default    false
  :export?    true
  :visibility :admin
  :can-read-from-env? false
  :doc false)
