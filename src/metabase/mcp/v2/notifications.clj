(ns metabase.mcp.v2.notifications
  "Fetch-and-authorize steps for the v2 MCP notification reads — the app-DB hydration and the
   current-user recipient redaction that [[metabase.mcp.v2.projections]] needs done before it can
   reshape a row. Both notification-backed (alerts, migrated subscriptions) and pulse-backed
   (dashboard subscriptions) rows are covered.

   These read `metabase.api.common/*current-user*` and so must be called as the requesting user;
   the projections they feed are pure."
  (:require
   [metabase.api.common :as api]
   [metabase.notification.models :as models.notification]
   [metabase.permissions.core :as perms]
   [metabase.pulse.core :as pulse]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn hydrate-notification
  "The [[models.notification/hydrate-notification]] hydration, without its output schema —
   which rejects `payload_type: notification/dashboard` rows, readable here by design."
  [notification]
  (t2/hydrate notification
              :payload
              :subscriptions
              [:handlers :channel [:recipients :recipients-detail]]))

(defn- visible-recipients
  "`recipients` less the ones the current user may not see: sandboxed or impersonated callers see
   only themselves among user recipients, and non-superusers never see cross-tenant users."
  [recipients]
  (vec (cond->> recipients
         (perms/sandboxed-or-impersonated-user?)
         (filter #(or (nil? (:user_id %)) (= (:user_id %) api/*current-user-id*)))

         (not api/*is-superuser?*)
         (filter #(or (nil? (:user_id %))
                      (= (some-> % :user :tenant_id) (:tenant_id @api/*current-user*)))))))

(defn redact-notification
  "`notification`, hydrated, with handler recipients redacted for the current user the way
   `/api/pulse` redacts them. A caller who can read the notification only as its creator or
   recipient — not its payload — loses the recipient lists entirely; otherwise individual
   recipients are filtered by [[visible-recipients]]."
  [notification]
  (let [strip? (and (= :notification/card (:payload_type notification))
                    (not (models.notification/current-user-can-read-payload? notification)))]
    (update notification :handlers
            (fn [handlers]
              (mapv (fn [handler]
                      (if strip?
                        (dissoc handler :recipients)
                        (update handler :recipients visible-recipients)))
                    handlers)))))

(defn redact-pulse
  "`pulse-row` with recipients and sensitive metadata redacted for the current user exactly as
   `/api/pulse` redacts them."
  [pulse-row]
  (-> pulse-row
      pulse/maybe-filter-pulse-recipients
      pulse/maybe-strip-sensitive-metadata))
