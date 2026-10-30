(ns metabase.metabot.toolkit.dashboard-write
  "Compile dashboard ops and save them, for every tool that edits dashboards with ops.
   The ops are compiled by [[metabase.metabot.toolkit.dashboard-ops]].
   The saves go through [[dashboards.write/create-dashboard!]] and [[dashboards.write/update-dashboard!]],
   so write permission checks, transactions and events come with them.
   The REST endpoints have their own copies of those two functions, so the two paths can drift.
   Errors are codes from [[metabase.metabot.toolkit.dashboard-ops/errors]], and each tool words them its own way.
   Reading the dashboard, and projecting the result for the model, are left to the tool."
  (:require
   [malli.error :as me]
   [metabase.api.common :as api]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.lib.core :as lib]
   [metabase.metabot.toolkit.dashboard-ops :as dashboard-ops]
   [metabase.metabot.toolkit.db :as toolkit.db]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- fetch-cards
  "The `{card-id card}` map for `ids`, behind read checks.
   It omits a card the user cannot read, so an op naming one fails the compiler's `:unknown-card` check.
   That is the same error as for a card that does not exist."
  [ids]
  (let [ids (into #{} (filter int?) ids)]
    (when (seq ids)
      (into {} (for [card  (toolkit.db/cards ids)
                     :when (mi/can-read? card)]
                 [(:id card) card])))))

(defn- normalize-parameters
  "Coerce the `:parameters` in `m`, attributes or a compiled payload, from their JSON shape to the keyword shape.
   That is the shape the REST endpoint's body decoding produces, so the same payload validates and saves.
   A value too malformed to normalize passes through untouched, and [[validate-write!]] reports it."
  [m]
  (cond-> m
    (seq (:parameters m))
    (update :parameters #(try (lib/normalize :metabase.parameters.schema/parameters %) (catch Exception _ %)))))

(defn- check-schema!
  "Throws `:invalid-payload` when `value` breaks `schema`."
  [schema value]
  (when-let [explanation (mr/explain schema value)]
    (dashboard-ops/fail! :invalid-payload {:explanation (me/humanize explanation)})))

(defn- validate-write!
  "Throws `:invalid-payload` when the real save would reject `attrs` or the compiled `payload`.
   A create checks `attrs` against [[dashboards.write/NewDashboard]], and saves any `payload` as an update.
   An update checks them together, as it saves them.
   Dry runs and saves both call it, so a clean dry run is worth trusting."
  [creating? attrs payload]
  (if creating?
    (do (check-schema! dashboards.write/NewDashboard attrs)
        (when payload
          (check-schema! dashboards.write/DashUpdates payload)))
    (check-schema! dashboards.write/DashUpdates (merge attrs payload))))

(defn- check-permission!
  "Throws a 403 unless the user may update `dashboard`, or create a dashboard in the collection `attrs` names.
   The save checks the same, so a dry run calls this to refuse what the save would."
  [dashboard attrs]
  (if dashboard
    (api/write-check dashboard)
    (api/create-check :model/Dashboard {:collection_id (:collection_id attrs)})))

(defn- blank-dashboard
  "The empty dashboard with `attrs` that a create compiles its ops against, before anything is written."
  [attrs]
  (merge {:id nil :dashcards [] :tabs [] :parameters []} attrs))

(defn- compile-write
  "Compiles `ops`, prepared, against `dash` without writing, and returns `{:payload :cards}`.
   The payload is what saving the ops would write alongside the attributes.
   The cards map holds the row of every card the payload references that the user can read, keyed by id."
  [dash ops]
  (let [cards (fetch-cards (dashboard-ops/referenced-card-ids dash ops))]
    {:payload (normalize-parameters (dashboard-ops/compile-ops dash ops cards))
     :cards   cards}))

(defn- attach-card-metadata
  "Give a compiled dashcard the `:card` and `:series` card rows a saved one would be hydrated with.
   Compiled rows carry ids only, and a new one cannot be hydrated by its negative id, so the cards already fetched
   for the ops stand in."
  [cards dc]
  (cond-> dc
    (and (:card_id dc) (nil? (:card dc)))
    (assoc :card (get cards (:card_id dc)))

    (seq (:series dc))
    (update :series (partial mapv (fn [s] (or (get cards (:id s)) s))))))

(defn- dry-run-dashboard
  "The dashboard saving `attrs` and the compiled `payload` to `dash` would produce, shaped like a saved one."
  [dash attrs payload cards]
  (-> (merge dash attrs payload)
      (update :dashcards (partial mapv (partial attach-card-metadata cards)))))

(defn- hydrated
  "`dash`, a saved row, hydrated with `[:dashcards :series :card] :tabs`."
  [dash]
  (t2/hydrate dash [:dashcards :series :card] :tabs))

(defn- create-dashboard!
  "Creates a dashboard from `attrs`, saves the compiled `payload` to it when there is one, and returns it hydrated.
   Nothing is written if the save or the read back fails."
  [attrs payload]
  ;; One transaction, because anything that throws after the row exists (a permission check, a failing save) would
  ;; otherwise strand an empty dashboard, and every retry would add another (GHY-4501). The read back runs inside it
  ;; too, so a failure there doesn't report an error for a dashboard that was in fact created.
  (t2/with-transaction [_conn]
    (let [dash (dashboards.write/create-dashboard! attrs)]
      (hydrated (if payload
                  (dashboards.write/update-dashboard! (:id dash) payload)
                  dash)))))

(defn write!
  "Creates or updates a dashboard with the attributes `attrs` and the ops `ops`, and returns it.
   It returns a dashboard hydrated with `[:dashcards :series :card] :tabs` whether or not it saved.
   With a `dashboard`, hydrated the same way and already read-checked by the caller, it updates that one.
   Without one it creates a dashboard.
   With `validate-only?` it writes nothing, and returns the dashboard the save would produce.
   A dry run checks write permission on the dashboard, or create permission on the collection.
   It does not run the save's other permission checks, such as moving to a collection or per-field mapping checks.
   A nil `ops` means none were sent; anything else must be a list of ops.
   Throws an error from [[dashboard-ops/errors]] when an op is invalid or the save would be rejected."
  [{:keys [dashboard validate-only?] :as opts}]
  ;; Prepared before any branch reads them, so a malformed `ops` fails as :invalid-op rather than crashing a `seq`
  ;; or passing as no ops.
  (let [ops   (dashboard-ops/prepare-ops (:ops opts))
        attrs (normalize-parameters (:attrs opts))
        dash  (or dashboard (blank-dashboard attrs))
        _     (when validate-only?
                (check-permission! dashboard attrs))
        ;; Without ops nothing is compiled, so an attribute-only save doesn't rewrite the layout.
        {:keys [payload cards]} (when (seq ops)
                                  (compile-write dash ops))]
    (validate-write! (nil? dashboard) attrs payload)
    (cond
      validate-only?
      (dry-run-dashboard dash attrs payload cards)

      (nil? dashboard)
      (create-dashboard! attrs payload)

      :else
      (hydrated (dashboards.write/update-dashboard! (u/the-id dashboard) (merge attrs payload))))))
