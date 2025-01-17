(ns metabase.embed.settings
  "Settings related to embedding Metabase in other applications."
  (:require
   [clojure.string :as str]
   [crypto.random :as crypto-random]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.embed :as embed]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn- make-embedding-toggle-setter
  "Creates a boolean setter for various boolean embedding-enabled flavors, all tracked by snowplow."
  [setting-key :- :keyword event-name :- :string]
  (fn [new-value]
    (u/prog1 new-value
      (let [old-value (setting/get-value-of-type :boolean setting-key)]
        (when (not= new-value old-value)
          (setting/set-value-of-type! :boolean setting-key new-value)
          (when (and new-value (str/blank? (embed/embedding-secret-key)))
            (embed/embedding-secret-key! (crypto-random/hex 32)))
          (snowplow/track-event! ::snowplow/embed_share
                                 {:event                      (keyword (str event-name (if new-value "-enabled" "-disabled")))
                                  :embedding-app-origin-set   (boolean
                                                               (or (setting/get-value-of-type :string :embedding-app-origin)
                                                                   (setting/get-value-of-type :string :embedding-app-origins-interactive)
                                                                   (let [sdk-origins (setting/get-value-of-type :string :embedding-app-origins-sdk)]
                                                                     (and sdk-origins (not= "localhost:*" sdk-origins)))))
                                  :number-embedded-questions  (t2/count :model/Card :enable_embedding true)
                                  :number-embedded-dashboards (t2/count :model/Dashboard :enable_embedding true)}))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Embed Settings ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

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

(mu/defn- ignore-localhost :- :string
  "Remove localhost:* or localhost:<port> from the list of origins."
  [s :- [:maybe :string]]
  (->> (str/split (or s "") #"\s+")
       (remove #(re-matches #"localhost:(\*|\d+)" %))
       distinct
       (str/join " ")
       str/trim))

(mu/defn- add-localhost :- :string [s :- [:maybe :string]]
  (->> s ignore-localhost (str "localhost:* ") str/trim))

(defn embedding-app-origins-sdk-setter
  "The setter for [[embedding-app-origins-sdk]].

  Checks that we have SDK embedding feature and that it's enabled, then sets the value accordingly."
  [new-value]
  (add-localhost ;; return the same value that is returned from the getter
   (->> new-value
        ignore-localhost
        ;; Why ignore-localhost?, because localhost:* will always be allowed, so we don't need to store it, if we
        ;; were to store it, and the value was set N times, it would have localhost:* prefixed N times. Also, we
        ;; should not store localhost:port, since it's covered by localhost:* (which is the minumum value).
        (setting/set-value-of-type! :string :embedding-app-origins-sdk))))

(defsetting embedding-app-origins-sdk
  (deferred-tru "Allow Metabase SDK access to these space delimited origins.")
  :type       :string
  :export?    false
  :visibility :public
  :feature    :embedding-sdk
  :default    "localhost:*"
  :encryption :no
  :audit      :getter
  :getter    (fn embedding-app-origins-sdk-getter []
               (add-localhost (setting/get-value-of-type :string :embedding-app-origins-sdk)))
  :setter   embedding-app-origins-sdk-setter)

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
   #_:clj-kondo/ignore (enable-embedding)
   (enable-embedding-static)
   (enable-embedding-interactive)
   (enable-embedding-sdk)))

;; settings for the embedding homepage
(defsetting embedding-homepage
  (deferred-tru "Embedding homepage status, indicating if it's visible, hidden or has been dismissed")
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
