(ns metabase.mcp.v2.dashboard-ops
  "The pure core of the `dashboard_write` tool: fold an ordered list of editor operations over a
   hydrated dashboard and return the payload
   [[metabase.dashboards.write/update-dashboard!]] saves — `{:dashcards :tabs :parameters}`.

   No I/O. Everything the ops need about cards, tables, or fields is resolved by the caller and
   passed in, which is what lets `validate_only` reuse this untouched and lets the whole op
   grammar be tested against plain maps.

   New dashcards and tabs carry caller-supplied negative ids, the same temp-id convention the
   frontend editor sends to `PUT /api/dashboard/:id`: `u/row-diff` treats them as creates, and
   `do-update-tabs!` rewrites each dashcard's `dashboard_tab_id` once the real tab rows exist.

   Op methods validate, then compose the row primitives in the State algebra section; those
   primitives are the only code that touches the `:dashcards`/`:tabs`/`:parameters` vectors."
  (:require
   [clojure.string :as str]
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.skills :as skills]
   [metabase.parameters.mapping-targets :as mapping-targets]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn op-error!
  "Throw a teaching error attributing `message` to the op at `idx` (0-based, as sent)."
  [idx message]
  (common/throw-teaching-error (format "op %d (%s" idx message)))

;; No local size table: `autoplace`'s `[cards display-type]` arity already merges
;; `dashboards.constants/default-card-size` with the per-display entry in `card-size-defaults`,
;; which covers :heading (full-width × 1), :text, :link, :iframe, and :action. That table is kept
;; in sync with the frontend grid; a second copy here would drift.

;;; ------------------------------------------------- State --------------------------------------------------------

(defn- init-state
  "Working state for the fold: dashcards/tabs/parameters as vectors in save order, plus the
   caller-supplied `{card-id card}` map. Card metadata rides in state rather than being fetched,
   which is what keeps this namespace pure — it is needed for a new card's default size and,
   later, for parameter wiring."
  [current cards]
  {:dashcards  (vec (:dashcards current))
   :tabs       (vec (:tabs current))
   :parameters (vec (:parameters current))
   ::cards     cards})

(defn- card-display
  "The display type keyword driving a new dashcard's default size; `:table` when the card is
   unknown, which only affects the default and never correctness."
  [state card-id]
  (keyword (or (:display (get (::cards state) card-id)) "table")))

;;; --------------------------------------------- State algebra ----------------------------------------------------

;;; `coll` is one of the three collection keys — :dashcards, :tabs, :parameters — each a vector of
;;; :id-keyed maps in save order. These primitives are the only functions that write those keys;
;;; op methods validate, then compose them.

(defn- find-row
  "The row in `(get state coll)` whose `:id` is `id`, or nil."
  [state coll id]
  (first (filter #(= id (:id %)) (get state coll))))

(defn- insert-row
  "Append `row` to `(get state coll)`, preserving save order."
  [state coll row]
  (update state coll conj row))

(defn- update-row
  "Replace the row with `id` by `(f row)`; every other row and the order are untouched."
  [state coll id f]
  (update state coll (partial mapv #(if (= id (:id %)) (f %) %))))

(defn- remove-row
  "Drop the row with `id`, preserving the order of the rest."
  [state coll id]
  (update state coll (partial filterv #(not= id (:id %)))))

(defn- move-row
  "Move the row with `id` so it sits at `index` among the remaining rows; nil when `index` falls
   outside `[0, count-after-removal]`."
  [state coll id index]
  (let [row   (find-row state coll id)
        rest* (filterv #(not= id (:id %)) (get state coll))]
    (when (<= 0 index (count rest*))
      (assoc state coll (vec (concat (subvec rest* 0 index) [row] (subvec rest* index)))))))

(defn- map-rows
  "Replace every row by `(f row)`, order preserved."
  [state coll f]
  (update state coll (partial mapv f)))

(defn- check-new-id!
  "A new dashcard or tab id must be negative and unused in this batch."
  [state idx id kind]
  (when-not (and (integer? id) (neg? id))
    (op-error! idx (format "%s): `id` must be a negative integer — negative ids mark rows to create."
                           kind)))
  (when (some #(= id (:id %)) (concat (:dashcards state) (:tabs state)))
    (op-error! idx (format "%s): id %d is already used in this batch — give each new row its own negative id."
                           kind id))))

(defn- resolve-dashcard!
  "The existing dashcard `id` names, or a teaching error."
  [state idx id]
  (or (find-row state :dashcards id)
      (op-error! idx (format "%s): no dashcard with id %s on this dashboard."
                             "dashcard_id" id))))

(defn- check-tab-id!
  "A dashcard's target tab must be one of this dashboard's tabs — including a tab added earlier in
   this batch under its negative id. nil means no tab, which stays legal. `op-name` names the op in
   the teaching error."
  [state idx op-name tab-id]
  (when (and (some? tab-id) (not (find-row state :tabs tab-id)))
    (op-error! idx (format "%s): no tab with id %s on this dashboard." op-name tab-id))))

;;; ---------------------------------------------- Placement -------------------------------------------------------

(defn- placement
  "The `{:row :col :size_x :size_y}` for a new dashcard of `display-type` (a keyword such as
   `:table`, `:heading`, `:iframe`). Explicit `position`/`size` win; an omitted size comes from
   the display type's default and an omitted position autoplaces against the cards already on
   the target tab."
  [state {:keys [position size]} tab-id display-type]
  (let [siblings   (filterv #(= tab-id (:dashboard_tab_id %)) (:dashcards state))
        ;; The display's default size, from `dashboards.constants` via the 2-arity. Resolved
        ;; against no siblings so it always yields a size — the search below can come up empty on
        ;; a full tab, and the default size must not vanish with it.
        default    (autoplace/get-position-for-new-dashcard [] display-type)
        size_x     (or (:size_x size) (:size_x default))
        size_y     (or (:size_y size) (:size_y default))]
    (if position
      {:row (:row position) :col (:col position) :size_x size_x :size_y size_y}
      ;; Re-run placement at the caller's size — the default-size slot may not fit it.
      (let [placed (autoplace/get-position-for-new-dashcard
                    siblings size_x size_y autoplace/default-grid-width)]
        (when-not placed
          (common/throw-teaching-error
           "No free space on this tab for another card — remove or resize something first."))
        {:row (:row placed) :col (:col placed) :size_x size_x :size_y size_y}))))

;;; ---------------------------------------------- Domain helpers --------------------------------------------------

(defn- upsert-mapping
  "Add or replace `dc`'s parameter mapping for `parameter-id`, pointing at `target`. `:card_id`
   comes from the dashcard — nil for a virtual card, which is what a `[:text-tag …]` mapping stores."
  [dc parameter-id target]
  (update dc :parameter_mappings
          (fn [ms]
            (conj (filterv #(not= parameter-id (:parameter_id %)) (vec ms))
                  {:parameter_id parameter-id
                   :card_id      (:card_id dc)
                   :target       target}))))

(defn- drop-mapping
  "Remove `dc`'s parameter mapping for `parameter-id`. An absent, nil, or empty
   `:parameter_mappings` is left exactly as it was — writing the key, or rewriting a legacy
   nil as [], would make an untouched dashcard register as changed in `update-dashboard!`'s
   row diff."
  [dc parameter-id]
  (cond-> dc
    (seq (:parameter_mappings dc))
    (update :parameter_mappings (partial filterv #(not= parameter-id (:parameter_id %))))))

(defn- add-inline-parameter
  "Place `parameter-id` inline on `dc`; adding an id already present is a no-op."
  [dc parameter-id]
  (update dc :inline_parameters
          (fn [ps] (vec (distinct (conj (vec ps) parameter-id))))))

(defn- drop-inline-parameter
  "Remove `parameter-id` from `dc`'s inline placements. An absent, nil, or empty
   `:inline_parameters` is left exactly as it was, for the same row-diff reason as
   [[drop-mapping]]."
  [dc parameter-id]
  (cond-> dc
    (seq (:inline_parameters dc))
    (update :inline_parameters (partial filterv #(not= parameter-id %)))))

(defn- clear-inline-parameters
  "Drop every inline placement from `dc`, leaving the key absent. Exactly one dashcard may place a
   given parameter: `cleanup-orphaned-inline-parameters!` deletes the parameter from the dashboard
   as soon as any dashcard placing it is deleted, so a second claimant takes the first one's filter
   down with it."
  [dc]
  (dissoc dc :inline_parameters))

(defn- insert-dashcard
  "Insert a new dashcard: check `(:id op)` is a fresh negative id, place it on
   `(:dashboard_tab_id base)` — a tab on this dashboard — honoring `op`'s position/size with
   `display`'s default size, and append `base` merged with the placement."
  [state idx op base display]
  (check-new-id! state idx (:id op) (:op op))
  (check-tab-id! state idx (:op op) (:dashboard_tab_id base))
  (insert-row state :dashcards
              (merge base (placement state op (:dashboard_tab_id base) display))))

;;; ------------------------------------------------- Ops ----------------------------------------------------------

(defmulti ^:private apply-op
  "Apply one op to the working state. Dispatches on the op's `:op` string."
  {:arglists '([state idx op])}
  (fn [_state _idx op] (:op op)))

(defmethod apply-op :default
  [_state idx op]
  (op-error! idx (format "%s): unknown op — see the tool description for the supported list."
                         (pr-str (:op op)))))

(defmethod apply-op "add_card"
  [state idx {:keys [id card_id tab series inline_parameters] :as op}]
  (insert-dashcard state idx op
                   (merge {:id                 id
                           :card_id            card_id
                           :dashboard_tab_id   tab
                           :parameter_mappings []}
                          (when (seq series) {:series (mapv (fn [cid] {:id cid}) series)})
                          (when (seq inline_parameters) {:inline_parameters (vec inline_parameters)}))
                   (card-display state card_id)))

;;; ---------------------------------------------- Virtual dashcards -------------------------------------------------

(defn- virtual-dashcard
  "A dashcard with no backing card. `display` is the virtual display type and `extras` its
   display-specific settings, both handed to [[dashboard-card/virtual-card-settings]] so this
   compiler and the frontend agree on the shape."
  [state idx op display extras]
  (insert-dashcard state idx op
                   (merge {:id                     (:id op)
                           :dashboard_tab_id       (:tab op)
                           :parameter_mappings     []
                           :visualization_settings (dashboard-card/virtual-card-settings display extras)}
                          (when (seq (:inline_parameters op))
                            {:inline_parameters (vec (:inline_parameters op))}))
                   (keyword display)))

(defmethod apply-op "add_text"
  [state idx {:keys [markdown] :as op}]
  (virtual-dashcard state idx op "text" {:text markdown}))

(defmethod apply-op "add_heading"
  [state idx {:keys [text] :as op}]
  (virtual-dashcard state idx op "heading" {:text text}))

(defmethod apply-op "add_link"
  [state idx {:keys [url entity] :as op}]
  (when (= (some? url) (some? entity))
    (op-error! idx "add_link): pass exactly one of `url` or `entity`."))
  (virtual-dashcard state idx op "link"
                    {:link (if url
                             {:url url}
                             {:entity {:model (:type entity) :id (:id entity)}})}))

(defmethod apply-op "add_iframe"
  [state idx {:keys [src] :as op}]
  (virtual-dashcard state idx op "iframe" {:iframe src}))

(defmethod apply-op "add_action"
  [state idx {:keys [id action_id label display] :as op}]
  (insert-dashcard state idx op
                   {:id                 id
                    :action_id          action_id
                    :dashboard_tab_id   (:tab op)
                    :parameter_mappings []
                    :visualization_settings
                    (cond-> {:actionDisplayType (or display "button")}
                      label (assoc "button.label" label))}
                   :action))

(defmethod apply-op "duplicate_card"
  [state idx {:keys [id dashcard_id tab] :as op}]
  ;; also checked inside insert-dashcard; the explicit call keeps a bad new id reported ahead of a
  ;; bad source dashcard
  (check-new-id! state idx id "duplicate_card")
  (let [source (resolve-dashcard! state idx dashcard_id)
        tab-id (if (contains? op :tab) tab (:dashboard_tab_id source))]
    ;; The clone keeps its wiring but not the placement, so the filter stays on the card the user
    ;; put it on. The editor instead mints a fresh copy of each inline parameter; this grammar has
    ;; `add_parameter` + `move_parameter` for that, so cloning one implicitly would be an
    ;; unrequested dashboard-level edit under an id the caller never chose.
    (insert-dashcard state idx
                     (assoc op :size {:size_x (:size_x source) :size_y (:size_y source)})
                     (-> source
                         (dissoc :id :row :col :size_x :size_y :dashboard_tab_id
                                 :created_at :updated_at :card :entity_id)
                         clear-inline-parameters
                         (merge {:id id :dashboard_tab_id tab-id}))
                     (card-display state (:card_id source)))))

;;; ------------------------------------------------- Edit ops ------------------------------------------------------

(def ^:private patch-rejected-keys
  "Layout and identity keys `patch_dashcard` refuses, mapped to the op that owns them. A patch is a
   content merge; silently dropping one would let a caller believe a move or replace took effect.
   `:id` has no owning op — it is caught generically by the [[patchable-keys]] allowlist."
  {:row              "move"
   :col              "move"
   :dashboard_tab_id "move"
   :size_x           "resize"
   :size_y           "resize"
   :card_id          "replace_card"
   :action_id        "replace_card"
   :series           "set_series"})

(def ^:private patchable-keys
  "The dashcard content keys a patch may carry. An existing dashcard's update allowlists these
   anyway, but a new (negative-id) dashcard is inserted with an open schema, so an unlisted key
   would reach the DB as a raw error — reject it here instead, symmetrically for both."
  #{:visualization_settings :parameter_mappings :inline_parameters})

(defmethod apply-op "replace_card"
  [state idx {:keys [dashcard_id card_id]}]
  (resolve-dashcard! state idx dashcard_id)
  (update-row state :dashcards dashcard_id
              ;; `:card` is the hydrated row of the card being replaced. Dropping it is what makes the dry
              ;; run honest: the projection prefers `:card` over `:card_id`, so leaving the old one would
              ;; report the replace as a no-op while the real save reads back the new card.
              #(-> (assoc % :card_id card_id
                          :series []
                          :parameter_mappings []
                          :visualization_settings {})
                   (dissoc :card))))

(defmethod apply-op "move"
  [state idx {:keys [dashcard_id tab position] :as op}]
  (let [dc     (resolve-dashcard! state idx dashcard_id)
        tab-id (if (contains? op :tab) tab (:dashboard_tab_id dc))]
    (when (contains? op :tab)
      (check-tab-id! state idx "move" tab))
    (update-row state :dashcards dashcard_id
                (fn [dc]
                  (merge dc
                         {:dashboard_tab_id tab-id}
                         (if position
                           {:row (:row position) :col (:col position)}
                           (select-keys (placement state
                                                   {:size (select-keys dc [:size_x :size_y])}
                                                   tab-id
                                                   :table)
                                        [:row :col])))))))

(defmethod apply-op "resize"
  [state idx {:keys [dashcard_id size]}]
  (resolve-dashcard! state idx dashcard_id)
  (update-row state :dashcards dashcard_id #(merge % (select-keys size [:size_x :size_y]))))

(defmethod apply-op "remove"
  [state idx {:keys [dashcard_id]}]
  (resolve-dashcard! state idx dashcard_id)
  (remove-row state :dashcards dashcard_id))

(defmethod apply-op "set_series"
  [state idx {:keys [dashcard_id card_ids]}]
  (resolve-dashcard! state idx dashcard_id)
  (update-row state :dashcards dashcard_id #(assoc % :series (mapv (fn [cid] {:id cid}) card_ids))))

(defmethod apply-op "patch_dashcard"
  [state idx {:keys [dashcard_id patch]}]
  (resolve-dashcard! state idx dashcard_id)
  (doseq [k (keys patch)]
    (cond
      (contains? patch-rejected-keys k)
      (op-error! idx (format "patch_dashcard): `%s` is not patchable — use the `%s` op."
                             (name k) (get patch-rejected-keys k)))

      (not (contains? patchable-keys k))
      (op-error! idx (format "patch_dashcard): `%s` is not a patchable property." (name k)))))
  (update-row state :dashcards dashcard_id
              (fn [dc]
                (cond-> (merge dc (dissoc patch :visualization_settings))
                  (contains? patch :visualization_settings)
                  (update :visualization_settings merge (:visualization_settings patch))))))

;;; -------------------------------------------------- Tab ops ------------------------------------------------------

(defn- resolve-tab!
  [state idx id]
  (or (find-row state :tabs id)
      (op-error! idx (format "tab_id): no tab with id %s on this dashboard." id))))

(defn- next-temp-id
  "A negative id not yet used by any dashcard or tab in the working state. Ops that clone a whole
   tab mint ids for the copies rather than making the caller enumerate them."
  [state]
  (dec (reduce min 0 (map :id (concat (:dashcards state) (:tabs state))))))

(defmethod apply-op "add_tab"
  [state idx {:keys [id name]}]
  (check-new-id! state idx id "add_tab")
  (insert-row state :tabs {:id id :name name}))

(defmethod apply-op "rename_tab"
  [state idx {:keys [tab_id name]}]
  (resolve-tab! state idx tab_id)
  (update-row state :tabs tab_id #(assoc % :name name)))

(defmethod apply-op "move_tab"
  [state idx {:keys [tab_id index]}]
  (resolve-tab! state idx tab_id)
  (or (move-row state :tabs tab_id index)
      (op-error! idx (format "move_tab): index %d is out of range — this dashboard has %d tabs."
                             index (count (:tabs state))))))

(defmethod apply-op "duplicate_tab"
  [state idx {:keys [id tab_id]}]
  (check-new-id! state idx id "duplicate_tab")
  (let [source (resolve-tab! state idx tab_id)
        cards  (filterv #(= tab_id (:dashboard_tab_id %)) (:dashcards state))
        state  (insert-row state :tabs {:id id :name (:name source)})]
    (reduce (fn [st card]
              (insert-row st :dashcards
                          (-> card
                              (dissoc :created_at :updated_at :card)
                              clear-inline-parameters
                              (assoc :id (next-temp-id st)
                                     :dashboard_tab_id id))))
            state
            cards)))

(defmethod apply-op "remove_tab"
  [state idx {:keys [tab_id]}]
  (resolve-tab! state idx tab_id)
  (let [doomed (map :id (filter #(= tab_id (:dashboard_tab_id %)) (:dashcards state)))]
    (reduce (fn [st dc-id] (remove-row st :dashcards dc-id))
            (remove-row state :tabs tab_id)
            doomed)))

(defn- check-tab-coverage!
  "`update-dashboard!` requires every dashcard to name a tab once a dashboard has more than one —
   with exactly one tab it back-fills a nil `dashboard_tab_id` itself — and its own error is
   opaque. Reject the 2+ tab case here, naming the offending cards."
  [{:keys [tabs dashcards] :as state}]
  (when (< 1 (count tabs))
    (when-let [orphans (not-empty (filterv #(nil? (:dashboard_tab_id %)) dashcards))]
      (common/throw-teaching-error
       (format (str "This dashboard has tabs, so every card must belong to a tab: %s have none. "
                    "Pass `tab` on the add op, or use `move` with `tab` for cards already placed.")
               (pr-str (mapv :id orphans))))))
  state)

;;; --------------------------------------------- Parameter ops -----------------------------------------------------

(defn- resolve-parameter!
  [state idx id]
  (or (find-row state :parameters id)
      (op-error! idx (format "parameter_id): no parameter with id %s on this dashboard." (pr-str id)))))

(defn- card-for-dashcard
  [state dashcard]
  (get (::cards state) (:card_id dashcard)))

(defn- assoc-slug
  "Derive `:slug` from a parameter's name, as the editor's `setParameterName` does. Without it a
   parameter this tool creates is not addressable by slug — embedding, public links, and URL param
   sync all key on the slug — so a parameter that works in the editor would half-work here."
  [param]
  (cond-> param
    (:name param) (assoc :slug (u/slugify (:name param)))))

(defmethod apply-op "add_parameter"
  [state idx {:keys [parameter_id] :as op}]
  (when (find-row state :parameters parameter_id)
    (op-error! idx (format "add_parameter): parameter %s already exists — use `update_parameter`."
                           (pr-str parameter_id))))
  (insert-row state :parameters
              (-> (dissoc op :op :parameter_id)
                  (assoc :id parameter_id)
                  assoc-slug)))

(defmethod apply-op "update_parameter"
  [state idx {:keys [parameter_id clear] :as op}]
  (resolve-parameter! state idx parameter_id)
  (let [cleared (map keyword clear)]
    (doseq [field cleared
            :when (contains? op field)]
      (op-error! idx (format "update_parameter): `%s` is both set and cleared — pass one or the other."
                             (name field))))
    (update-row state :parameters parameter_id
                (fn [param]
                  ;; A parameter is a map, so clearing removes the key rather than setting it to
                  ;; nil — `merge` can only add, and a stored explicit null is not the same as an
                  ;; absent property to the REST shape.
                  (cond-> (apply dissoc
                                 (merge param (dissoc op :op :parameter_id :clear))
                                 cleared)
                    ;; only re-slug on a rename, so an unrelated edit can't rewrite the slug of a
                    ;; parameter created in the editor and break its existing URLs
                    (contains? op :name) assoc-slug)))))

(defmethod apply-op "remove_parameter"
  [state idx {:keys [parameter_id]}]
  (resolve-parameter! state idx parameter_id)
  (-> state
      (remove-row :parameters parameter_id)
      (map-rows :parameters
                (fn [p]
                  (cond-> p
                    (contains? p :filteringParameters)
                    (update :filteringParameters (partial filterv #(not= parameter_id %))))))
      (map-rows :dashcards
                (fn [dc]
                  (-> dc
                      (drop-inline-parameter parameter_id)
                      (drop-mapping parameter_id))))))

(defmethod apply-op "move_parameter"
  [state idx {:keys [parameter_id index dashcard_id] :as op}]
  (resolve-parameter! state idx parameter_id)
  (cond
    (contains? op :dashcard_id)
    (do (resolve-dashcard! state idx dashcard_id)
        (map-rows state :dashcards
                  (fn [dc]
                    (if (= dashcard_id (:id dc))
                      (add-inline-parameter dc parameter_id)
                      (drop-inline-parameter dc parameter_id)))))

    (contains? op :index)
    (or (move-row state :parameters parameter_id index)
        (op-error! idx (format "move_parameter): index %d is out of range — this dashboard has %d parameters."
                               index (count (:parameters state)))))

    :else
    (op-error! idx "move_parameter): pass `index` to reorder the header, or `dashcard_id` to place it on a card.")))

(defn- wire-one
  "Add or replace `parameter`'s mapping on `dashcard`. Returns the dashcard unchanged when its card
   exposes no target for `field-id`."
  [state idx parameter dashcard field-id explicit?]
  (let [card   (card-for-dashcard state dashcard)
        target (when card (mapping-targets/target-for-field card parameter field-id))]
    (cond
      target
      (upsert-mapping dashcard (:id parameter) target)

      explicit?
      (op-error! idx (format (str "wire_parameter): dashcard %s does not expose field %s for parameter %s. "
                                  "Read the dashboard with get_content to see each card's columns.")
                             (:id dashcard) field-id (pr-str (:id parameter))))

      :else dashcard)))

(defn- wire-card!
  "The card behind the dashcard a wire op targets, or a teaching error — a virtual dashcard (text,
   heading, link, iframe) has no query, so only a `[:text-tag …]` target (handled before this) can
   wire it."
  [state idx dashcard]
  (or (card-for-dashcard state dashcard)
      (op-error! idx (format (str "wire_parameter): dashcard %s has no card behind it — only a raw "
                                  "`target` of [\"text-tag\", \"<name>\"] can wire a text, heading, "
                                  "or iframe card's own {{placeholder}}.")
                             (:id dashcard)))))

(defn- tag-target!
  "The mapping target for `target_tag` on `dashcard`'s card — `[:dimension [:template-tag …]]` for a
   field-filter or temporal-unit tag, `[:variable …]` for a raw variable, derived from the tag's actual
   type so the caller never has to know the distinction. A tag that doesn't exist on the card, or that
   can't back a parameter (snippet/card reference tags), is a teaching error naming the tags that do."
  [state idx dashcard target-tag]
  (let [card      (wire-card! state idx dashcard)
        tag-types (mapping-targets/template-tag-types card)
        tag-type  (get tag-types target-tag)]
    (cond
      (nil? tag-type)
      (op-error! idx (format "wire_parameter): card %s has no template tag named %s.%s %s"
                             (:card_id dashcard) (pr-str target-tag)
                             (if (seq tag-types)
                               (str " Its tags: " (str/join ", " (sort (keys tag-types))) ".")
                               (str " It has no template tags — `target_tag` wires a native-SQL "
                                    "card's tags; for an MBQL card pass `target_field`."))
                             skills/wire-target-grammar))

      :else
      (or (mapping-targets/target-for-tag target-tag tag-type)
          (op-error! idx (format (str "wire_parameter): {{%s}} is a %s-reference tag — it splices SQL "
                                      "text and cannot take a parameter value. Wireable tags on this "
                                      "card: %s.")
                                 target-tag (name tag-type)
                                 (or (->> tag-types
                                          (filter (fn [[nm t]] (mapping-targets/target-for-tag nm t)))
                                          (map key)
                                          sort
                                          (str/join ", ")
                                          not-empty)
                                     "none")))))))

(defn- coerce-target
  "Keywordize the clause heads of a raw JSON `target` — `[\"dimension\", [\"template-tag\", \"x\"]]`
   arrives as strings throughout, and the mapping schema wants keyword heads. Only position 0 of each
   nested vector is a head; every other element (tag names, column names, ids, options maps) is data
   and passes through untouched."
  [x]
  (if (and (sequential? x) (string? (first x)))
    (into [(keyword (first x))] (map coerce-target) (rest x))
    x))

(defn- text-tag-names
  "The `{{tag}}` placeholder names a dashcard's own content carries — a text or heading card's
   markdown, an iframe card's embed — which are what a `[:text-tag …]` target can bind. Empty for
   every other dashcard."
  [dashcard]
  (let [vs     (:visualization_settings dashcard)
        source (case (u/qualified-name (get-in vs [:virtual_card :display] ""))
                 ("text" "heading") (:text vs)
                 "iframe"           (:iframe vs)
                 nil)]
    (if (string? source)
      (into #{} (map :name) (lib/recognize-template-tags source))
      #{})))

(defn- check-text-tag-target!
  "A `[:text-tag <name>]` target binds a `{{name}}` placeholder in a virtual dashcard's own
   content, so it is validated against the dashcard, not a card — which text, heading, and iframe
   dashcards don't have."
  [idx dashcard [_ tag-name :as target]]
  (let [names (text-tag-names dashcard)]
    (when-not (contains? names tag-name)
      (op-error! idx (format (str "wire_parameter): target %s resolves to nothing on dashcard %s — a "
                                  "text-tag target binds a {{tag}} placeholder in a text, heading, or "
                                  "iframe card's own content%s")
                             (pr-str target) (:id dashcard)
                             (if (seq names)
                               (str "; this card's placeholders: " (str/join ", " (sort names)) ".")
                               ", and this dashcard carries none."))))))

(defn- checked-raw-target!
  "Coerce a raw `target` clause and verify it resolves to something the dashcard actually exposes
   for `parameter` — a wire whose target resolves to nothing saves cleanly and renders as
   \"unknown field\", which no teaching error would ever catch. A `[:text-tag …]` target resolves
   against the dashcard's own content; everything else against its card."
  [state idx parameter dashcard target]
  (let [target (coerce-target (vec target))]
    (if (= :text-tag (first target))
      (check-text-tag-target! idx dashcard target)
      (let [card (wire-card! state idx dashcard)]
        (when-not (mapping-targets/wireable-target? card parameter target)
          (op-error! idx (format (str "wire_parameter): target %s resolves to nothing on card %s — the "
                                      "card exposes no matching column or template tag for parameter "
                                      "%s. Read the card with get_content to see its columns and "
                                      "template tags. %s")
                                 (pr-str target) (:card_id dashcard) (pr-str (:id parameter))
                                 skills/wire-target-grammar)))))
    target))

(defn- wire-target
  "Replace `parameter`'s mapping on the dashcard `dashcard-id` with `target`."
  [state dashcard-id parameter-id target]
  (update-row state :dashcards dashcard-id #(upsert-mapping % parameter-id target)))

(defmethod apply-op "wire_parameter"
  [state idx {:keys [parameter_id dashcard_id target_field target_tag target autowire]}]
  (let [parameter (resolve-parameter! state idx parameter_id)
        dashcard  (resolve-dashcard! state idx dashcard_id)]
    (cond
      target
      (wire-target state dashcard_id parameter_id
                   (checked-raw-target! state idx parameter dashcard target))

      target_tag
      (wire-target state dashcard_id parameter_id
                   (tag-target! state idx dashcard target_tag))

      target_field
      (let [state (update-row state :dashcards dashcard_id
                              #(wire-one state idx parameter % target_field true))]
        (if autowire
          (map-rows state :dashcards
                    #(if (= dashcard_id (:id %))
                       %
                       (wire-one state idx parameter % target_field false)))
          state))

      :else
      (op-error! idx (str "wire_parameter): pass one of `target_field`, `target_tag`, or `target`. "
                          skills/wire-target-grammar)))))

(defmethod apply-op "unwire_parameter"
  [state idx {:keys [parameter_id dashcard_id] :as op}]
  (resolve-parameter! state idx parameter_id)
  (when (contains? op :dashcard_id)
    (resolve-dashcard! state idx dashcard_id))
  (map-rows state :dashcards
            (fn [dc]
              (if (or (not (contains? op :dashcard_id)) (= dashcard_id (:id dc)))
                (drop-mapping dc parameter_id)
                dc))))

;;; ------------------------------------------------ Entry ---------------------------------------------------------

(defn compile-ops
  "Fold `ops` over `current` (a dashboard hydrated with `[:dashcards :series :card] :tabs`) and
   return `{:dashcards :tabs :parameters}` — the full-replacement payload `update-dashboard!`
   saves. New rows carry the caller's negative ids. `cards` maps every card id the ops may touch
   to its card row; this namespace does no I/O, so the caller resolves that. Throws a teaching
   error naming the op index on any invalid op."
  ([current ops] (compile-ops current ops {}))
  ([current ops cards]
   (-> (reduce-kv (fn [state idx op] (apply-op state idx op))
                  (init-state current cards)
                  (vec ops))
       check-tab-coverage!
       (select-keys [:dashcards :tabs :parameters]))))
