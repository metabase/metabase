(ns metabase.system.settings
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.appearance.core :as appearance]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.fonts :as u.fonts]
   [metabase.util.i18n :as i18n :refer [available-locales-with-names deferred-tru tru]]
   [metabase.util.log :as log]))

(defsetting site-uuid
  ;; Don't i18n this docstring because it's not user-facing! :)
  "Unique identifier used for this instance of {0}. This is set once and only once the first time it is fetched via
  its magic getter. Nice!"
  :encryption :no
  :visibility :authenticated
  :base       setting/uuid-nonce-base
  :doc        false)

(defsetting startup-time-millis
  (deferred-tru "The startup time in milliseconds")
  :visibility :public
  :type       :double
  :audit      :never
  :default    0.0
  :doc        false)

(defn- normalize-site-url [^String s]
  (let [;; remove trailing slashes
        s (str/replace s #"/$" "")
        ;; add protocol if missing
        s (if (str/starts-with? s "http")
            s
            (str "http://" s))]
    ;; check that the URL is valid
    (when-not (u/url? s)
      (throw (ex-info (tru "Invalid site URL: {0}" (pr-str s)) {:url (pr-str s)})))
    s))

;;; This value is *guaranteed* to never have a trailing slash :D
;;;
;;; It will also prepend `http://` to the URL if there's no protocol when it comes in
;;;
;;; TODO -- consider whether this belongs here or in `server`
(defsetting site-url
  (deferred-tru
   (str "This URL is used for things like creating links in emails, auth redirects, and in some embedding scenarios, "
        "so changing it could break functionality or get you locked out of this instance."))
  :encryption :when-encryption-key-set
  :visibility :public
  :audit      :getter
  :getter     (fn []
                (try
                  (some-> (setting/get-value-of-type :string :site-url) normalize-site-url)
                  (catch clojure.lang.ExceptionInfo e
                    (log/error e "site-url is invalid; returning nil for now. Will be reset on next request."))))
  :setter     (fn [new-value]
                (let [new-value (some-> new-value normalize-site-url)
                      https?    (some-> new-value (str/starts-with?  "https:"))]
                  ;; if the site URL isn't HTTPS then disable force HTTPS redirects if set
                  (when-not https?
                    ;; prevent circular dependencies with [[metabase.server.settings]]
                    (setting/set-value-of-type! :boolean :redirect-all-requests-to-https false))
                  (setting/set-value-of-type! :string :site-url new-value)))
  :doc "This URL is critical for things like SSO authentication, email links, embedding and more.
        Even difference with `http://` vs `https://` can cause problems.
        Make sure that the address defined is how Metabase is being accessed.")

;;; TODO -- we might want to move this into a separate `metabase.i18n` module
(defsetting site-locale
  (deferred-tru
   (str "The default language for all users across the {0} UI, system emails, pulses, and alerts. "
        "Users can individually override this default language from their own account settings.")
   (setting/application-name-for-setting-descriptions appearance/application-name))
  :default    "en"
  :visibility :public
  :export?    true
  :audit      :getter
  :encryption :no
  :getter     (fn []
                (let [value (setting/get-value-of-type :string :site-locale)]
                  (when (i18n/available-locale? value)
                    value)))
  :setter     (fn [new-value]
                (when new-value
                  (when-not (i18n/available-locale? new-value)
                    (throw (ex-info (tru "Invalid locale {0}" (pr-str new-value)) {:status-code 400}))))
                (setting/set-value-of-type! :string :site-locale (some-> new-value i18n/normalized-locale-string))))

(defsetting admin-email
  (deferred-tru "The email address users should be referred to if they encounter a problem.")
  :visibility :authenticated
  :encryption :when-encryption-key-set
  :audit      :getter)

(defsetting available-fonts
  "Available fonts"
  :visibility :public
  :export?    true
  :setter     :none
  :getter     u.fonts/available-fonts
  :doc        false)

(defsetting available-locales
  "Available i18n locales"
  :visibility :public
  :export?    true
  :setter     :none
  :getter     available-locales-with-names
  :doc        false)

(defsetting available-timezones
  "Available report timezone options"
  :visibility :public
  :export?    true
  :setter     :none
  :getter     (comp sort t/available-zone-ids)
  :doc        false)

(defsetting system-timezone
  "The timezone used by the system by default. AKA the JVM timezone."
  :visibility :authenticated
  :export?    true
  :setter     :none
  :getter     (comp str t/zone-id)
  :doc        false)

(defsetting encryption-enabled
  "Whether encryption is enabled for this Metabase instance via MB_ENCRYPTION_SECRET_KEY."
  :visibility :admin
  :type       :boolean
  :export?    false
  :setter     :none
  :getter     encryption/default-encryption-enabled?
  :doc        false)
