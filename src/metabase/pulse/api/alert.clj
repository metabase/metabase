(ns ^:deprecated metabase.pulse.api.alert
  "/api/alert endpoints.

  Deprecated: will soon be migrated to notification APIs."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.notification.api :as notification.api]
   [metabase.util.cron :as u.cron]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(when config/ee-available?
  (classloader/require 'metabase-enterprise.advanced-permissions.common))

(defn- notification->pulse
  "Convert a notification to the legacy pulse structure for backward compatibility."
  [notification]
  (let [subscription      (-> notification :subscriptions first)
        notification-card (-> notification :payload)
        card              (->> notification :payload :card_id (t2/select-one :model/Card))]
    (merge
     (select-keys notification [:id :creator_id :creator :created_at :updated_at])
     {:name                nil
      :alert_condition     (if (-> notification-card :send_condition (= :has_result)) "rows" "goal")
      :alert_above_goal    (if (-> notification-card :send_condition (= :goal_above)) true nil)
      :alert_first_only    (-> notification :payload :send_once)
      :archived            (not (:active notification))
      :collection_position nil
      :collection_id       nil
      :skip_if_empty       true
      :parameters          []
      :dashboard_id        nil
      :card                (merge
                            (select-keys card [:name :description :collection_id :display])
                            {:format_rows       true
                             :include_xls       false
                             :include_csv       true
                             :pivot_results     false
                             :dashboard_id      nil
                             :dashboard_card_id nil
                             :parameter_mappings nil})
      :channels            (map (fn [handler]
                                  (let [user-recipients  (->> handler
                                                              :recipients
                                                              (filter #(= :notification-recipient/user (:type %)))
                                                              (map :user)
                                                              (map #(select-keys % [:email :last_name :first_name :id :common_name])))
                                        ;; for external emails and slack channel
                                        value-recipients (->> handler
                                                              :recipients
                                                              (filter #(= :notification-recipient/raw-value (:type %)))
                                                              (map :details))]
                                    (merge
                                     (when subscription
                                       (select-keys (u.cron/cron-string->schedule-map (:cron_schedule subscription))
                                                    [:schedule_type :schedule_hour :schedule_day :schedule_frame]))
                                     {:id           (:id handler)
                                      :recipients   (if (= :channel/email (:channel_type handler))
                                                      (concat (map #(set/rename-keys % {:value :email}) value-recipients) user-recipients)
                                                      [])
                                      :channel_type (name (:channel_type handler))
                                      :channel_id   (:channel_id handler)
                                      :enabled      (:active handler)
                                      :details      (case (:channel_type handler)
                                                      :channel/slack
                                                      {:channel (-> value-recipients first :value)}
                                                      :channel/email
                                                      {:emails (map :value value-recipients)}
                                                      {})})))
                                (:handlers notification))})))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch alerts which the current user has created or will receive, or all alerts if the user is an admin.
  The optional `user_id` will return alerts created by the corresponding user, but is ignored for non-admin users."
  [_route-params
   {:keys [archived user_id]} :- [:map
                                  [:archived {:default false} [:maybe ms/BooleanValue]]
                                  [:user_id  {:optional true} [:maybe ms/PositiveInt]]]]
  (let [user-id (if api/*is-superuser?*
                  user_id
                  api/*current-user-id*)]
    (->> (notification.api/list-notifications
          {:payload_type   :notification/card
           :legacy-user-id user-id
           :legacy-active  (not archived)})
         (map notification->pulse)
         (remove nil?))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch an alert by ID"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (-> (notification.api/get-notification id)
      api/read-check
      notification->pulse))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id/subscription"
  "For users to unsubscribe themselves from the given alert."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (notification.api/unsubscribe-user! id api/*current-user-id*)
  api/generic-204-no-content)
