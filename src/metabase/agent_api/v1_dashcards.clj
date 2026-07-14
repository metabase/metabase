(ns metabase.agent-api.v1-dashcards
  "The dashcard mutation engine behind `update_dashboard`'s `dashcards` list.

   A mutation is `{action: add | remove | move, …}`, and a batch applies in order. Each entry names the
   card or dashcard it acts on, never a grid position: autoplace picks the slot, walking the dashboard's
   current cards as the batch adds to them, so every new card lands somewhere free.

   A failing entry aborts the batch naming its index — the caller runs the batch inside a transaction, so
   a half-applied layout never reaches the dashboard."
  (:require
   [metabase.api.common :as api]
   [metabase.dashboards.autoplace :as autoplace]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- size-override
  "The `{:width :height}` a `display_size` names, or nil to let the card's display pick its own size."
  [display-size]
  (case display-size
    "wide" {:width 18 :height 6}
    "tall" {:width 9  :height 12}
    "full" {:width 24 :height 9}
    nil))

(defn- add-dashcard!
  [dashboard-id state {:keys [card_id display_size]}]
  (let [card     (api/read-check :model/Card card_id)
        override (size-override display_size)
        position (if override
                   (autoplace/get-position-for-new-dashcard
                    (:placed @state) (:width override) (:height override) autoplace/default-grid-width)
                   (autoplace/get-position-for-new-dashcard
                    (:placed @state) (or (:display card) :table)))
        dashcard (first (t2/insert-returning-instances!
                         :model/DashboardCard
                         (merge position {:dashboard_id dashboard-id :card_id card_id})))]
    (swap! state #(-> %
                      (update :placed conj position)
                      (update :added conj dashcard)))))

(defn- existing-dashcard
  [dashboard-id dashcard-id]
  (api/check-404 (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id)))

(defn- remove-dashcard!
  [dashboard-id state {:keys [dashcard_id]}]
  (let [existing (existing-dashcard dashboard-id dashcard_id)]
    (t2/delete! :model/DashboardCard :id dashcard_id)
    (swap! state #(-> %
                      (update :placed (fn [cards] (vec (remove (comp #{dashcard_id} :id) cards))))
                      (update :removed conj existing)))))

(defn- move-dashcard!
  [dashboard-id state {:keys [dashcard_id position]}]
  (let [existing     (existing-dashcard dashboard-id dashcard_id)
        ;; The moved card has to leave the placed list while its new slot is computed, or autoplace treats
        ;; it as still occupying its old one.
        other-placed (vec (remove (comp #{dashcard_id} :id) (:placed @state)))
        top?         (= position "top")
        shift        (:size_y existing)
        new-pos      (if top?
                       {:row 0 :col 0 :size_x (:size_x existing) :size_y (:size_y existing)}
                       (autoplace/get-position-for-new-dashcard
                        other-placed (:size_x existing) (:size_y existing) autoplace/default-grid-width))]
    ;; "top" parks the card at row 0, so everything else shifts down by its height or the dashcards overlap.
    (when top?
      (doseq [{:keys [id row]} other-placed]
        (t2/update! :model/DashboardCard id {:row (+ row shift)})))
    (t2/update! :model/DashboardCard dashcard_id (select-keys new-pos [:row :col]))
    (swap! state #(-> %
                      (assoc :placed (conj (if top?
                                             (mapv (fn [c] (update c :row + shift)) other-placed)
                                             other-placed)
                                           (merge existing (select-keys new-pos [:row :col]))))
                      (update :moved conj (merge existing new-pos))))))

(defn apply-mutations!
  "Apply `mutations` to the dashboard in order, returning `{:added [dashcard…] :removed […] :moved […]}`.

   A `card_id` the caller cannot read is a 403/404, and a `dashcard_id` that is not on this dashboard is a
   404. Either way the failure is re-thrown naming the mutation's index, so the caller learns which entry of
   the batch to fix. Run this inside a transaction: an abort must leave nothing half-applied."
  [dashboard-id mutations]
  (let [state (atom {:placed  (vec (t2/select :model/DashboardCard :dashboard_id dashboard-id))
                     :added   []
                     :removed []
                     :moved   []})]
    (doseq [[index {:keys [action] :as mutation}] (map-indexed vector mutations)]
      (try
        (case action
          "add"    (add-dashcard! dashboard-id state mutation)
          "remove" (remove-dashcard! dashboard-id state mutation)
          "move"   (move-dashcard! dashboard-id state mutation))
        (catch Exception e
          (throw (ex-info (str "Dashcard mutation #" index " (" action ") failed: " (ex-message e))
                          (assoc (ex-data e) :mutation-index index :mutation mutation)
                          e)))))
    (select-keys @state [:added :removed :moved])))
