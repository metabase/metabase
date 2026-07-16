(ns metabase-enterprise.custom-viz-plugin.settings
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.nonce :as nonce]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.server.settings :as server.settings]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(defsetting custom-viz-plugin-dev-mode-enabled
  (deferred-tru "Whether custom visualization plugin dev mode is enabled. When false, the dev endpoints are disabled.")
  :type       :boolean
  :default    false
  :visibility :public
  :setter     :none
  :audit      :never
  :export?    false)

(defsetting custom-viz-enabled
  (deferred-tru "Should custom visualizations be enabled for this instance?")
  :type       :boolean
  :default    false
  :feature    :custom-viz
  :visibility :admin
  :export?    true
  :audit      :getter
  :setter     (fn [new-value]
                (let [enabling? (if (string? new-value)
                                  (setting/string->boolean new-value)
                                  new-value)]
                  (when (and enabling?
                             (not (server.settings/csp-img-enabled)))
                    (throw (ex-info (tru "Turn on the image CSP setting before enabling Custom Visualizations.")
                                    {:status-code 400})))
                  (setting/set-value-of-type! :boolean :custom-viz-enabled new-value))))

(defsetting custom-viz-sandbox-signing-key
  (deferred-tru "Key used to sign custom visualization sandbox donor tokens. Generated automatically on first use.")
  :visibility :internal
  :type       :string
  :export?    false
  :audit      :never
  :encryption :when-encryption-key-set
  ;; :init generates and persists on first access. Two nodes touching it simultaneously can still race
  ;; (last write wins; the loser's in-flight 2-min donor tokens fail verification), but the window is one
  ;; first-ever sandbox mint. Generate eagerly at startup if this ever bites.
  :init       (fn [] (codecs/bytes->hex (nonce/random-bytes 32))))

(defenterprise enable-custom-viz?
  "Enterprise implementation: custom visualizations are enabled when the admin has opted in via the
  `custom-viz-enabled` setting and the instance's token includes the `:custom-viz` premium feature."
  :feature :custom-viz
  []
  (boolean (custom-viz-enabled)))
