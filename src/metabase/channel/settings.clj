(ns metabase.channel.settings
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.string :as u.str]))

(defsetting slack-token
  (deferred-tru
   (str "Deprecated Slack API token for connecting the Metabase Slack bot. "
        "Please use a new Slack app integration instead."))
  :deprecated "0.42.0"
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :doc        false
  :audit      :never
  :export?    false)

(defsetting slack-app-token
  (deferred-tru
   (str "Bot user OAuth token for connecting the Metabase Slack app. "
        "This should be used for all new Slack integrations starting in Metabase v0.42.0."))
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :getter (fn []
            (-> (setting/get-value-of-type :string :slack-app-token)
                (u.str/mask 9))))

(defn unobfuscated-slack-app-token
  "Get the unobfuscated value of [[slack-app-token]]."
  []
  (setting/get-value-of-type :string :slack-app-token))

(defsetting slack-token-valid?
  (deferred-tru
   (str "Whether the current Slack app token, if set, is valid. "
        "Set to ''false'' if a Slack API request returns an auth error."))
  :type       :boolean
  :visibility :settings-manager
  :doc        false
  :audit      :never)

(defsetting slack-cached-channels-and-usernames
  "A cache shared between instances for storing an instance's slack channels and users."
  :encryption :when-encryption-key-set
  :visibility :internal
  :type       :json
  :doc        false
  :audit      :never
  :export?    false)

(def zoned-time-epoch
  "Start of the UNIX epoch as a `ZonedDateTime`."
  (t/zoned-date-time 1970 1 1 0))

(defsetting slack-channels-and-usernames-last-updated
  "The updated-at time for the [[slack-cached-channels-and-usernames]] setting."
  :visibility :internal
  :cache?     false
  :type       :timestamp
  :default    zoned-time-epoch
  :doc        false
  :audit      :never
  :export?    false)

(defn process-files-channel-name
  "Converts empty strings to `nil`, and removes leading `#` from the channel name if present."
  [channel-name]
  (when-not (str/blank? channel-name)
    (if (str/starts-with? channel-name "#") (subs channel-name 1) channel-name)))

(defsetting slack-files-channel
  (deferred-tru "The name of the channel to which Metabase files should be initially uploaded")
  :deprecated "0.54.0"
  :default "metabase_files"
  :encryption :no
  :visibility :settings-manager
  :audit      :getter
  :setter (fn [channel-name]
            (setting/set-value-of-type! :string :slack-files-channel (process-files-channel-name channel-name))))

(defsetting slack-bug-report-channel
  (deferred-tru "The name of the channel where bug reports should be posted")
  :default "metabase-bugs"
  :encryption :no
  :visibility :settings-manager
  :audit      :getter
  :export?    false
  :setter (fn [channel-name]
            (setting/set-value-of-type! :string :slack-bug-report-channel (process-files-channel-name channel-name))))
