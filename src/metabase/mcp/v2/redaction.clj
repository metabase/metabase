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
   [metabase.mcp.db :as mcp.db]
   [metabase.models.interface :as mi]
   [metabase.notification.models :as models.notification]
   [metabase.permissions.core :as perms]
   [metabase.pulse.core :as pulse]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- dashboard ----------------------------------------------------

(def ^:private series-describing-viz-keys
  "`:visualization_settings` keys that describe every card on a dashcard, its series cards included.
   The frontend keys `:series_settings` entries and `:graph.series_order` items by a card's name, alone or followed by
   a column name or breakout value.
   The legacy `:graph.series_labels` lists the cards' names in series order.
   Column settings, additional tooltip columns and click mappings may name columns from any series card's results.
   Click behaviors also name other entities.
   A visualizer dashcard's `:visualization` maps its columns to the cards and columns they come from."
  [:series_settings
   :graph.series_order
   :graph.series_labels
   :graph.tooltip_columns
   :column_settings
   :click_behavior
   :visualization])

(def ^:private card-describing-viz-keys
  "`:visualization_settings` keys that describe the main card rather than the grid slot: its author-written title
   and description, and the [[series-describing-viz-keys]], since it is one of the cards those describe.
   Layout keys (sizing, container styling) describe the dashboard itself and survive redaction."
  (into [:card.title :card.description] series-describing-viz-keys))

(defn- strip-viz-keys
  "The dashcard with the `ks` removed from its `:visualization_settings`, which become nil when nothing is left."
  [dashcard ks]
  ;; Left alone when none of `ks` is there: a dashcard read from the app db is a Toucan instance, where writing an
  ;; absent `:visualization_settings` back as nil makes the projection report a key the dashcard never had.
  (let [settings (:visualization_settings dashcard)]
    (cond-> dashcard
      (some #(contains? settings %) ks)
      (assoc :visualization_settings (not-empty (apply dissoc settings ks))))))

(defn- readable-card?
  "Whether `card`, a dashcard's `:card` or an entry in its `:series`, is a card row the current user can read."
  [card]
  ;; A compiled dry run leaves a card as nil or a bare `{:id}` when it has no row for it, as for a card the user
  ;; cannot read that the dashboard references only as a parameter's values source. A bare map is not a model
  ;; instance, so `mi/can-read?` would throw on it.
  (and (t2/instance-of? :model/Card card) (mi/can-read? card)))

(defn- redact-hidden-series
  "The dashcard with the series cards the current user cannot read reduced to their ids.
   When there are any, the `:parameter_mappings` to them go, since they carry those cards' field ids, and so do the
   [[series-describing-viz-keys]]."
  [dashcard]
  (let [hidden-ids (into #{} (comp (remove readable-card?) (keep :id)) (:series dashcard))]
    (if (empty? hidden-ids)
      dashcard
      ;; The settings go whole rather than entry by entry: what names a hidden card follows the frontend's key and
      ;; column formats, and a readable card losing its series styling in a read is the cheaper mistake.
      (-> dashcard
          (update :series (partial mapv #(cond-> % (hidden-ids (:id %)) (select-keys [:id]))))
          (cond-> (some (comp hidden-ids :card_id) (:parameter_mappings dashcard))
            (update :parameter_mappings (partial into [] (remove (comp hidden-ids :card_id)))))
          (strip-viz-keys series-describing-viz-keys)))))

(defn- redact-dashcard
  [dashcard]
  ;; A text, heading or link card has no card, so its mappings and settings are dashboard data and stay.
  (let [hidden-card? (and (:card_id dashcard) (not (readable-card? (:card dashcard))))]
    (cond-> dashcard
      ;; The projection reads an absent `:card` the same way it reads an unhydrated one — as an id
      ;; with no name — so removing it is the whole redaction *for the projection*. The `layout`
      ;; include reads this same dashcard directly, though, and `:visualization_settings` /
      ;; `:parameter_mappings` are stored snapshots that describe the card: the title, the warehouse
      ;; column names it renders, and the field ids its filters are wired to. Leaving them behind
      ;; hands a caller who was just denied the card exactly what the denial withheld, so they go
      ;; with it.
      hidden-card?
      ;; `:parameter_mappings` is emptied rather than removed: it is a required key on a DashboardCard,
      ;; and `dashboard->resolved-params` — which the parameters summary runs over the same row — fails
      ;; its schema when the key is absent.
      (-> (dissoc :card)
          (assoc :parameter_mappings [])
          (strip-viz-keys card-describing-viz-keys))

      (seq (:series dashcard))
      redact-hidden-series)))

(defn redact-dashboard
  "The dashboard `dash`, with the cards the current user cannot read reduced to their ids.
   Its dashcards' `:card` and `:series` must be populated, by hydration on a saved dashboard and by hand on a
   compiled one.
   The stored settings and filter mappings that describe a hidden card are removed with it."
  [dash]
  (update dash :dashcards (partial mapv redact-dashcard)))

;;; ------------------------------------------------ notification --------------------------------------------------

(defn- lookup-recipient-tenant-ids
  "Map of user id to tenant id for the `recipients` whose `:user` hydration came back nil, in one
   query. The `:recipients-detail` hydration deliberately attaches `:user` nil for a deactivated
   user, whose tenant must then be looked up — otherwise a deactivated recipient reads as
   tenantless and slips past (or is wrongly dropped by) the tenant filter."
  [recipients]
  (mcp.db/user-id->tenant-id (into #{} (comp (remove :user) (keep :user_id)) recipients)))

(defn- recipient-tenant-id
  "The tenant of a user recipient: read off the hydrated `:user` when present, else off
   `id->tenant-id`, the batched lookup for recipients that have no `:user`."
  [id->tenant-id recipient]
  (if-some [user (:user recipient)]
    (:tenant_id user)
    (id->tenant-id (:user_id recipient))))

(defn- visible-recipients
  "`recipients` less the ones the current user may not see: sandboxed or impersonated callers see
   only themselves among user recipients, and a caller who belongs to a tenant sees only user
   recipients of that tenant. Same rule as `pulse/maybe-filter-pulses-recipients`: a tenantless
   caller sees recipients unfiltered, as before tenants existed.

   `id->tenant-id` is a delay over [[lookup-recipient-tenant-ids]] shared across the notification's
   handlers, so the lookup costs one query for the whole notification and none at all for a caller
   the tenant filter does not apply to."
  [id->tenant-id recipients]
  (let [caller-tenant-id (:tenant_id @api/*current-user*)]
    (vec (cond->> recipients
           (perms/sandboxed-or-impersonated-user?)
           (filter #(or (nil? (:user_id %)) (= (:user_id %) api/*current-user-id*)))

           (and (not api/*is-superuser?*) (some? caller-tenant-id))
           (filter #(or (nil? (:user_id %))
                        (= (recipient-tenant-id @id->tenant-id %) caller-tenant-id)))))))

(defn- payload-readable?
  "Whether the current user may read the notification's payload.
   [[models.notification/current-user-can-read-payload?]] has no `:notification/dashboard` clause
   (its `case` throws on one), and a migrated dashboard row has no payload to check against: no
   payload table stands behind `:payload_id`, and the `:payload` batched hydration only has a
   `:notification/card` branch, so `:payload` hydrates nil. With no dashboard reachable, the check
   is superuser — the one caller who can read every dashboard — mirroring how
   `:notification/system-event` is handled there."
  [notification]
  (if (= :notification/dashboard (:payload_type notification))
    (mi/superuser?)
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
              (let [id->tenant-id (delay (lookup-recipient-tenant-ids (mapcat :recipients handlers)))]
                (mapv (fn [handler]
                        (if strip?
                          (dissoc handler :recipients)
                          (update handler :recipients (partial visible-recipients id->tenant-id))))
                      handlers))))))

(defn hydrate-and-redact-notification
  "`notification`, hydrated and recipient-redacted for the current user — the shape
   [[metabase.mcp.v2.projections/notification-row]] takes."
  [notification]
  (redact-notification (mcp.db/hydrate-notification notification)))

;;; --------------------------------------------------- pulse ------------------------------------------------------

(defn redact-pulse
  "`pulse-row` with recipients and sensitive metadata redacted for the current user exactly as
   `/api/pulse` redacts them."
  [pulse-row]
  (-> pulse-row
      pulse/maybe-filter-pulse-recipients
      pulse/maybe-strip-sensitive-metadata))
