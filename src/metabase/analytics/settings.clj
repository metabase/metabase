(ns metabase.analytics.settings
  (:require
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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

(defsetting anon-tracking-enabled
  (deferred-tru "Enable the collection of anonymous usage data in order to help us improve.")
  :type       :boolean
  :default    true
  :visibility :public
  :audit      :getter)

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
                          (anon-tracking-enabled)))
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

(defn- first-user-creation
  "Returns the earliest user creation timestamp in the database"
  []
  (:min (t2/select-one [:model/User [:%min.date_joined :min]])))

(defn- -instance-creation []
  (when-not (setting/get-value-of-type :timestamp :instance-creation)
    ;; For instances that were started before this setting was added (in 0.41.3), use the creation
    ;; timestamp of the first user. For all new instances, use the timestamp at which this setting
    ;; is first read.
    (let [value (or (first-user-creation) (t/offset-date-time))]
      (setting/set-value-of-type! :timestamp :instance-creation value)
      ((requiring-resolve 'metabase.analytics.snowplow/track-event!) :snowplow/account {:event :new_instance_created} nil)))
  (u.date/format-rfc3339 (setting/get-value-of-type :timestamp :instance-creation)))

(defsetting instance-creation
  (deferred-tru "The approximate timestamp at which this instance of Metabase was created, for inclusion in analytics.")
  :visibility :public
  :setter     :none
  :getter     #'-instance-creation
  :doc        false)

(defn- -non-table-chart-generated!
  [new-value]
  ;; Only allow toggling from false -> true one time
  (when (true? new-value)
    (setting/set-value-of-type! :boolean :non-table-chart-generated true)))

(defsetting non-table-chart-generated
  (deferred-tru "Whether a non-table chart has already been generated. Required for analytics to track instance activation journey.")
  :visibility :authenticated
  :default    false
  :type       :boolean
  :export?    true
  :setter     #'-non-table-chart-generated!)
