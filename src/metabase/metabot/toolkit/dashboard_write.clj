(ns metabase.metabot.toolkit.dashboard-write
  "Compile dashboard ops and save them, for every tool that edits dashboards with ops.
   The ops are compiled by [[metabase.metabot.toolkit.dashboard-ops]].
   The saves go through the same functions the REST endpoints use, [[metabase.dashboards.write/create-dashboard!]] and
   [[metabase.dashboards.write/update-dashboard!]], so write permission checks, transactions and events come with them.
   Errors are codes from [[metabase.metabot.toolkit.dashboard-ops/errors]], and each tool words them its own way.
   Reading the dashboard, and projecting the result for the model, are left to the tool."
  (:require
   [malli.error :as me]
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
  "Coerce the compiled `:parameters` from their JSON shape (string `type`, string enums) to the internal keyword shape.
   That is the shape the REST endpoint's body decoding produces, so the same payload validates and saves.
   A value too malformed to normalize passes through untouched, and [[validate-payload!]] reports it."
  [payload]
  (cond-> payload
    (seq (:parameters payload))
    (update :parameters #(try (lib/normalize :metabase.parameters.schema/parameters %) (catch Exception _ %)))))

(defn- validate-payload!
  "Throws `:invalid-payload` when the real save would reject `payload`, so a dry run is worth trusting.
   The payload is the dashboard attributes merged with the compiled ops."
  [payload]
  (when-let [explanation (mr/explain dashboards.write/DashUpdates payload)]
    (dashboard-ops/fail! :invalid-payload {:explanation (me/humanize explanation)})))

(defn- blank-dashboard
  "The empty dashboard with `attrs` that a create compiles its ops against, before anything is written."
  [attrs]
  (merge {:id nil :dashcards [] :tabs [] :parameters []} attrs))

(defn- compile-write
  "Compiles `ops` against `dash` without writing, and returns `{:payload :cards}`.
   The payload is what saving the ops would write alongside `attrs`.
   The cards map holds the row of every card the payload references that the user can read, keyed by id."
  [dash attrs ops]
  (let [ops     (dashboard-ops/prepare-ops ops)
        cards   (fetch-cards (dashboard-ops/referenced-card-ids dash ops))
        payload (normalize-parameters (dashboard-ops/compile-ops dash ops cards))]
    (validate-payload! (merge attrs payload))
    {:payload payload, :cards cards}))

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

(defn- update-dashboard!
  "Saves `attrs` and `ops` to `dash` as one update, and returns the saved row."
  [dash attrs ops]
  (if (seq ops)
    (let [{:keys [payload]} (compile-write dash attrs ops)]
      (dashboards.write/update-dashboard! (u/the-id dash) (merge attrs payload)))
    (dashboards.write/update-dashboard! (u/the-id dash) attrs)))

(defn- create-dashboard!
  "Creates a dashboard from `attrs` with `ops` applied, and returns the saved row.
   Nothing is written if an op is invalid or the save fails."
  [attrs ops]
  (if (seq ops)
    (do
      ;; Compile before creating anything, so a bad op can't leave an orphaned empty dashboard behind for a retry to
      ;; duplicate. A new dashboard is empty by definition, so compiling against a blank checks everything the
      ;; post-create compile would.
      (compile-write (blank-dashboard attrs) attrs ops)
      ;; ...and the two writes share a transaction, because the compile above only proves the ops are good. Anything
      ;; else that throws after the row exists (a schema check, a permission check, a failing save) would otherwise
      ;; strand an empty dashboard, and every retry would add another (GHY-4501).
      (t2/with-transaction [_conn]
        (update-dashboard! (t2/hydrate (dashboards.write/create-dashboard! attrs) [:dashcards :series :card] :tabs)
                           {}
                           ops)))
    (dashboards.write/create-dashboard! attrs)))

(defn- saved-dashboard
  "The saved dashboard `id`, read back and hydrated with `[:dashcards :series :card] :tabs`."
  [id]
  (t2/hydrate (toolkit.db/dashboard id) [:dashcards :series :card] :tabs))

(defn write!
  "Creates or updates a dashboard with the attributes `attrs` and the ops `ops`, and returns it.
   It returns a dashboard hydrated with `[:dashcards :series :card] :tabs` whether or not it saved.
   With a `dashboard`, hydrated the same way and already read-checked by the caller, it updates that one.
   Without one it creates a dashboard.
   With `validate-only?` it writes nothing, and returns the dashboard the save would produce.
   Throws an error from [[dashboard-ops/errors]] when an op is invalid or the save would be rejected."
  [{:keys [dashboard attrs ops validate-only?]}]
  (cond
    (and validate-only? (nil? dashboard))
    (let [blank                   (blank-dashboard attrs)
          {:keys [payload cards]} (compile-write blank attrs (or ops []))]
      (dry-run-dashboard blank attrs payload cards))

    (and validate-only? (seq ops))
    (let [{:keys [payload cards]} (compile-write dashboard attrs ops)]
      (dry-run-dashboard dashboard attrs payload cards))

    validate-only?
    (do (validate-payload! attrs)
        (dry-run-dashboard dashboard attrs nil nil))

    (nil? dashboard)
    (saved-dashboard (:id (create-dashboard! attrs ops)))

    :else
    (saved-dashboard (:id (update-dashboard! dashboard attrs ops)))))
