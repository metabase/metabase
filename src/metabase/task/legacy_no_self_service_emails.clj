(ns metabase.task.legacy-no-self-service-emails
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.config :as config]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.task :as task]
   [metabase.util.log :as log]
   [metabase.util.urls :as urls]
   [stencil.core :as stencil]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private template-path (str "metabase/email/legacy_no_self_service.mustache"))

(defn- legacy-no-self-service-groups
  "Returns a list of groups that have `legacy-no-self-service` as their `view-data` permissions level for any database."
  []
  (t2/select :model/PermissionsGroup
             {:select-distinct [[:pg.id :id] [:pg.name :name]]
              :from [[:permissions_group :pg]]
              :join [[:data_permissions :dp] [:= :dp.group_id :pg.id]]
              :where [:= :dp.perm_value "legacy-no-self-service"]}))

(defn- legacy-no-self-service-email
  "Sends an email to all admins if the instance has any `legacy-no-self-service` permissions in any groups"
  []
  (when (and config/ee-available? (email/email-configured?))
    (when-let [groups (not-empty (legacy-no-self-service-groups))]
      (log/info "Sending email to admins about deprecation of `no-self-service`")
      (doseq [admin (t2/select :model/User :is_superuser true :is_active true)]
        (email/send-email-retrying!
         {:recipients   [(:email admin)]
          :message-type :html
          :subject      "[Metabase] Please update groups with deprecated view access"
          :message      (stencil/render-file
                         template-path
                         (merge (messages/common-context)
                                {:userName    (:first_name admin)
                                 :groups      groups
                                 :instanceURL (urls/site-url)}))})))))

(jobs/defjob ^{:doc "Send email to admins to warn about deprecation of `no-self-service`. This only runs once."}
  LegacyNoSelfServiceEmail [_ctx]
  (legacy-no-self-service-email))

(defmethod task/init! ::SendLegacyNoSelfServiceEmail [_job-name]
  (let [job     (jobs/build
                 (jobs/of-type LegacyNoSelfServiceEmail)
                 (jobs/with-identity (jobs/key "metabase.task.legacy-no-self-service-emails.job"))
                 (jobs/store-durably))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key "metabase.task.legacy-no-self-service-emails.trigger"))
                 (triggers/start-now))]
    (task/schedule-task! job trigger)))
