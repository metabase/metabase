(ns metabase.request.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting source-address-header
  (deferred-tru "Identify the source of HTTP requests by this header''s value, instead of its remote address.")
  :encryption :no
  :default "X-Forwarded-For"
  :export? true
  :audit   :getter
  :getter  (fn [] (some-> (setting/get-value-of-type :string :source-address-header)
                          u/lower-case-en)))

(defsetting not-behind-proxy
  (deferred-tru
   (str "Indicates whether Metabase is running behind a proxy that sets the source-address-header for incoming "
        "requests."))
  :type       :boolean
  :visibility :internal
  :default    false
  :export?    false)
