(ns metabase.metabot.toolkit.dashboard-ops
  "The pure core of the dashboard write tools: fold an ordered list of editor operations over a
   hydrated dashboard and return the payload
   [[metabase.dashboards.write/update-dashboard!]] saves — `{:dashcards :tabs :parameters}`.

   No I/O. Everything the ops need about cards, tables, or fields is resolved by the caller and
   passed in, which is what lets a dry run reuse this untouched and lets the whole op grammar be
   tested against plain maps.

   New dashcards and tabs carry caller-supplied negative ids, the same temp-id convention the
   frontend editor sends to `PUT /api/dashboard/:id`: `u/row-diff` treats them as creates, and
   `do-update-tabs!` rewrites each dashcard's `dashboard_tab_id` once the real tab rows exist.

   Op methods validate, then compose the row primitives in the State algebra section; those
   primitives are the only code that touches the `:dashcards`/`:tabs`/`:parameters` vectors.

   An invalid op throws an `ex-info` whose data holds an error code from [[errors]] under `::error`, the values that
   explain it, and the failing op's `:op-index` and `:op`.
   This namespace words no errors: each tool turns that data into text for its own model."
  (:require
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.lib.core :as lib]
   [metabase.parameters.mapping-targets :as mapping-targets]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Errors -------------------------------------------------------

(def errors
  "Every error code [[compile-ops]] throws, mapped to the keys of the data that come with it.
   Errors thrown while applying an op also carry `:op-index` (0-based, as sent) and `:op` (the op name as sent, or nil).
   The `:cards-without-tab` check runs after the last op, so that error carries neither."
  {:missing-op                         #{}
   :unknown-op                         #{}
   :invalid-new-id                     #{:id}
   :duplicate-new-id                   #{:id}
   :missing-dashcard-id                #{}
   :unknown-dashcard                   #{:dashcard-id}
   :missing-tab-id                     #{}
   :unknown-tab                        #{:tab-id}
   :no-free-space                      #{:tab-id}
   :link-needs-url-or-entity           #{}
   :unpatchable-key                    #{:key :use-op}
   :unknown-patch-key                  #{:key}
   :tab-index-out-of-range             #{:index :tab-count}
   :cards-without-tab                  #{:dashcard-ids}
   :missing-parameter-id               #{}
   :unknown-parameter                  #{:parameter-id}
   :parameter-exists                   #{:parameter-id}
   :set-and-cleared                    #{:field}
   :conflicting-parameter-destinations #{}
   :missing-parameter-destination      #{}
   :parameter-index-out-of-range       #{:index :parameter-count}
   :field-not-exposed                  #{:dashcard-id :field-id :parameter-id}
   :no-card-behind-dashcard            #{:dashcard-id}
   :unknown-template-tag               #{:card-id :tag :tags}
   :unwireable-tag                     #{:tag :tag-type :wireable-tags}
   :unknown-text-tag                   #{:target :dashcard-id :placeholders}
   :unresolved-target                  #{:target :card-id :parameter-id}
   :missing-wire-target                #{}})

(defn- fail!
  "Throw the error `code` from [[errors]], with `data` holding the values that explain it."
  ([code] (fail! code nil))
  ([code data]
   (assert (contains? errors code) (str "Unknown dashboard op error code " code))
   (throw (ex-info (str "Invalid dashboard op: " (name code))
                   (assoc data ::error code)))))

(defn error-data
  "The data of `e` when it is an invalid-op error from [[compile-ops]], else nil.
   The error code is under `::error`, and [[errors]] lists the rest."
  [e]
  (let [data (ex-data e)]
    (when (::error data)
      data)))

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
  [state id]
  (when-not (and (integer? id) (neg? id))
    (fail! :invalid-new-id {:id id}))
  (when (some #(= id (:id %)) (concat (:dashcards state) (:tabs state)))
    (fail! :duplicate-new-id {:id id})))

(defn- resolve-dashcard!
  "The existing dashcard `id` names, or an error."
  [state id]
  (if (nil? id)
    (fail! :missing-dashcard-id)
    (or (find-row state :dashcards id)
        (fail! :unknown-dashcard {:dashcard-id id}))))

(defn- check-tab-id!
  "A dashcard's target tab must be one of this dashboard's tabs — including a tab added earlier in
   this batch under its negative id. nil means no tab, which stays legal."
  [state tab-id]
  (when (and (some? tab-id) (not (find-row state :tabs tab-id)))
    (fail! :unknown-tab {:tab-id tab-id})))

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
          (fail! :no-free-space {:tab-id tab-id}))
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
  [state op base display]
  (check-new-id! state (:id op))
  (check-tab-id! state (:dashboard_tab_id base))
  (insert-row state :dashcards
              (merge base (placement state op (:dashboard_tab_id base) display))))

;;; ------------------------------------------------- Ops ----------------------------------------------------------

(defmulti ^:private apply-op
  "Apply one op to the working state. Dispatches on the op's `:op` string."
  {:arglists '([state op])}
  (fn [_state op] (:op op)))

(defmethod apply-op :default
  [_state op]
  (if (nil? (:op op))
    (fail! :missing-op)
    (fail! :unknown-op)))

(defmethod apply-op "add_card"
  [state {:keys [id card_id tab series inline_parameters] :as op}]
  (insert-dashcard state op
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
  [state op display extras]
  (insert-dashcard state op
                   (merge {:id                     (:id op)
                           :dashboard_tab_id       (:tab op)
                           :parameter_mappings     []
                           :visualization_settings (dashboard-card/virtual-card-settings display extras)}
                          (when (seq (:inline_parameters op))
                            {:inline_parameters (vec (:inline_parameters op))}))
                   (keyword display)))

(defmethod apply-op "add_text"
  [state {:keys [markdown] :as op}]
  (virtual-dashcard state op "text" {:text markdown}))

(defmethod apply-op "add_heading"
  [state {:keys [text] :as op}]
  (virtual-dashcard state op "heading" {:text text}))

(defmethod apply-op "add_link"
  [state {:keys [url entity] :as op}]
  (when (= (some? url) (some? entity))
    (fail! :link-needs-url-or-entity))
  (virtual-dashcard state op "link"
                    {:link (if url
                             {:url url}
                             {:entity {:model (:type entity) :id (:id entity)}})}))

(defmethod apply-op "add_iframe"
  [state {:keys [src] :as op}]
  (virtual-dashcard state op "iframe" {:iframe src}))

(defmethod apply-op "add_action"
  [state {:keys [id action_id label display] :as op}]
  (insert-dashcard state op
                   {:id                 id
                    :action_id          action_id
                    :dashboard_tab_id   (:tab op)
                    :parameter_mappings []
                    ;; the frontend keys off `:virtual_card` to recognize an action dashcard, so an
                    ;; action carries the same wrapper as the other card-less dashcards
                    :visualization_settings
                    (dashboard-card/virtual-card-settings
                     "action"
                     (cond-> {:actionDisplayType (or display "button")}
                       label (assoc "button.label" label)))}
                   :action))

(defmethod apply-op "duplicate_card"
  [state {:keys [id dashcard_id tab] :as op}]
  ;; also checked inside insert-dashcard; the explicit call keeps a bad new id reported ahead of a
  ;; bad source dashcard
  (check-new-id! state id)
  (let [source (resolve-dashcard! state dashcard_id)
        tab-id (if (contains? op :tab) tab (:dashboard_tab_id source))]
    ;; The clone keeps its wiring but not the placement, so the filter stays on the card the user
    ;; put it on. The editor instead mints a fresh copy of each inline parameter; this grammar has
    ;; `add_parameter` + `move_parameter` for that, so cloning one implicitly would be an
    ;; unrequested dashboard-level edit under an id the caller never chose.
    (insert-dashcard state
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
  [state {:keys [dashcard_id card_id]}]
  (resolve-dashcard! state dashcard_id)
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
  [state {:keys [dashcard_id tab position] :as op}]
  (let [dc     (resolve-dashcard! state dashcard_id)
        tab-id (if (contains? op :tab) tab (:dashboard_tab_id dc))]
    (when (contains? op :tab)
      (check-tab-id! state tab))
    (update-row state :dashcards dashcard_id
                (fn [dc]
                  (merge dc
                         {:dashboard_tab_id tab-id}
                         (if position
                           {:row (:row position) :col (:col position)}
                           ;; autoplace against the other cards on the tab: the card being moved is
                           ;; not its own sibling, or the search can never return the slot it holds
                           (select-keys (placement (update state :dashcards
                                                           (partial filterv #(not= dashcard_id (:id %))))
                                                   {:size (select-keys dc [:size_x :size_y])}
                                                   tab-id
                                                   :table)
                                        [:row :col])))))))

(defmethod apply-op "resize"
  [state {:keys [dashcard_id size]}]
  (resolve-dashcard! state dashcard_id)
  (update-row state :dashcards dashcard_id #(merge % (select-keys size [:size_x :size_y]))))

(defmethod apply-op "remove"
  [state {:keys [dashcard_id]}]
  (resolve-dashcard! state dashcard_id)
  (remove-row state :dashcards dashcard_id))

(defmethod apply-op "set_series"
  [state {:keys [dashcard_id card_ids]}]
  (resolve-dashcard! state dashcard_id)
  (update-row state :dashcards dashcard_id #(assoc % :series (mapv (fn [cid] {:id cid}) card_ids))))

(defn- coerce-target
  "Keywordize the clause heads of a raw JSON `target` — `[\"dimension\", [\"template-tag\", \"x\"]]`
   arrives as strings throughout, and the mapping schema wants keyword heads. Only position 0 of each
   nested vector is a head; every other element (tag names, column names, ids, options maps) is data
   and passes through untouched."
  [x]
  (if (and (sequential? x) (string? (first x)))
    (into [(keyword (first x))] (map coerce-target) (rest x))
    x))

(defmethod apply-op "patch_dashcard"
  [state {:keys [dashcard_id patch]}]
  (resolve-dashcard! state dashcard_id)
  (doseq [k (keys patch)]
    (cond
      (contains? patch-rejected-keys k)
      (fail! :unpatchable-key {:key (name k), :use-op (get patch-rejected-keys k)})

      (not (contains? patchable-keys k))
      (fail! :unknown-patch-key {:key (name k)})))
  (update-row state :dashcards dashcard_id
              (fn [dc]
                (cond-> (merge dc (dissoc patch :visualization_settings))
                  (contains? patch :visualization_settings)
                  (update :visualization_settings merge (:visualization_settings patch))

                  ;; A patched mapping arrives as raw JSON, so its target's clause heads are strings
                  ;; ("dimension", "field") where the mapping schema wants keywords — the same coercion
                  ;; `wire_parameter` does. Without it every parameter_mappings patch, a key this op
                  ;; advertises as patchable, fails validation with "should be :dimension".
                  (contains? patch :parameter_mappings)
                  (update :parameter_mappings
                          (partial mapv #(cond-> % (:target %) (update :target (comp coerce-target vec)))))))))

;;; -------------------------------------------------- Tab ops ------------------------------------------------------

(defn- resolve-tab!
  [state id]
  (if (nil? id)
    (fail! :missing-tab-id)
    (or (find-row state :tabs id)
        (fail! :unknown-tab {:tab-id id}))))

(defn- next-temp-id
  "A negative id not yet used by any dashcard or tab in the working state. Ops that clone a whole
   tab mint ids for the copies rather than making the caller enumerate them."
  [state]
  (dec (reduce min 0 (map :id (concat (:dashcards state) (:tabs state))))))

(defmethod apply-op "add_tab"
  [state {:keys [id name]}]
  (check-new-id! state id)
  (insert-row state :tabs {:id id :name name}))

(defmethod apply-op "rename_tab"
  [state {:keys [tab_id name]}]
  (resolve-tab! state tab_id)
  (update-row state :tabs tab_id #(assoc % :name name)))

(defmethod apply-op "move_tab"
  [state {:keys [tab_id index]}]
  (resolve-tab! state tab_id)
  (or (move-row state :tabs tab_id index)
      (fail! :tab-index-out-of-range {:index index, :tab-count (count (:tabs state))})))

(defmethod apply-op "duplicate_tab"
  [state {:keys [id tab_id]}]
  (check-new-id! state id)
  (let [source (resolve-tab! state tab_id)
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
  [state {:keys [tab_id]}]
  (resolve-tab! state tab_id)
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
      (fail! :cards-without-tab {:dashcard-ids (mapv :id orphans)})))
  state)

;;; --------------------------------------------- Parameter ops -----------------------------------------------------

(defn- resolve-parameter!
  [state id]
  (if (nil? id)
    (fail! :missing-parameter-id)
    (or (find-row state :parameters id)
        (fail! :unknown-parameter {:parameter-id id}))))

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
  [state {:keys [parameter_id] :as op}]
  (when (find-row state :parameters parameter_id)
    (fail! :parameter-exists {:parameter-id parameter_id}))
  (insert-row state :parameters
              (-> (dissoc op :op :parameter_id)
                  (assoc :id parameter_id)
                  assoc-slug)))

(defmethod apply-op "update_parameter"
  [state {:keys [parameter_id clear] :as op}]
  (resolve-parameter! state parameter_id)
  (let [cleared (map keyword clear)]
    (doseq [field cleared
            :when (contains? op field)]
      (fail! :set-and-cleared {:field (name field)}))
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
  [state {:keys [parameter_id]}]
  (resolve-parameter! state parameter_id)
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
  [state {:keys [parameter_id index dashcard_id] :as op}]
  (resolve-parameter! state parameter_id)
  (when (and (contains? op :index) (contains? op :dashcard_id))
    (fail! :conflicting-parameter-destinations))
  (cond
    (contains? op :dashcard_id)
    (do (resolve-dashcard! state dashcard_id)
        (map-rows state :dashcards
                  (fn [dc]
                    (if (= dashcard_id (:id dc))
                      (add-inline-parameter dc parameter_id)
                      (drop-inline-parameter dc parameter_id)))))

    (contains? op :index)
    (or (move-row state :parameters parameter_id index)
        (fail! :parameter-index-out-of-range {:index index, :parameter-count (count (:parameters state))}))

    :else
    (fail! :missing-parameter-destination)))

(defn- wire-one
  "Add or replace `parameter`'s mapping on `dashcard`. Returns the dashcard unchanged when its card
   exposes no target for `field-id`, unless `explicit?`, when that is an error."
  [state parameter dashcard field-id explicit?]
  (let [card   (card-for-dashcard state dashcard)
        target (when card (mapping-targets/target-for-field card parameter field-id))]
    (cond
      target
      (upsert-mapping dashcard (:id parameter) target)

      explicit?
      (fail! :field-not-exposed {:dashcard-id  (:id dashcard)
                                 :field-id     field-id
                                 :parameter-id (:id parameter)})

      :else dashcard)))

(defn- wire-card!
  "The card behind the dashcard a wire op targets, or an error — a virtual dashcard (text, heading,
   link, iframe) has no query, so only a `[:text-tag …]` target (handled before this) can wire it."
  [state dashcard]
  (or (card-for-dashcard state dashcard)
      (fail! :no-card-behind-dashcard {:dashcard-id (:id dashcard)})))

(defn- tag-target!
  "The mapping target for `target_tag` on `dashcard`'s card — `[:dimension [:template-tag …]]` for a
   field-filter or temporal-unit tag, `[:variable …]` for a raw variable, derived from the tag's actual
   type so the caller never has to know the distinction. A tag that doesn't exist on the card, or that
   can't back a parameter (snippet/card reference tags), is an error naming the tags that do."
  [state dashcard target-tag]
  (let [card      (wire-card! state dashcard)
        tag-types (mapping-targets/template-tag-types card)
        tag-type  (get tag-types target-tag)]
    (cond
      (nil? tag-type)
      (fail! :unknown-template-tag {:card-id (:card_id dashcard)
                                    :tag     target-tag
                                    :tags    (vec (sort (keys tag-types)))})

      :else
      (or (mapping-targets/target-for-tag target-tag tag-type)
          (fail! :unwireable-tag {:tag           target-tag
                                  :tag-type      (name tag-type)
                                  :wireable-tags (->> tag-types
                                                      (filter (fn [[nm t]] (mapping-targets/target-for-tag nm t)))
                                                      (map key)
                                                      sort
                                                      vec)})))))

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
  [dashcard [_ tag-name :as target]]
  (let [names (text-tag-names dashcard)]
    (when-not (contains? names tag-name)
      (fail! :unknown-text-tag {:target       target
                                :dashcard-id  (:id dashcard)
                                :placeholders (vec (sort names))}))))

(defn- checked-raw-target!
  "Coerce a raw `target` clause and verify it resolves to something the dashcard actually exposes
   for `parameter` — a wire whose target resolves to nothing saves cleanly and renders as
   \"unknown field\", which no error would ever catch. A `[:text-tag …]` target resolves against
   the dashcard's own content; everything else against its card."
  [state parameter dashcard target]
  (let [target (coerce-target (vec target))]
    (if (= :text-tag (first target))
      (check-text-tag-target! dashcard target)
      (let [card (wire-card! state dashcard)]
        (when-not (mapping-targets/wireable-target? card parameter target)
          (fail! :unresolved-target {:target       target
                                     :card-id      (:card_id dashcard)
                                     :parameter-id (:id parameter)}))))
    target))

(defn- wire-target
  "Replace `parameter`'s mapping on the dashcard `dashcard-id` with `target`."
  [state dashcard-id parameter-id target]
  (update-row state :dashcards dashcard-id #(upsert-mapping % parameter-id target)))

(defmethod apply-op "wire_parameter"
  [state {:keys [parameter_id dashcard_id target_field target_tag target autowire]}]
  (let [parameter (resolve-parameter! state parameter_id)
        dashcard  (resolve-dashcard! state dashcard_id)]
    (cond
      target
      (wire-target state dashcard_id parameter_id
                   (checked-raw-target! state parameter dashcard target))

      target_tag
      (wire-target state dashcard_id parameter_id
                   (tag-target! state dashcard target_tag))

      target_field
      (let [state (update-row state :dashcards dashcard_id
                              #(wire-one state parameter % target_field true))]
        (if autowire
          (map-rows state :dashcards
                    #(if (= dashcard_id (:id %))
                       %
                       (wire-one state parameter % target_field false)))
          state))

      :else
      (fail! :missing-wire-target))))

(defmethod apply-op "unwire_parameter"
  [state {:keys [parameter_id dashcard_id] :as op}]
  (resolve-parameter! state parameter_id)
  (when (contains? op :dashcard_id)
    (resolve-dashcard! state dashcard_id))
  (map-rows state :dashcards
            (fn [dc]
              (if (or (not (contains? op :dashcard_id)) (= dashcard_id (:id dc)))
                (drop-mapping dc parameter_id)
                dc))))

;;; ------------------------------------------------ Entry ---------------------------------------------------------

(defn- apply-op-at
  "[[apply-op]] for `op`, the op at `idx`, adding `:op-index` and `:op` to any error it throws."
  [state idx op]
  (try
    (apply-op state op)
    (catch clojure.lang.ExceptionInfo e
      (throw (if-let [data (error-data e)]
               (ex-info (ex-message e) (assoc data :op-index idx :op (:op op)) e)
               e)))))

(defn compile-ops
  "Fold `ops` over `current` (a dashboard hydrated with `[:dashcards :series :card] :tabs`) and
   return `{:dashcards :tabs :parameters}` — the full-replacement payload `update-dashboard!`
   saves. New rows carry the caller's negative ids. `cards` maps every card id the ops may touch
   to its card row; this namespace does no I/O, so the caller resolves that. Throws an error from
   [[errors]] on the first invalid op; read it with [[error-data]]."
  ([current ops] (compile-ops current ops {}))
  ([current ops cards]
   (-> (reduce-kv apply-op-at
                  (init-state current cards)
                  (vec ops))
       check-tab-coverage!
       (select-keys [:dashcards :tabs :parameters]))))
