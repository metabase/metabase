(ns metabase.mcp.v2.redaction
  "The current-user half of the v2 MCP read shape: everything a tool must do to a row before
   [[metabase.mcp.v2.projections]] reshapes it. Projections are pure, so the permission-dependent
   work lives here — the app-DB hydration a redaction needs, and the redaction itself. Dashboards,
   notification-backed rows (alerts, migrated subscriptions), and pulse-backed rows (dashboard
   subscriptions) are all covered, on reads and on the rows writes read back.

   Notification hydration is not exposed on its own: a hydrated row carries every recipient, so
   handing one straight to a projection leaks them. [[hydrate-and-redact-notification]] is the way
   in.

   These read `metabase.api.common/*current-user*` (the dashboard side through the model read
   checks) and so must be called as the requesting user; the projections they feed are pure."
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.notification.models :as models.notification]
   [metabase.permissions.core :as perms]
   [metabase.pulse.core :as pulse]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- dashboard ----------------------------------------------------

(defn- redact-dashcard
  [dashcard]
  (cond-> dashcard
    ;; The projection reads an absent `:card` the same way it reads an unhydrated one — as an id
    ;; with no name — so removing it is the whole redaction.
    (not (some-> (:card dashcard) mi/can-read?))
    (dissoc :card)

    (seq (:series dashcard))
    (update :series (partial mapv #(cond-> % (not (mi/can-read? %)) (select-keys [:id]))))))

(defn redact-dashboard
  "`dash`, with its dashcards' `:card` and `:series` populated — by hydration on a saved dashboard,
   by hand on a compiled one — and the cards the current user cannot read reduced to their ids, the
   same collapse the REST dashboard response does."
  [dash]
  (update dash :dashcards (partial mapv redact-dashcard)))

;;; ------------------------------------------------ notification --------------------------------------------------

(defn- hydrate-notification
  "The [[models.notification/hydrate-notification]] hydration, without its output schema —
   which rejects `payload_type: notification/dashboard` rows, readable here by design."
  [notification]
  (t2/hydrate notification
              :payload
              :subscriptions
              [:handlers :channel [:recipients :recipients-detail]]))

(defn- recipient-tenant-id
  "The tenant of a user recipient. Read off the hydrated `:user` when present; the
   `:recipients-detail` hydration deliberately attaches `:user` nil for a deactivated user, whose
   tenant must then be looked up — otherwise a deactivated recipient reads as tenantless and slips
   past (or is wrongly dropped by) the tenant filter."
  [recipient]
  (if-some [user (:user recipient)]
    (:tenant_id user)
    (t2/select-one-fn :tenant_id :model/User :id (:user_id recipient))))

(defn- visible-recipients
  "`recipients` less the ones the current user may not see: sandboxed or impersonated callers see
   only themselves among user recipients, and non-superusers never see cross-tenant users."
  [recipients]
  (vec (cond->> recipients
         (perms/sandboxed-or-impersonated-user?)
         (filter #(or (nil? (:user_id %)) (= (:user_id %) api/*current-user-id*)))

         (not api/*is-superuser?*)
         (filter #(or (nil? (:user_id %))
                      (= (recipient-tenant-id %) (:tenant_id @api/*current-user*)))))))

(defn- payload-readable?
  "Whether the current user may read the notification's payload.
   [[models.notification/current-user-can-read-payload?]] has no `:notification/dashboard` clause
   (its `case` throws on one), so dashboard rows are checked against the dashboard directly."
  [notification]
  (if (= :notification/dashboard (:payload_type notification))
    (boolean (some->> notification :payload :dashboard_id (mi/can-read? :model/Dashboard)))
    (models.notification/current-user-can-read-payload? notification)))

(defn redact-notification
  "`notification`, hydrated, with handler recipients redacted for the current user the way
   `/api/pulse` redacts them. A caller who can read the notification only as its creator or
   recipient — not its payload — loses the recipient lists entirely; otherwise individual
   recipients are filtered by [[visible-recipients]]."
  [notification]
  (let [strip? (and (#{:notification/card :notification/dashboard} (:payload_type notification))
                    (not (payload-readable? notification)))]
    (update notification :handlers
            (fn [handlers]
              (mapv (fn [handler]
                      (if strip?
                        (dissoc handler :recipients)
                        (update handler :recipients visible-recipients)))
                    handlers)))))

(defn hydrate-and-redact-notification
  "`notification`, hydrated and recipient-redacted for the current user — the shape
   [[metabase.mcp.v2.projections/notification-row]] takes."
  [notification]
  (redact-notification (hydrate-notification notification)))

;;; --------------------------------------------------- pulse ------------------------------------------------------

(defn redact-pulse
  "`pulse-row` with recipients and sensitive metadata redacted for the current user exactly as
   `/api/pulse` redacts them."
  [pulse-row]
  (-> pulse-row
      pulse/maybe-filter-pulse-recipients
      pulse/maybe-strip-sensitive-metadata))
