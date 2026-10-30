(ns metabase.mcp.v2.tools.dashboard
  "The v2 MCP `dashboard_write` tool: create and update dashboards, and apply an ordered list of
   editor operations.

   An update applies its ops as one save. A create writes the dashboard row, then applies the ops
   to it in a second save, both in one transaction. The ops are compiled against a blank dashboard
   first, so a malformed op fails before anything is written. The transaction covers failures that
   compiling cannot catch, such as the per-field parameter-mapping permission checks that run only
   on the real save. Either way a failed call leaves nothing behind.

   A whole dashboard's JSON cannot survive a round trip through model context, so callers send
   *ops*. This namespace reads current state, hands it to the pure compiler in
   [[metabase.metabot.toolkit.dashboard-ops]] through MCP's error wording in
   [[metabase.mcp.v2.dashboard-errors]], and passes the compiled payload to the same domain fns the
   REST endpoints use ([[metabase.dashboards.write/create-dashboard!]] and
   [[metabase.dashboards.write/update-dashboard!]]) — so write permission enforcement,
   transactionality, and event publishing are inherited, never reimplemented."
  (:require
   [malli.error :as me]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.lib.core :as lib]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.dashboard-errors :as dashboard-errors]
   [metabase.mcp.v2.message :as message]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.redaction :as redaction]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resolve :as v2.resolve]
   [metabase.mcp.v2.write :as v2.write]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.metabot.toolkit.dashboard-op-schema :as dashboard-op-schema]
   [metabase.metabot.toolkit.dashboard-ops :as dashboard-ops]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Reading ------------------------------------------------------

(defn- fetch-dashboard
  "The dashboard behind its read check, hydrated for the compiler."
  [id-or-eid]
  (-> (v2.resolve/resolve-and-read :model/Dashboard id-or-eid)
      (t2/hydrate [:dashcards :series :card] :tabs)))

(defn- fetch-cards
  "The `{card-id card}` map for `ids`, behind read checks.
   It omits a card the caller cannot read, so an op naming one fails the compiler's `:unknown-card` check.
   That is the same error as for a card that does not exist."
  [ids]
  (let [ids (into #{} (filter int?) ids)]
    (when (seq ids)
      (into {} (for [card  (mcp.db/select-by-ids :model/Card ids)
                     :when (mi/can-read? card)]
                 [(:id card) card])))))

;;; ------------------------------------------------ Response ------------------------------------------------------

(defn- saved-row
  "The projection row for the dashboard `id`, read back through the same hydration `get_content`
   uses so both tools return byte-identical shapes."
  [id]
  (-> (mcp.db/select-one-by-id :model/Dashboard id)
      (t2/hydrate [:dashcards :series :card] :tabs)
      redaction/redact-dashboard
      projections/dashboard-row))

(defn- attach-card-metadata
  "Give a compiled dashcard the `:card` and `:series` card rows the projection reads. Compiled
   rows carry ids only — a new one has never been hydrated, and hydration would fail on its
   negative id — so the cards already fetched for the ops stand in."
  [cards dc]
  (cond-> dc
    (and (:card_id dc) (nil? (:card dc)))
    (assoc :card (get cards (:card_id dc)))

    (seq (:series dc))
    (update :series (partial mapv (fn [s] (or (get cards (:id s)) s))))))

(defn- dry-run-row
  "The projection row the ops would produce, built without a save. Same builder as [[saved-row]],
   so a dry run and a real response have the same shape."
  [dash attrs payload cards]
  (-> (merge dash attrs payload)
      (update :dashcards (partial mapv (partial attach-card-metadata cards)))
      redaction/redact-dashboard
      projections/dashboard-row))

(defn- normalize-parameters
  "Coerce the compiled `:parameters` from their JSON shape — string `type`, string enums — to the
   internal keyword shape the REST endpoint's body decoding produces, so the same payload
   validates and saves. A value too malformed to normalize passes through untouched and is
   reported by [[validate-payload!]] instead."
  [payload]
  (cond-> payload
    (seq (:parameters payload))
    (update :parameters #(try (lib/normalize :metabase.parameters.schema/parameters %) (catch Exception _ %)))))

(defn- validate-payload!
  "Reject a payload the real save would reject, so a dry run is worth trusting."
  [payload]
  (when-let [explanation (mr/explain dashboards.write/DashUpdates payload)]
    (common/throw-teaching-error
     (message/msg ["The requested ops produce an invalid dashboard: %s"]
                  (common/humanize-detail (me/humanize explanation))))))

;;; ------------------------------------------------- Schema -------------------------------------------------------

(def ^:private dashboard-write-args-schema
  [:map {:closed true}
   [:method
    [:enum {:description (str "\"create\" makes a new dashboard (requires `name`); "
                              "\"update\" edits the one named by `id`.")}
     "create" "update"]]
   [:id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric id of the dashboard to update."}]
             [:string {:description "21-character entity_id of the dashboard to update."}]]]]
   [:name {:optional true} [:maybe [:string {:min 1 :description "Dashboard title."}]]]
   [:description {:optional true} [:maybe [:string {:description "One or two sentences on what the dashboard answers."}]]]
   [:collection_id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric id of the collection to put it in. Omit on create for your personal collection."}]
             [:string {:description "Collection entity_id, or \"root\" for the top-level collection."}]]]]
   [:collection_position {:optional true}
    [:maybe [:int {:min 1 :description "Pin position within the collection; omit to leave it unpinned."}]]]
   [:width {:optional true}
    [:maybe [:enum {:description "\"fixed\" (default) centers the grid; \"full\" stretches it to the browser width."}
             "fixed" "full"]]]
   [:auto_apply_filters {:optional true}
    [:maybe [:boolean {:description "When false, filter changes wait for the viewer to press Apply. Default true."}]]]
   [:cache_ttl {:optional true} [:maybe [:int {:min 1 :description "Cache lifetime for this dashboard's results, in hours."}]]]
   [:archived {:optional true}
    [:maybe [:boolean {:description (str "Update only: true moves it to the trash, false restores it. "
                                         "Archiving is the only removal path — there is no hard delete.")}]]]
   [:validate_only {:optional true}
    [:maybe [:boolean {:description "Dry run: returns the layout the ops would produce, writing nothing."}]]]
   [:clear {:optional true}
    [:maybe [:sequential [:enum {:description "Update only: property names to unset (description, collection_position, cache_ttl). Needed because a null cannot say \"clear this\" — strict clients fill every unset property with null, so nulls are stripped at the boundary."}
                          "description" "collection_position" "cache_ttl"]]]]
   [:ops {:optional true}
    [:maybe [:sequential {:description (str "Editor operations, applied in order. The call saves them "
                                            "atomically, together with the new dashboard on create.")}
             dashboard-op-schema/op-schema]]]])

(def ^:private dashboard-write-entry
  {:create-required [:name]
   :clearable       #{:description :collection_position :cache_ttl}})

;;; ------------------------------------------------- Handler ------------------------------------------------------

(def ^:private attribute-keys
  [:name :description :collection_id :collection_position :width :auto_apply_filters :cache_ttl :archived])

(defn- dashboard-attrs
  "The dashboard-level attributes in `body`, with `collection_id` resolved through the v2
   collection-reference convention."
  [body]
  (cond-> (select-keys body attribute-keys)
    (contains? body :collection_id)
    (assoc :collection_id (v2.resolve/resolve-collection-id (:collection_id body)))))

(defn- create-attrs
  "[[dashboard-attrs]] for the create path, where an omitted `collection_id` means the caller's
   personal collection rather than the root collection."
  [body]
  (assoc (dashboard-attrs body)
         :collection_id (v2.resolve/resolve-collection-id-or-personal (:collection_id body))))

(defn- apply-ops!
  "Compile `ops` against `dash` and save, returning the projection row. With `validate-only?` the
   would-be row is built from the compiled payload instead and nothing is written."
  [dash ops attrs validate-only?]
  (let [{:keys [payload cards]}
        (dashboard-errors/do-with-teaching-errors
         #(let [ops   (dashboard-ops/prepare-ops ops)
                cards (fetch-cards (dashboard-ops/referenced-card-ids dash ops))]
            {:payload (normalize-parameters (dashboard-ops/compile-ops dash ops cards))
             :cards   cards}))]
    (validate-payload! (merge attrs payload))
    (if validate-only?
      (dry-run-row dash attrs payload cards)
      (saved-row (:id (dashboards.write/update-dashboard! (u/the-id dash) (merge attrs payload)))))))

(defn- blank-dashboard
  "The empty dashboard a `validate_only` create compiles against, so a dry run writes nothing at
   all — not even the dashboard row."
  [attrs]
  (merge {:id nil :dashcards [] :tabs [] :parameters []} attrs))

(registry/deftool dashboard-write
  "Create or update a dashboard and edit its layout with ordered ops. Each call is atomic — nothing is
  written unless every op succeeds, so a failed call leaves the dashboard untouched (or, for create, creates
  nothing), and a retry cannot double-add.
  method: \"create\" requires name; \"update\" requires id and accepts archived (true trashes,
  false restores — there is no hard delete). Give each new card or tab its own negative id (-1, -2, …); later
  ops in the same call reference it, and the server assigns real ids on save. Ops: add_card, add_text,
  add_heading, add_link, add_iframe, add_action, duplicate_card, replace_card, move, resize, remove,
  set_series, patch_dashcard, add_tab, rename_tab, move_tab, duplicate_tab, remove_tab, add_parameter,
  update_parameter, remove_parameter, move_parameter, wire_parameter, unwire_parameter. Before your first
  add_parameter or wire_parameter, read learn(\"dashboard-filters\") unless already loaded — parameter types,
  target grammar, linked filters, value sources; learn(\"dashboard-layout\") covers the 24-column grid,
  per-display default sizes, and layout conventions. validate_only: true returns the layout the ops would
  produce without writing — but per-field parameter-mapping permission checks run only on the real save, so a
  clean dry run can still be rejected. Returns the resulting dashboard, so no follow-up read is needed.
  Requires write permission on the dashboard, and read permission on each card an op adds, wires, or makes a
  filter's value source; cards already on the dashboard can stay without it."
  {:name           "dashboard_write"
   :default-access :allowed
   :scope          metabot.scope/agent-content-write
   ;; `archived: true` trashes the dashboard, and `remove`/`remove_tab`/`remove_parameter` drop
   ;; cards, tabs, and subscriptions — not the additive-only update `destructiveHint false`
   ;; would assert.
   :annotations    {:readOnlyHint false :destructiveHint true}
   :args           dashboard-write-args-schema}
  [args {:keys [token-scopes]}]
  (let [dispatched (v2.write/dispatch-write dashboard-write-entry args)]
    (common/success-content
     (v2.write/readback token-scopes [metabot.scope/agent-content-read]
                        (projections/project
                         :dashboard :concise
                         (case (first dispatched)
                           :create
                           (let [[_ body]       dispatched
                                 attrs          (create-attrs body)
                                 ops            (:ops body)
                                 validate-only? (boolean (:validate_only body))]
                             (when (contains? body :archived)
                               (common/throw-teaching-error
                                (message/msg [(str "\"archived\" applies to method \"update\" "
                                                   "only — remove it from this create call.")])))
                             (cond
                               validate-only? (apply-ops! (blank-dashboard attrs) (or ops []) attrs true)
                               (seq ops)      (do
                                                ;; Compile before creating anything, so a bad op can't leave an
                                                ;; orphaned empty dashboard behind for a retry to duplicate. A new
                                                ;; dashboard is empty by definition, so compiling against a blank
                                                ;; checks everything the post-create compile would.
                                                (apply-ops! (blank-dashboard attrs) ops attrs true)
                                                ;; ...and the two writes share a transaction, because the compile
                                                ;; above only proves the OPS are good. Anything else that throws
                                                ;; after the row exists — a schema check, a permission check, a
                                                ;; failing save — would otherwise strand an empty dashboard,
                                                ;; and every retry would add another (GHY-4501).
                                                (t2/with-transaction [_conn]
                                                  (apply-ops! (t2/hydrate (dashboards.write/create-dashboard! attrs)
                                                                          [:dashcards :series :card] :tabs)
                                                              ops {} false)))
                               :else          (saved-row (:id (dashboards.write/create-dashboard! attrs)))))

                           :update
                           (let [[_ id body]    dispatched
                                 dash           (fetch-dashboard id)
                                 attrs          (dashboard-attrs body)
                                 ops            (:ops body)
                                 validate-only? (boolean (:validate_only body))]
                             (cond
                               (seq ops)      (apply-ops! dash ops attrs validate-only?)
                               validate-only? (do (validate-payload! attrs)
                                                  (dry-run-row dash attrs nil nil))
                               :else          (saved-row (:id (dashboards.write/update-dashboard! (:id dash) attrs)))))))
                        nil))))
