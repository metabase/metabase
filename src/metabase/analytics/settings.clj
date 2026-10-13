(ns metabase.analytics.settings
  (:require
   [java-time.api :as t]
   [metabase.analytics.db :as analytics.db]
   [metabase.config.core :as config]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.date-2 :as u.date]
   [metabase.util.experiment :as experiment]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defsetting analytics-uuid
  (deferred-tru
   (str "Unique identifier to be used in Snowplow analytics, to identify this instance of Metabase. "
        "This is a public setting since some analytics events are sent prior to initial setup."))
  :encryption :no
  :visibility :public
  :base       setting/uuid-nonce-base
  :doc        false)

(defsetting anon-tracking-enabled
  (deferred-tru "Enable the collection of anonymous usage data in order to help Metabase improve..")
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

(defsetting metaplow-tracking-enabled
  (deferred-tru
   (str "Boolean indicating whether analytics events are being sent to Metaplow. "
        "True if anonymous tracking is enabled for this instance, and a Metaplow collector URL is set."))
  :type       :boolean
  :getter     (fn [] (boolean (and (anon-tracking-enabled)
                                   (setting/get-value-of-type :string :metaplow-url))))
  :visibility :public
  :doc        false)

(defsetting metaplow-url
  (deferred-tru "The URL of the Metaplow collector to send analytics events to.")
  :encryption :when-encryption-key-set
  :visibility :public
  :audit      :never
  :doc        false)

(defsetting snowplow-url
  (deferred-tru "The URL of the Snowplow collector to send analytics events to.")
  :encryption :when-encryption-key-set
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
  (analytics.db/first-user-date-joined))

(defn- -instance-creation []
  (when-not (setting/get-value-of-type :timestamp :instance-creation)
    ;; For instances that were started before this setting was added (in 0.41.3), use the creation
    ;; timestamp of the first user. For all new instances, use the timestamp at which this setting
    ;; is first read.
    (let [value (or (first-user-creation) (t/offset-date-time))]
      (setting/set-value-of-type! :timestamp :instance-creation value)
      ((requiring-resolve 'metabase.analytics.event/track-event!) :snowplow/account {:event :new_instance_created} nil)))
  (u.date/format-rfc3339 (setting/get-value-of-type :timestamp :instance-creation)))

(defsetting instance-creation
  (deferred-tru "The approximate timestamp at which this instance of Metabase was created, for inclusion in analytics.")
  :encryption :no
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

(defsetting analytics-pii-retention-enabled
  (deferred-tru (str "Enable logging of embed path, query parameters, user attribute values, user agent, "
                     "IP address, and Metabot conversation metadata for users of your internal data and embeds. "
                     "This information will be shown in your usage analytics."))
  :type       :boolean
  :default    false
  :visibility :admin
  :export?    true
  :feature    :audit-app)

(def sdk-react-18-hosts-max
  "The most hosts that [[sdk-react-18-hosts]] keeps."
  50)

(def ^:private sdk-react-18-hosts-days 4)

(defn- utc-today []
  (t/local-date (t/instant) (t/zone-id "UTC")))

(defn- recent-sdk-react-18-hosts
  [hosts today]
  (let [oldest (str (t/minus today (t/days (dec sdk-react-18-hosts-days))))]
    (->> hosts
         (filter #(>= (compare (:last_seen %) oldest) 0))
         (sort-by :last_seen #(compare %2 %1))
         (take sdk-react-18-hosts-max)
         vec)))

(defn- sdk-react-18-hosts-getter []
  (recent-sdk-react-18-hosts (setting/get-value-of-type :json :sdk-react-18-hosts) (utc-today)))

(defsetting sdk-react-18-hosts
  (deferred-tru
   (str "Host apps that used the React embedding SDK with React 18 in the last 4 days, newest first. "
        "The hostname is null when the host app did not send it."))
  :type               :json
  :encryption         :no
  :visibility         :admin
  :setter             :none
  ;; a write does not make every server reload all settings, and a read always goes to the DB
  :cache?             false
  :export?            false
  :doc                false
  :audit              :never
  ;; read only by the Embedding hub, by key, so the settings payloads do not read the DB for it
  :include-in-list?   false
  :can-read-from-env? false
  :getter             #'sdk-react-18-hosts-getter)

(mu/defn record-sdk-react-18-host! :- :nil
  "Saves that `hostname` used the React embedding SDK with React 18 today. Never throws."
  [hostname :- [:maybe :string]]
  (try
    (let [today     (utc-today)
          last-seen (str today)
          stored    (sdk-react-18-hosts)]
      ;; another server can have saved it already today
      (when-not (some #(and (= (:hostname %) hostname) (= (:last_seen %) last-seen)) stored)
        (setting/set! :sdk-react-18-hosts
                      (recent-sdk-react-18-hosts
                       (cons {:hostname hostname, :last_seen last-seen}
                             (remove #(= (:hostname %) hostname) stored))
                       today)
                      :bypass-read-only? true)))
    (catch Exception e
      (log/warn e "Failed to save a host that uses the React embedding SDK with React 18")))
  nil)

(defsetting experiments-enabled
  (deferred-tru "Enable or disable all code experiments. When disabled, only the production code path runs.")
  :type       :boolean
  :default    false
  :doc        false
  :visibility :admin
  :export?    false
  :audit      :getter)

;; Wire the setting into the experiment machinery, which sits below the settings framework in the module
;; graph. The fn is called on every experiment invocation, so toggling the setting takes effect immediately.
(experiment/set-experiments-enabled-fn! experiments-enabled)
