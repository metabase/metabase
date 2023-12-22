(ns metabase.embed.settings
  "Settings related to embedding Metabase in other applications."
  (:require
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(defsetting embedding-app-origin
  (deferred-tru "Allow this origin to embed the full {0} application"
                (public-settings/application-name-for-setting-descriptions))
  :feature    :embedding
  :visibility :public
  :audit      :getter)

(defsetting enable-embedding
  (deferred-tru "Allow admins to securely embed questions and dashboards within other applications?")
  :type       :boolean
  :default    false
  :visibility :authenticated
  :audit      :getter
  :setter     (fn [new-value]
                (when (not= new-value (setting/get-value-of-type :boolean :enable-embedding))
                  (setting/set-value-of-type! :boolean :enable-embedding new-value)
                  (let [snowplow-payload {:embedding-app-origin-set   (boolean (embedding-app-origin))
                                          :number-embedded-questions  (t2/count :model/Card :enable_embedding true)
                                          :number-embedded-dashboards (t2/count :model/Dashboard :enable_embedding true)}]
                    (if new-value
                      (snowplow/track-event! ::snowplow/embedding-enabled api/*current-user-id* snowplow-payload)
                      (snowplow/track-event! ::snowplow/embedding-disabled api/*current-user-id* snowplow-payload))))))
