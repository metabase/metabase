(ns metabase.metabot.toolkit.dashboard-op-schema
  "The schema of one dashboard editor op, shared by every tool that sends ops to
   [[metabase.metabot.toolkit.dashboard-ops/compile-ops]].
   The descriptions are written for the model, and each tool puts [[op-schema]] in its own argument schema."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:private position-schema
  [:map {:closed true :description "Grid slot; omit to autoplace."}
   [:row [:int {:min 0 :description "Zero-based row."}]]
   [:col [:int {:min 0 :max 23 :description "Zero-based column; the grid is 24 wide."}]]])

(def ^:private size-schema
  [:map {:closed true :description "Size in grid cells."}
   [:size_x [:int {:min 1 :max 24 :description "Width in columns (grid is 24 wide)."}]]
   [:size_y [:int {:min 1 :description "Height in rows."}]]])

(def ^:private new-id-schema
  [:int {:max -1
         :description "Negative id you choose for the new row (-1, -2, …); later ops may reference it."}])

(def ^:private tab-ref-schema
  [:maybe [:int {:description "Tab id; negative ids from this call work. Omit when the dashboard has no tabs."}]])

(def ^:private inline-parameters-schema
  [:maybe [:sequential [:string {:description "Parameter id to render on this card, not the header."}]]])

(def ^:private dashcard-ref-schema
  [:int {:description "Dashcard id; negative ids from this call work."}])

(def ^:private parameter-id-schema
  [:string {:min 1 :description "Parameter id — a short string you choose and reuse in later ops."}])

;; `add_parameter` and `update_parameter` write REST parameter properties straight through, so the
;; camelCase names (`isMultiSelect`, `filteringParameters`, `sectionId`) are preserved verbatim.
(def ^:private parameter-name-schema
  [:string {:min 1 :description "Label shown on the dashboard."}])

;; `:name` is required on `add_parameter` and optional on `update_parameter`, so it is not in
;; `parameter-fields` — each op supplies its own entry.
(def ^:private parameter-fields
  [[:type {:optional true}
    [:maybe [:string {:description (str "Parameter type, e.g. \"string/=\", \"string/contains\", "
                                        "\"number/=\", \"number/between\", \"date/all-options\", "
                                        "\"date/relative\", \"id\", \"temporal-unit\".")}]]]
   [:sectionId {:optional true}
    [:maybe [:string {:description "Widget section, e.g. \"string\", \"number\", \"date\", \"id\"."}]]]
   [:default {:optional true}
    [:maybe [:any {:description "Default value: a scalar, or an array for multi-select."}]]]
   [:required {:optional true}
    [:maybe [:boolean {:description "When true the dashboard needs a value to view; pair with a default."}]]]
   [:isMultiSelect {:optional true}
    [:maybe [:boolean {:description "Whether the widget accepts several values."}]]]
   [:temporal_units {:optional true}
    [:maybe [:sequential [:string {:description "Allowed unit for a \"temporal-unit\" parameter, e.g. \"month\"."}]]]]
   [:values_query_type {:optional true}
    [:maybe [:enum {:description "Value picker behavior: dropdown list, search box, or free text."}
             "list" "search" "none"]]]
   [:values_source_type {:optional true}
    [:maybe [:enum {:description "Picker value source; omit to use the connected field's values."}
             "static-list" "card"]]]
   [:values_source_config {:optional true}
    [:maybe [:map {:description (str "Config for values_source_type: {\"values\": [...]} for "
                                     "static-list, or {\"card_id\": n, \"value_field\": target} for card.")}]]]
   [:filteringParameters {:optional true}
    [:maybe [:sequential [:string {:description "Id of a parameter whose value narrows this one (linked filter)."}]]]]])

(defn- op-map
  "One closed op entry for [[op-schema]]: the `op` discriminator plus `fields`."
  [op-name description fields]
  [op-name
   (into [:map {:closed true :description description}
          [:op [:= op-name]]]
         fields)])

(def ^:private op-multi
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
           (str "Copy a dashcard with its card, visualization settings, and parameter mappings; "
                "same size, its own slot.")
           [[:id new-id-schema]
            [:dashcard_id dashcard-ref-schema]
            [:tab {:optional true} tab-ref-schema]
            [:position {:optional true} [:maybe position-schema]]])
   (op-map "replace_card"
           (str "Point a dashcard at a different card, keeping slot and size; series, parameter "
                "mappings, and visualization settings reset, as the editor does.")
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
                "column settings, a link card's target. Layout/identity keys (row, col, size_x, "
                "size_y, dashboard_tab_id, card_id, action_id, series, id) are rejected; use move, "
                "resize, replace_card, or set_series.")
           [[:dashcard_id dashcard-ref-schema]
            [:patch
             ;; Open, so a layout or unknown key reaches the compiler, which names the op that owns it.
             [:map {:description (str "Dashcard properties to merge; `visualization_settings` "
                                      "merges key by key rather than replacing the map.")}
              [:visualization_settings {:optional true}
               [:maybe [:map {:description "Visualization settings to merge into the dashcard's own."}]]]
              [:parameter_mappings {:optional true}
               [:maybe [:sequential [:map {:closed      true
                                           :description "A parameter mapping, replacing the dashcard's list."}
                                     [:parameter_id [:string {:min 1}]]
                                     [:card_id {:optional true}
                                      [:maybe [:int {:min         1
                                                     :description "Card it filters, of this dashcard or its series."}]]]
                                     [:target [:sequential :any]]]]]]
              [:inline_parameters {:optional true} inline-parameters-schema]]]])
   (op-map "add_tab" (str "Add a tab. Existing cards are adopted only when the save ends with "
                          "exactly one tab; adding several at once leaves them orphaned — `move` "
                          "them onto a tab in the same call.")
           [[:id new-id-schema]
            [:name [:string {:min 1 :description "Tab label."}]]])
   (op-map "rename_tab" "Rename an existing tab."
           [[:tab_id [:int {:description "Id of the tab to rename (negative ids from this call work)."}]]
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
           (into [[:parameter_id parameter-id-schema]
                  [:name parameter-name-schema]]
                 parameter-fields))
   (op-map "update_parameter"
           (str "Change properties of an existing parameter. Only the properties you pass change; "
                "the rest are left alone. Passing null does not clear a property — it is treated as "
                "omitted — so to remove one, name it in `clear`.")
           (into [[:parameter_id parameter-id-schema]
                  [:name {:optional true} [:maybe parameter-name-schema]]
                  [:clear {:optional true}
                   [:maybe [:sequential
                            [:enum {:description (str "Property names to remove from this parameter "
                                                      "(default, filteringParameters, "
                                                      "values_source_config, values_source_type, "
                                                      "sectionId, temporal_units). Null cannot say this: "
                                                      "strict clients fill every unset property with "
                                                      "null, so nulls are treated as omitted.")}
                             "default" "filteringParameters" "values_source_config"
                             "values_source_type" "sectionId" "temporal_units"]]]]]
                 parameter-fields))
   (op-map "remove_parameter"
           (str "Delete a parameter with its card mappings, inline placements, and linked-filter "
                "references; dependent subscriptions are archived and their owners emailed.")
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
             [:maybe [:int {:description (str "Numeric field id to filter on — the usual choice; the "
                                              "server derives the mapping from the card's query.")}]]]
            [:target_tag {:optional true}
             [:maybe [:string {:description (str "Template tag name on a native-SQL card; the server "
                                                 "derives the mapping from the tag's type (field filter "
                                                 "vs raw variable).")}]]]
            [:target {:optional true}
             [:maybe [:sequential [:any {:description (str "Raw mapping-target clause, e.g. "
                                                           "[\"dimension\", [\"template-tag\", \"category\"]] or "
                                                           "[\"text-tag\", \"name\"] for a {{name}} placeholder in a "
                                                           "text/heading/iframe card. Advanced; prefer target_field.")}]]]]
            [:autowire {:optional true}
             [:maybe [:boolean {:description (str "With target_field, also map every other card exposing "
                                                  "the same field; cards that don't are skipped silently.")}]]]])
   (op-map "unwire_parameter" "Disconnect a parameter from one card, or from every card when `dashcard_id` is omitted."
           [[:parameter_id parameter-id-schema]
            [:dashcard_id {:optional true}
             [:maybe [:int {:description "Dashcard to disconnect. Omit to disconnect the parameter everywhere."}]]]])])

(def op-schema
  "One editor op: a `:multi` on `:op`, with a closed map for each op the compiler applies.
   An op whose `op` is missing or unknown fails with a message listing the valid ones."
  ;; Malli's default for a bad dispatch value is "invalid dispatch value", which leaves the model guessing. The list
  ;; comes from the children, so it can't drift from them. Errors inside a known op keep their own messages.
  (let [[tag props & children] op-multi]
    (into [tag (assoc props :error/message (str "should be one of: " (str/join ", " (map first children))))]
          children)))
