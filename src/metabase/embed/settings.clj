(ns metabase.embed.settings
  "Settings related to embedding Metabase in other applications."
  (:require
   [clojure.string :as str]
   [crypto.random :as crypto-random]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.embed :as embed]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
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
                                  :embedding-app-origin-set   (boolean (setting/get-value-of-type :string :embedding-app-origin))
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

(defsetting embedding-app-origin
  (deferred-tru "Allow this origin to embed the full Metabase application.")
  ;; This value is usually gated by [[enable-embedding]]
  :feature    :embedding
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
   (when (and (premium-features/has-feature? :embedding-sdk)
              ;; Cannot set the SDK origins if the SDK embedding is disabled. so it will remain localhost:*.
              (setting/get-value-of-type :boolean :enable-embedding-sdk))
     (->> new-value
          ignore-localhost
          (setting/set-value-of-type! :string :embedding-app-origins-sdk)))))

(defsetting embedding-app-origins-sdk
  (deferred-tru "Allow this origin to embed Metabase SDK")
  :type       :string
  :export?    false
  :visibility :public
  :encryption :no
  :audit      :getter
  :getter    (fn embedding-app-origins-sdk-getter []
               (add-localhost (setting/get-value-of-type :string :embedding-app-origins-sdk)))
  :setter   embedding-app-origins-sdk-setter)

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

(defsetting embedding-app-origin-interactive
  (deferred-tru "Allow this origin to embed the full Metabase application.")
  ;; This value is usually gated by [[enable-embedding-interactive]]
  :feature    :embedding
  :type       :string
  :export?    false
  :visibility :public
  :audit      :getter
  :encryption :no)

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
   (when (and (premium-features/has-feature? :embedding-sdk)
              ;; Cannot set the SDK origins if the SDK embedding is disabled. so it will remain localhost:*.
              (setting/get-value-of-type :boolean :enable-embedding-sdk))
     (->> new-value
          ignore-localhost
          ;; Why ignore-localhost?, because localhost:* will always be allowed, so we don't need to store it, if we
          ;; were to store it, and the value was set N times, it would have localhost:* prefixed N times. Also, we
          ;; should not store localhost:port, since it's covered by localhost:* (which is the minumum value).
          (setting/set-value-of-type! :string :embedding-app-origins-sdk)))))

(defsetting embedding-app-origins-sdk
  (deferred-tru "Allow this origin to embed Metabase SDK")
  :type       :string
  :export?    false
  :visibility :public
  :encryption :no
  :audit      :getter
  :getter    (fn embedding-app-origins-sdk-getter []
               (add-localhost (setting/get-value-of-type :string :embedding-app-origins-sdk)))
  :setter   embedding-app-origins-sdk-setter)

(defsetting enable-embedding-interactive
  (deferred-tru "Allow admins to embed Metabase via interactive embedding?")
  :feature    :embedding
  :type       :boolean
  :default    false
  :visibility :authenticated
  :export?    false
  :audit      :getter
  :setter     (make-embedding-toggle-setter :enable-embedding-interactive "interactive-embedding"))

(defsetting embedding-app-origins-interactive
  (deferred-tru "Allow this origin to embed Metabase interactive.")
  :type       :string
  :export?    false
  :visibility :public
  :encryption :no
  :audit      :getter)

(defsetting enable-embedding-static
  (deferred-tru "Allow admins to embed Metabase via static embedding?")
  :type       :boolean
  :feature    :embedding
  :default    false
  :visibility :authenticated
  :export?    false
  :audit      :getter
  :setter     (make-embedding-toggle-setter :enable-embedding-static "static-embedding"))

(mu/defn some-embedding-enabled? :- :boolean
  "Is any kind of embedding setup?"
  []
  (or
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
