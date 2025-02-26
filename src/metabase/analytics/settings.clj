(ns metabase.analytics.settings
  (:require
   [metabase.config :as config]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]))

(defsetting prometheus-server-port
  (deferred-tru (str "Port to serve prometheus metrics from. If set, prometheus collectors are registered"
                     " and served from `localhost:<port>/metrics`."))
  :type       :integer
  :visibility :internal
  ;; settable only through environmental variable
  :setter     :none
  :getter     (fn reading-prometheus-port-setting []
                (let [parse (fn [raw-value]
                              (if-let [parsed (parse-long raw-value)]
                                parsed
                                (log/warnf "MB_PROMETHEUS_SERVER_PORT value of '%s' is not parseable as an integer." raw-value)))]
                  (setting/get-raw-value :prometheus-server-port integer? parse))))

(defsetting analytics-uuid
  (deferred-tru
   (str "Unique identifier to be used in Snowplow analytics, to identify this instance of Metabase. "
        "This is a public setting since some analytics events are sent prior to initial setup."))
  :encryption :no
  :visibility :public
  :base       setting/uuid-nonce-base
  :doc        false)

(defsetting snowplow-available
  (deferred-tru
   (str "Boolean indicating whether a Snowplow collector is available to receive analytics events. "
        "Should be set via environment variable in Cypress tests or during local development."))
  :type       :boolean
  :visibility :public
  :default    config/is-prod?
  :doc        false
  :audit      :never)

(defsetting snowplow-enabled
  (deferred-tru
   (str "Boolean indicating whether analytics events are being sent to Snowplow. "
        "True if anonymous tracking is enabled for this instance, and a Snowplow collector is available."))
  :type       :boolean
  :setter     :none
  :getter     (fn [] (and (snowplow-available)
                          (public-settings/anon-tracking-enabled)))
  :visibility :public
  :doc        false)

(defsetting snowplow-url
  (deferred-tru "The URL of the Snowplow collector to send analytics events to.")
  :encryption :no
  :default    (if config/is-prod?
                "https://sp.metabase.com"
                ;; See the iglu-schema-registry repo for instructions on how to run Snowplow Micro locally for development
                "http://localhost:9090")
  :visibility :public
  :audit      :never
  :doc        false)
