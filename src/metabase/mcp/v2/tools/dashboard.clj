(ns metabase.mcp.v2.tools.dashboard
  "The v2 MCP `dashboard_write` tool: create and update dashboards, and apply an ordered list of
   editor operations as one atomic save.

   A whole dashboard's JSON cannot survive a round trip through model context, so callers send
   *ops*. This namespace reads current state, hands it to the pure compiler in
   [[metabase.mcp.v2.dashboard-ops]], and passes the compiled payload to the same domain fns the
   REST endpoints use ([[metabase.dashboards.write/create-dashboard!]] and
   [[metabase.dashboards.write/update-dashboard!]]) — so write permission enforcement,
   transactionality, and event publishing are inherited, never reimplemented."
  (:require
   [malli.error :as me]
   [metabase.api.common :as api]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.dashboard-ops :as dashboard-ops]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.models.interface :as mi]
   [metabase.parameters.core :as parameters]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Reading ------------------------------------------------------

(defn- fetch-dashboard
  "The dashboard behind its read check, hydrated for the compiler."
  [id-or-eid]
  (-> (common/resolve-and-read :model/Dashboard id-or-eid
                               (fn [id] (api/read-check (t2/select-one :model/Dashboard :id id))))
      (t2/hydrate [:dashcards :series :card] :tabs)))

(defn- referenced-card-ids
  "Every card id the compiled payload may need metadata for: those already on the dashboard, plus
   any named by an op."
  [dash ops]
  (into (set (keep :card_id (:dashcards dash)))
        (mapcat (fn [op] (cons (:card_id op) (:card_ids op))))
        ops))

(defn- fetch-cards
  "`{card-id card}` for `ids`, behind read checks. A card the caller cannot read is omitted, so
   an op referencing it fails with a teaching error rather than leaking its existence."
  [ids]
  (let [ids (into #{} (filter int?) ids)]
    (when (seq ids)
      (into {} (for [card  (t2/select :model/Card :id [:in ids])
                     :when (mi/can-read? card)]
                 [(:id card) card])))))

(defn- check-cards-exist!
  "Reject an op naming a card the caller cannot read, before any write happens."
  [ops cards]
  (doseq [[idx op] (map-indexed vector ops)
          :let     [card-id (:card_id op)]
          :when    (and card-id (not (contains? cards card-id)))]
    (dashboard-ops/op-error!
     idx (format "%s): no card with id %s that you can read." (:op op) card-id))))

;;; ------------------------------------------------ Response ------------------------------------------------------

(defn- saved-row
  "The projection row for the dashboard `id`, read back through the same hydration `get_content`
   uses so both tools return byte-identical shapes."
  [id]
  (-> (t2/select-one :model/Dashboard :id id)
      (t2/hydrate [:dashcards :series :card] :tabs)
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
      projections/dashboard-row))

(defn- normalize-parameters
  "Coerce the compiled `:parameters` from their JSON shape — string `type`, string enums — to the
   internal keyword shape the REST endpoint's body decoding produces, so the same payload
   validates and saves. A value too malformed to normalize passes through untouched and is
   reported by [[validate-payload!]] instead."
  [payload]
  (cond-> payload
    (seq (:parameters payload))
    (update :parameters #(try (parameters/normalize-parameters %) (catch Exception _ %)))))

(defn- validate-payload!
  "Reject a payload the real save would reject, so a dry run is worth trusting."
  [payload]
  (when-let [explanation (mr/explain dashboards.write/DashUpdates payload)]
    (common/throw-teaching-error
     (format "The requested ops produce an invalid dashboard: %s"
             (pr-str (me/humanize explanation))))))

;;; ------------------------------------------------- Schema -------------------------------------------------------

(def ^:private position-schema
  [:map {:closed true :description "Grid slot. Omit to autoplace below the existing cards."}
   [:row [:int {:min 0 :description "Zero-based grid row."}]]
   [:col [:int {:min 0 :max 23 :description "Zero-based grid column; the grid is 24 columns wide."}]]])

(def ^:private size-schema
  [:map {:closed true :description "Grid size in cells; the grid is 24 columns wide."}
   [:size_x [:int {:min 1 :max 24 :description "Width in grid columns."}]]
   [:size_y [:int {:min 1 :description "Height in grid rows."}]]])

(def ^:private new-id-schema
  [:int {:max -1
         :description (str "A negative id you choose (-1, -2, …). Later ops in this same call "
                           "reference the new row by it; the server assigns the real id on save.")}])

(def ^:private tab-ref-schema
  [:maybe [:int {:description (str "Id of the tab to place this on: an existing tab's id, or the "
                                   "negative id of a tab added earlier in this same call. Omit on "
                                   "a dashboard with no tabs.")}]])

(def ^:private inline-parameters-schema
  [:maybe [:sequential [:string {:description "Id of a dashboard parameter to render on this card instead of in the header."}]]])

(def ^:private dashcard-ref-schema
  [:int {:description (str "Id of a dashcard already on the dashboard, or the negative id of one "
                           "added earlier in this same call.")}])

(def ^:private parameter-id-schema
  [:string {:min 1 :description "The parameter's id — a short string you choose and reuse in later ops."}])

;; `add_parameter` and `update_parameter` write REST parameter properties straight through, so the
;; camelCase names (`isMultiSelect`, `filteringParameters`, `sectionId`) are preserved verbatim.
(def ^:private parameter-fields
  [[:name {:optional true} [:maybe [:string {:min 1 :description "Label shown on the dashboard."}]]]
   [:type {:optional true}
    [:maybe [:string {:description (str "Parameter type, e.g. \"string/=\", \"string/contains\", "
                                        "\"number/=\", \"number/between\", \"date/all-options\", "
                                        "\"date/relative\", \"id\", \"temporal-unit\".")}]]]
   [:sectionId {:optional true}
    [:maybe [:string {:description "Widget section, e.g. \"string\", \"number\", \"date\", \"id\"."}]]]
   [:default {:optional true}
    [:maybe [:any {:description "Default value: a scalar, or an array for a multi-select parameter."}]]]
   [:required {:optional true}
    [:maybe [:boolean {:description "When true the dashboard cannot be viewed without a value; pair it with a default."}]]]
   [:isMultiSelect {:optional true}
    [:maybe [:boolean {:description "Whether the widget accepts several values at once."}]]]
   [:temporal_units {:optional true}
    [:maybe [:sequential [:string {:description "Allowed unit for a \"temporal-unit\" parameter, e.g. \"month\"."}]]]]
   [:values_query_type {:optional true}
    [:maybe [:enum {:description "How the value picker behaves: a dropdown list, a search box, or free text."}
             "list" "search" "none"]]]
   [:values_source_type {:optional true}
    [:maybe [:enum {:description "Where picker values come from. Omit to use the connected field's values."}
             "static-list" "card"]]]
   [:values_source_config {:optional true}
    [:maybe [:map {:description (str "Config for values_source_type: {\"values\": [...]} for "
                                     "static-list, or {\"card_id\": n, \"value_field\": target} for card.")}]]]
   [:filteringParameters {:optional true}
    [:maybe [:sequential [:string {:description "Id of another parameter whose value narrows this one (a linked filter)."}]]]]])

(defn- op-map
  "One closed op entry for [[op-schema]]: the `op` discriminator plus `fields`."
  [op-name description fields]
  [op-name
   (into [:map {:closed true :description description}
          [:op [:= op-name]]]
         fields)])

(def ^:private op-schema
  [:multi {:dispatch :op
           :description "One editor operation; `op` selects which."}
   (op-map "add_card" "Place a saved question, model, or metric on the dashboard."
           [[:id new-id-schema]
            [:card_id [:int {:description "Numeric id of the saved question, model, or metric to place."}]]
            [:tab {:optional true} tab-ref-schema]
            [:position {:optional true} [:maybe position-schema]]
            [:size {:optional true} [:maybe size-schema]]
            [:series {:optional true}
             [:maybe [:sequential [:int {:description "Numeric id of a card to overlay on this one as an extra series."}]]]]
            [:inline_parameters {:optional true} inline-parameters-schema]])
   (op-map "add_text" "Add a markdown text card."
           [[:id new-id-schema]
            [:markdown [:string {:description "Markdown body of the text card."}]]
            [:tab {:optional true} tab-ref-schema]
            [:position {:optional true} [:maybe position-schema]]
            [:size {:optional true} [:maybe size-schema]]
            [:inline_parameters {:optional true} inline-parameters-schema]])
   (op-map "add_heading" "Add a section heading — a full-width label with no card background."
           [[:id new-id-schema]
            [:text [:string {:description "Heading text; plain text, not markdown."}]]
            [:tab {:optional true} tab-ref-schema]
            [:position {:optional true} [:maybe position-schema]]
            [:size {:optional true} [:maybe size-schema]]
            [:inline_parameters {:optional true} inline-parameters-schema]])
   (op-map "add_link" "Add a link card. Pass exactly one of `url` or `entity`."
           [[:id new-id-schema]
            [:url {:optional true} [:maybe [:string {:description "External URL to link to."}]]]
            [:entity {:optional true}
             [:maybe [:map {:closed true :description "A Metabase entity to link to, instead of `url`."}
                      [:type [:enum {:description "Kind of entity being linked."}
                              "dashboard" "card" "dataset" "collection" "database" "table"]]
                      [:id [:int {:description "Numeric id of that entity."}]]]]]
            [:tab {:optional true} tab-ref-schema]
            [:position {:optional true} [:maybe position-schema]]
            [:size {:optional true} [:maybe size-schema]]
            [:inline_parameters {:optional true} inline-parameters-schema]])
   (op-map "add_iframe" "Embed an external page. The host must be allowed by the instance's iframe settings."
           [[:id new-id-schema]
            [:src [:string {:description "URL to embed, or a full <iframe> tag."}]]
            [:tab {:optional true} tab-ref-schema]
            [:position {:optional true} [:maybe position-schema]]
            [:size {:optional true} [:maybe size-schema]]
            [:inline_parameters {:optional true} inline-parameters-schema]])
   (op-map "add_action" "Add a button that runs a saved action."
           [[:id new-id-schema]
            [:action_id [:int {:description "Numeric id of the saved action to run."}]]
            [:label {:optional true} [:maybe [:string {:description "Button text. Defaults to the action's own name."}]]]
            [:display {:optional true}
             [:maybe [:enum {:description "\"button\" (default) runs on click; \"form\" renders the action's fields inline."}
                      "button" "form"]]]
            [:tab {:optional true} tab-ref-schema]
            [:position {:optional true} [:maybe position-schema]]
            [:size {:optional true} [:maybe size-schema]]])
   (op-map "duplicate_card"
           (str "Copy an existing dashcard, keeping its card, visualization settings, and parameter "
                "mappings. The copy is the same size as the original and gets its own slot.")
           [[:id new-id-schema]
            [:dashcard_id dashcard-ref-schema]
            [:tab {:optional true} tab-ref-schema]
            [:position {:optional true} [:maybe position-schema]]])
   (op-map "replace_card"
           (str "Point an existing dashcard at a different card, keeping its slot and size. Series, "
                "parameter mappings, and visualization settings reset, exactly as the editor does.")
           [[:dashcard_id dashcard-ref-schema]
            [:card_id [:int {:description "Numeric id of the card to show instead."}]]])
   (op-map "move" "Move a dashcard to a different slot, a different tab, or both."
           [[:dashcard_id dashcard-ref-schema]
            [:tab {:optional true} tab-ref-schema]
            [:position {:optional true} [:maybe position-schema]]])
   (op-map "resize" "Resize a dashcard in place."
           [[:dashcard_id dashcard-ref-schema]
            [:size size-schema]])
   (op-map "remove" "Delete a dashcard from the dashboard. The underlying card is untouched."
           [[:dashcard_id dashcard-ref-schema]])
   (op-map "set_series"
           "Replace a dashcard's overlaid series with this ordered list; pass an empty list to clear them."
           [[:dashcard_id dashcard-ref-schema]
            [:card_ids [:sequential [:int {:description "Numeric id of a card to overlay, in draw order."}]]]])
   (op-map "patch_dashcard"
           (str "Merge content settings into a dashcard — visualization settings, click behavior, "
                "column settings, a link card's target. Layout and identity keys (row, col, size_x, "
                "size_y, dashboard_tab_id, card_id, action_id, series, id) are rejected; use move, "
                "resize, replace_card, or set_series for those.")
           [[:dashcard_id dashcard-ref-schema]
            [:patch [:map {:description (str "Dashcard properties to merge. `visualization_settings` "
                                             "merges key by key rather than replacing the map.")}]]])
   (op-map "add_tab" "Add a tab. The first tab you add adopts the cards already on the dashboard."
           [[:id new-id-schema]
            [:name [:string {:min 1 :description "Tab label."}]]])
   (op-map "rename_tab" "Rename an existing tab."
           [[:tab_id [:int {:description "Id of the tab to rename, or the negative id of one added earlier in this call."}]]
            [:name [:string {:min 1 :description "New tab label."}]]])
   (op-map "move_tab" "Reorder the tab strip by moving one tab to a new position."
           [[:tab_id [:int {:description "Id of the tab to move."}]]
            [:index [:int {:min 0 :description "Zero-based position to move it to, counting the other tabs only."}]]])
   (op-map "duplicate_tab" "Copy a tab and every card on it."
           [[:id new-id-schema]
            [:tab_id [:int {:description "Id of the tab to copy."}]]])
   (op-map "remove_tab" "Delete a tab and every card on it."
           [[:tab_id [:int {:description "Id of the tab to delete."}]]])
   (op-map "add_parameter"
           (str "Add a filter or parameter widget to the dashboard. It does nothing until "
                "`wire_parameter` connects it to at least one card.")
           (into [[:parameter_id parameter-id-schema]] parameter-fields))
   (op-map "update_parameter" "Change properties of an existing parameter; omitted properties are left alone."
           (into [[:parameter_id parameter-id-schema]] parameter-fields))
   (op-map "remove_parameter"
           (str "Delete a parameter, along with its card mappings, its inline placements, and any "
                "linked-filter reference to it. Subscriptions that depend on it are archived and "
                "their owners are emailed.")
           [[:parameter_id parameter-id-schema]])
   (op-map "move_parameter" "Reorder a parameter in the header, or move it onto a card. Pass exactly one of `index` or `dashcard_id`."
           [[:parameter_id parameter-id-schema]
            [:index {:optional true}
             [:maybe [:int {:min 0 :description "Zero-based position in the header, counting the other parameters only."}]]]
            [:dashcard_id {:optional true}
             [:maybe [:int {:description "Render the parameter on this dashcard instead of in the header."}]]]])
   (op-map "wire_parameter"
           (str "Connect a parameter to a card so the widget actually filters it. Pass exactly one "
                "of `target_field`, `target_tag`, or `target`.")
           [[:parameter_id parameter-id-schema]
            [:dashcard_id dashcard-ref-schema]
            [:target_field {:optional true}
             [:maybe [:int {:description (str "Numeric field id to filter on. The usual choice: the "
                                              "server derives the mapping target from the card's query.")}]]]
            [:target_tag {:optional true}
             [:maybe [:string {:description "Name of a template tag, for a native-SQL card."}]]]
            [:target {:optional true}
             [:maybe [:sequential [:any {:description "Raw mapping-target clause. Advanced escape hatch; prefer target_field."}]]]]
            [:autowire {:optional true}
             [:maybe [:boolean {:description (str "With target_field, also map every other card on the "
                                                  "dashboard that exposes the same field. Cards that "
                                                  "do not expose it are skipped silently.")}]]]])
   (op-map "unwire_parameter" "Disconnect a parameter from one card, or from every card when `dashcard_id` is omitted."
           [[:parameter_id parameter-id-schema]
            [:dashcard_id {:optional true}
             [:maybe [:int {:description "Dashcard to disconnect. Omit to disconnect the parameter everywhere."}]]]])])

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
             [:int {:description "Numeric id of the collection to put it in."}]
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
   [:ops {:optional true}
    [:maybe [:sequential {:description "Editor operations, applied in order as one atomic save."} op-schema]]]])

(def ^:private dashboard-write-entry
  {:tool-name       "dashboard_write"
   :update-scope    metabot.scope/agent-dashboard-update
   :create-required [:name]})

;;; ------------------------------------------------- Handler ------------------------------------------------------

(def ^:private attribute-keys
  [:name :description :collection_id :collection_position :width :auto_apply_filters :cache_ttl :archived])

(defn- dashboard-attrs
  "The dashboard-level attributes in `body`, with `collection_id` resolved through the v2
   collection-reference convention."
  [body]
  (cond-> (select-keys body attribute-keys)
    (contains? body :collection_id)
    (assoc :collection_id (common/resolve-collection-id (:collection_id body)))))

(defn- compact-op
  "Strip null-valued keys from one op. Strict MCP clients send every declared property, filling
   the ones they do not set with null; the ops that distinguish absent from null — `move` and
   `duplicate_card` on `tab`, `move_parameter` on `index`/`dashcard_id`, `unwire_parameter` on
   `dashcard_id` — would otherwise read a filled-in null as a deliberate value."
  [op]
  (into {} (remove (comp nil? val)) op))

(defn- apply-ops!
  "Compile `ops` against `dash` and save, returning the projection row. With `validate-only?` the
   would-be row is built from the compiled payload instead and nothing is written."
  [dash ops attrs validate-only?]
  (let [ops     (mapv compact-op ops)
        cards   (fetch-cards (referenced-card-ids dash ops))
        _       (check-cards-exist! ops cards)
        payload (normalize-parameters (dashboard-ops/compile-ops dash ops cards))]
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
  "Create or update a dashboard, and edit its layout with ordered operations. method: \"create\" requires name;
  method: \"update\" requires id and accepts archived (true trashes, false restores — there is no hard delete).
  ops is an ordered list applied as one atomic save: nothing is written unless every op succeeds, so a failed
  call leaves the dashboard untouched and a retry cannot double-add. Give each new card or tab its own negative
  id (-1, -2, …); later ops in the same call reference it by that id, and the server assigns the real id on save.
  Ops: add_card, add_text, add_heading, add_link, add_iframe, add_action, duplicate_card, replace_card, move,
  resize, remove, set_series, patch_dashcard, add_tab, rename_tab, move_tab, duplicate_tab, remove_tab,
  add_parameter, update_parameter, remove_parameter, move_parameter, wire_parameter, unwire_parameter.
  Omit position to autoplace. patch_dashcard merges content only — use move, resize, replace_card, or set_series
  for layout and identity. Parameter ids are strings you choose. wire_parameter with autowire: true also maps
  every other card that exposes the same field. validate_only: true returns the layout the ops would produce
  without writing; it checks the ops and the resulting layout, but per-field parameter-mapping permission checks
  run only on the real save, so a clean dry run can still be rejected. Returns the resulting dashboard, so no
  follow-up read is needed. Requires write permission on the dashboard and read permission on every card
  referenced."
  {:name         "dashboard_write"
   :scope        metabot.scope/agent-dashboard-create
   :update-scope metabot.scope/agent-dashboard-update
   :args         dashboard-write-args-schema}
  [args {:keys [token-scopes]}]
  (let [dispatched (common/dispatch-write dashboard-write-entry token-scopes args)]
    (common/success-content
     (projections/project
      :dashboard :concise
      (case (first dispatched)
        :create
        (let [[_ body]       dispatched
              attrs          (dashboard-attrs body)
              ops            (:ops body)
              validate-only? (boolean (:validate_only body))]
          (when (contains? body :archived)
            (common/throw-teaching-error
             "`archived` applies to method \"update\" only — remove it from this create call."))
          (cond
            validate-only? (apply-ops! (blank-dashboard attrs) (or ops []) attrs true)
            (seq ops)      (apply-ops! (t2/hydrate (dashboards.write/create-dashboard! attrs)
                                                   [:dashcards :series :card] :tabs)
                                       ops {} false)
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
            :else          (saved-row (:id (dashboards.write/update-dashboard! (:id dash) attrs))))))))))
