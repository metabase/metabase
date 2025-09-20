(ns metabase.server.settings
  "These are mostly settings that have to do with server responses. Not sure if they belong here or if we should spin
  off a separate `response` module."
  (:require
   [clojure.string :as str]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(def ^:private default-allowed-iframe-hosts
  "youtube.com,
youtu.be,
loom.com,
vimeo.com,
docs.google.com,
calendar.google.com,
airtable.com,
typeform.com,
canva.com,
codepen.io,
figma.com,
grafana.com,
miro.com,
excalidraw.com,
notion.com,
atlassian.com,
trello.com,
asana.com,
gist.github.com,
linkedin.com,
twitter.com,
x.com")

(defsetting allowed-iframe-hosts
  (deferred-tru "Allowed iframe hosts")
  :encryption :no
  :default    default-allowed-iframe-hosts
  :audit      :getter
  :visibility :public
  :export?    true)

(defsetting redirect-all-requests-to-https
  (deferred-tru "Force all traffic to use HTTPS via a redirect, if the site URL is HTTPS")
  :visibility :public
  :type       :boolean
  :default    false
  :audit      :getter
  :setter     (fn [new-value]
                ;; if we're trying to enable this setting, make sure `site-url` is actually an HTTPS URL.
                (when (if (string? new-value)
                        (setting/string->boolean new-value)
                        new-value)
                  (assert (some-> (system/site-url) (str/starts-with? "https:"))
                          (tru "Cannot redirect requests to HTTPS unless `site-url` is HTTPS.")))
                (setting/set-value-of-type! :boolean :redirect-all-requests-to-https new-value)))

(defsetting health-check-logging-enabled
  (deferred-tru "Whether to log health check requests from session middleware.")
  :type       :boolean
  :default    true
  :visibility :internal
  :export?    false)

(defsetting disable-cors-on-localhost
  (deferred-tru "Prevents the server from sending CORS headers for requests originating from localhost.")
  :type       :boolean
  :default    false
  :visibility :admin
  :export?    true)
