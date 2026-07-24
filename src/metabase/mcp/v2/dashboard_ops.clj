(ns metabase.mcp.v2.dashboard-ops
  "The pure core of the `dashboard_write` tool: fold an ordered list of editor operations over a
   hydrated dashboard and return the payload
   [[metabase.dashboards.write/update-dashboard!]] saves — `{:dashcards :tabs :parameters}`.

   No I/O. Everything the ops need about cards, tables, or fields is resolved by the caller and
   passed in, which is what lets `validate_only` reuse this untouched and lets the whole op
   grammar be tested against plain maps.

   New dashcards and tabs carry caller-supplied negative ids, the same temp-id convention the
   frontend editor sends to `PUT /api/dashboard/:id`: `u/row-diff` treats them as creates, and
   `do-update-tabs!` rewrites each dashcard's `dashboard_tab_id` once the real tab rows exist."
  (:require
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.mcp.v2.common :as common]
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

(defn- find-dashcard
  [state id]
  (first (filter #(= id (:id %)) (:dashcards state))))

(defn- update-dashcard
  "Replace the dashcard with `id` by `(f dashcard)`, preserving order."
  [state id f]
  (update state :dashcards (partial mapv #(if (= id (:id %)) (f %) %))))

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
  (or (find-dashcard state id)
      (op-error! idx (format "%s): no dashcard with id %s on this dashboard."
                             "dashcard_id" id))))

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
  (check-new-id! state idx id "add_card")
  (update state :dashcards conj
          (merge {:id                 id
                  :card_id            card_id
                  :dashboard_tab_id   tab
                  :parameter_mappings []}
                 (placement state op tab (card-display state card_id))
                 (when (seq series) {:series (mapv (fn [cid] {:id cid}) series)})
                 (when (seq inline_parameters) {:inline_parameters (vec inline_parameters)}))))

;;; ---------------------------------------------- Virtual dashcards -------------------------------------------------

(defn- virtual-dashcard
  "A dashcard with no backing card. `display` is the virtual display type and `extras` its
   display-specific settings, both handed to [[dashboard-card/virtual-card-settings]] so this
   compiler and the frontend agree on the shape."
  [state idx op display extras]
  (check-new-id! state idx (:id op) (:op op))
  (update state :dashcards conj
          (merge {:id                     (:id op)
                  :dashboard_tab_id       (:tab op)
                  :parameter_mappings     []
                  :visualization_settings (dashboard-card/virtual-card-settings display extras)}
                 (placement state op (:tab op) (keyword display))
                 (when (seq (:inline_parameters op))
                   {:inline_parameters (vec (:inline_parameters op))}))))

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
  (check-new-id! state idx id "add_action")
  (update state :dashcards conj
          (merge {:id                 id
                  :action_id          action_id
                  :dashboard_tab_id   (:tab op)
                  :parameter_mappings []
                  :visualization_settings
                  (cond-> {:actionDisplayType (or display "button")}
                    label (assoc "button.label" label))}
                 (placement state op (:tab op) :action))))

(defmethod apply-op "duplicate_card"
  [state idx {:keys [id dashcard_id tab] :as op}]
  (check-new-id! state idx id "duplicate_card")
  (let [source (resolve-dashcard! state idx dashcard_id)
        tab-id (if (contains? op :tab) tab (:dashboard_tab_id source))]
    (update state :dashcards conj
            (merge (dissoc source :id :row :col :size_x :size_y :dashboard_tab_id
                           :created_at :updated_at :card :entity_id)
                   {:id id :dashboard_tab_id tab-id}
                   (placement state
                              (assoc op :size {:size_x (:size_x source) :size_y (:size_y source)})
                              tab-id
                              (card-display state (:card_id source)))))))

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
  (update-dashcard state dashcard_id
                   #(assoc % :card_id card_id
                           :series []
                           :parameter_mappings []
                           :visualization_settings {})))

(defmethod apply-op "move"
  [state idx {:keys [dashcard_id tab position] :as op}]
  (let [dc     (resolve-dashcard! state idx dashcard_id)
        tab-id (if (contains? op :tab) tab (:dashboard_tab_id dc))]
    (when (and (contains? op :tab) (some? tab) (not-any? #(= tab (:id %)) (:tabs state)))
      (op-error! idx (format "move): no tab with id %s on this dashboard." tab)))
    (update-dashcard state dashcard_id
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
  (update-dashcard state dashcard_id #(merge % (select-keys size [:size_x :size_y]))))

(defmethod apply-op "remove"
  [state idx {:keys [dashcard_id]}]
  (resolve-dashcard! state idx dashcard_id)
  (update state :dashcards (partial filterv #(not= dashcard_id (:id %)))))

(defmethod apply-op "set_series"
  [state idx {:keys [dashcard_id card_ids]}]
  (resolve-dashcard! state idx dashcard_id)
  (update-dashcard state dashcard_id #(assoc % :series (mapv (fn [cid] {:id cid}) card_ids))))

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
  (update-dashcard state dashcard_id
                   (fn [dc]
                     (cond-> (merge dc (dissoc patch :visualization_settings))
                       (contains? patch :visualization_settings)
                       (update :visualization_settings merge (:visualization_settings patch))))))

;;; -------------------------------------------------- Tab ops ------------------------------------------------------

(defn- resolve-tab!
  [state idx id]
  (or (first (filter #(= id (:id %)) (:tabs state)))
      (op-error! idx (format "tab_id): no tab with id %s on this dashboard." id))))

(defn- next-temp-id
  "A negative id not yet used by any dashcard or tab in the working state. Ops that clone a whole
   tab mint ids for the copies rather than making the caller enumerate them."
  [state]
  (dec (reduce min 0 (map :id (concat (:dashcards state) (:tabs state))))))

(defmethod apply-op "add_tab"
  [state idx {:keys [id name]}]
  (check-new-id! state idx id "add_tab")
  (update state :tabs conj {:id id :name name}))

(defmethod apply-op "rename_tab"
  [state idx {:keys [tab_id name]}]
  (resolve-tab! state idx tab_id)
  (update state :tabs (partial mapv #(if (= tab_id (:id %)) (assoc % :name name) %))))

(defmethod apply-op "move_tab"
  [state idx {:keys [tab_id index]}]
  (let [tab   (resolve-tab! state idx tab_id)
        rest* (filterv #(not= tab_id (:id %)) (:tabs state))]
    (when-not (<= 0 index (count rest*))
      (op-error! idx (format "move_tab): index %d is out of range — this dashboard has %d tabs."
                             index (count (:tabs state)))))
    (assoc state :tabs (vec (concat (subvec rest* 0 index) [tab] (subvec rest* index))))))

(defmethod apply-op "duplicate_tab"
  [state idx {:keys [id tab_id]}]
  (check-new-id! state idx id "duplicate_tab")
  (let [source (resolve-tab! state idx tab_id)
        cards  (filterv #(= tab_id (:dashboard_tab_id %)) (:dashcards state))
        state  (update state :tabs conj {:id id :name (:name source)})]
    (reduce (fn [st card]
              (update st :dashcards conj
                      (assoc (dissoc card :created_at :updated_at :card)
                             :id (next-temp-id st)
                             :dashboard_tab_id id)))
            state
            cards)))

(defmethod apply-op "remove_tab"
  [state idx {:keys [tab_id]}]
  (resolve-tab! state idx tab_id)
  (-> state
      (update :tabs (partial filterv #(not= tab_id (:id %))))
      (update :dashcards (partial filterv #(not= tab_id (:dashboard_tab_id %))))))

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
  (or (first (filter #(= id (:id %)) (:parameters state)))
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
  (when (some #(= parameter_id (:id %)) (:parameters state))
    (op-error! idx (format "add_parameter): parameter %s already exists — use `update_parameter`."
                           (pr-str parameter_id))))
  (update state :parameters conj
          (-> (dissoc op :op :parameter_id)
              (assoc :id parameter_id)
              assoc-slug)))

(defmethod apply-op "update_parameter"
  [state idx {:keys [parameter_id] :as op}]
  (resolve-parameter! state idx parameter_id)
  (update state :parameters
          (partial mapv #(if (= parameter_id (:id %))
                           ;; only re-slug on a rename, so an unrelated edit can't rewrite the
                           ;; slug of a parameter created in the editor and break its existing URLs
                           (cond-> (merge % (dissoc op :op :parameter_id))
                             (contains? op :name) assoc-slug)
                           %))))

(defmethod apply-op "remove_parameter"
  [state idx {:keys [parameter_id]}]
  (resolve-parameter! state idx parameter_id)
  (-> state
      (update :parameters
              (fn [params]
                (->> params
                     (filterv #(not= parameter_id (:id %)))
                     (mapv (fn [p]
                             (cond-> p
                               (contains? p :filteringParameters)
                               (update :filteringParameters
                                       (partial filterv #(not= parameter_id %)))))))))
      (update :dashcards
              (partial mapv
                       (fn [dc]
                         (cond-> dc
                           (contains? dc :inline_parameters)
                           (update :inline_parameters (partial filterv #(not= parameter_id %)))

                           (contains? dc :parameter_mappings)
                           (update :parameter_mappings
                                   (partial filterv #(not= parameter_id (:parameter_id %))))))))))

(defmethod apply-op "move_parameter"
  [state idx {:keys [parameter_id index dashcard_id] :as op}]
  (let [param (resolve-parameter! state idx parameter_id)]
    (cond
      (contains? op :dashcard_id)
      (do (resolve-dashcard! state idx dashcard_id)
          (update state :dashcards
                  (partial mapv
                           (fn [dc]
                             (if (= dashcard_id (:id dc))
                               (update dc :inline_parameters
                                       (fn [ps] (vec (distinct (conj (vec ps) parameter_id)))))
                               (update dc :inline_parameters
                                       (fn [ps] (when ps (filterv #(not= parameter_id %) ps)))))))))

      (contains? op :index)
      (let [rest* (filterv #(not= parameter_id (:id %)) (:parameters state))]
        (when-not (<= 0 index (count rest*))
          (op-error! idx (format "move_parameter): index %d is out of range — this dashboard has %d parameters."
                                 index (count (:parameters state)))))
        (assoc state :parameters
               (vec (concat (subvec rest* 0 index) [param] (subvec rest* index)))))

      :else
      (op-error! idx "move_parameter): pass `index` to reorder the header, or `dashcard_id` to place it on a card."))))

(defn- wire-one
  "Add or replace `parameter`'s mapping on `dashcard`. Returns the dashcard unchanged when its card
   exposes no target for `field-id`."
  [state idx parameter dashcard field-id explicit?]
  (let [card   (card-for-dashcard state dashcard)
        target (when card (mapping-targets/target-for-field card parameter field-id))]
    (cond
      target
      (update dashcard :parameter_mappings
              (fn [ms]
                (conj (filterv #(not= (:id parameter) (:parameter_id %)) (vec ms))
                      {:parameter_id (:id parameter)
                       :card_id      (:card_id dashcard)
                       :target       target})))

      explicit?
      (op-error! idx (format (str "wire_parameter): dashcard %s does not expose field %s for parameter %s. "
                                  "Read the dashboard with get_content to see each card's columns.")
                             (:id dashcard) field-id (pr-str (:id parameter))))

      :else dashcard)))

(defmethod apply-op "wire_parameter"
  [state idx {:keys [parameter_id dashcard_id target_field target_tag target autowire]}]
  (let [parameter (resolve-parameter! state idx parameter_id)]
    (resolve-dashcard! state idx dashcard_id)
    (cond
      target
      (update-dashcard state dashcard_id
                       (fn [dc]
                         (update dc :parameter_mappings
                                 (fn [ms]
                                   (conj (filterv #(not= parameter_id (:parameter_id %)) (vec ms))
                                         {:parameter_id parameter_id :card_id (:card_id dc) :target target})))))

      target_tag
      (update-dashcard state dashcard_id
                       (fn [dc]
                         (update dc :parameter_mappings
                                 (fn [ms]
                                   (conj (filterv #(not= parameter_id (:parameter_id %)) (vec ms))
                                         {:parameter_id parameter_id
                                          :card_id      (:card_id dc)
                                          :target       [:variable [:template-tag target_tag]]})))))

      target_field
      (let [state (update state :dashcards
                          (partial mapv #(if (= dashcard_id (:id %))
                                           (wire-one state idx parameter % target_field true)
                                           %)))]
        (if autowire
          (update state :dashcards
                  (partial mapv #(if (= dashcard_id (:id %))
                                   %
                                   (wire-one state idx parameter % target_field false))))
          state))

      :else
      (op-error! idx "wire_parameter): pass one of `target_field`, `target_tag`, or `target`."))))

(defmethod apply-op "unwire_parameter"
  [state idx {:keys [parameter_id dashcard_id] :as op}]
  (resolve-parameter! state idx parameter_id)
  (when (contains? op :dashcard_id)
    (resolve-dashcard! state idx dashcard_id))
  (update state :dashcards
          (partial mapv
                   (fn [dc]
                     (if (or (not (contains? op :dashcard_id)) (= dashcard_id (:id dc)))
                       (update dc :parameter_mappings
                               (fn [ms] (filterv #(not= parameter_id (:parameter_id %)) (vec ms))))
                       dc)))))

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
