(ns metabase.agent-api.dashboard-write
  "The v2 `dashboard_write` tool: build and edit a dashboard through an ordered list of named ops.

   **Why ops rather than a document.** A dashboard's save is a full-set replace — `PUT /api/dashboard/:id` takes
   the whole layout, and a dashcard the body omits is deleted. Handing that contract to a model means making it
   echo back state it did not author, and read-modify-write through a context window is where both the tokens and
   the mistakes are: the dashcard it forgets to repeat is the dashcard it deletes. So the *server* holds the
   current state, the call names only the change it wants, and this namespace compiles the two into the one write
   the app makes. An op list cannot delete what it does not mention.

   **What an op carries that a patch cannot.** `move` validates the target tab and re-places the card on it;
   `add_card` finds a free slot on the 24-column grid; `remove_tab` takes the tab's cards with it. That is intent,
   and intent is what lets the server get the geometry right without the model computing it. Structure goes
   through ops; *content* — a visualization's settings, a click behavior, a link's target — goes through
   `patch_dashcard`, which merges into the dashcard's visualization settings and refuses the layout keys, naming
   the op that owns each. One way to do each thing.

   **The compile is all-or-nothing.** Ops validate in order against a state the compiler carries, and a bad op
   aborts the whole call naming its index — nothing is written, so there is no half-applied layout to reason about
   and re-sending a list that failed cannot double-add the cards that were fine. `validate_only` stops here and
   answers with the layout the ops would have produced.

   The write itself is the app's own: [[metabase.dashboards.write]] is what `POST /api/dashboard`
   and `PUT /api/dashboard/:id` call, so a tool call passes the checks a browser save passes — write permission on
   the dashboard, read permission on every card placed, data permission on the tables a mapping reaches — and it
   cannot pass fewer of them by coming in through this door."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.tools :as tools]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.dashboards.constants :as dashboard.constants]
   [metabase.dashboards.read :as dashboards.read]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.parameters.mapping :as parameters.mapping]
   [metabase.parameters.shared :as parameters.shared]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def card-ops
  "The ops that act on the cards of a dashboard."
  ["add_card" "add_text" "add_heading" "add_link" "add_iframe" "add_action"
   "duplicate_card" "replace_card" "move" "resize" "remove" "set_series" "patch_dashcard"])

(def tab-ops
  "The ops that act on the tabs of a dashboard."
  ["add_tab" "rename_tab" "move_tab" "duplicate_tab" "remove_tab"])

(def parameter-ops
  "The ops that act on the filters of a dashboard, and on what they filter."
  ["add_parameter" "update_parameter" "remove_parameter" "move_parameter" "wire_parameter" "unwire_parameter"])

(def ops
  "Every op `dashboard_write` takes."
  (-> card-ops (into tab-ops) (into parameter-ops)))

(def action-displays
  "How an action dashcard offers itself: a button that opens the form, or the form laid out on the dashboard."
  ["button" "form"])

(def ^:private layout-keys
  "The keys `patch_dashcard` refuses, and the op that owns each. A patch that moved a card would be a second way to
   move a card, and the second way is the one that skips the tab check and the grid."
  {:row              "`move`"
   :col              "`move`"
   :size_x           "`resize`"
   :size_y           "`resize`"
   :dashboard_tab_id "`move`, with `tab`"
   :card_id          "`replace_card`"
   :id               "the op's own `dashcard_id`"})

(def ^:private DashboardParams
  "The arguments [[dashboard-write]] contracts on. `POST /v2/dashboard-write` declares the wire schema, with the
   enums a client is held to; this is the looser shape the domain function accepts."
  [:map
   [:method              :string]
   [:id                  {:optional true} [:maybe [:or :int :string]]]
   [:name                {:optional true} [:maybe :string]]
   [:description         {:optional true} [:maybe :string]]
   [:collection_id       {:optional true} [:maybe [:or :int :string]]]
   [:collection_position {:optional true} [:maybe :int]]
   [:width               {:optional true} [:maybe :string]]
   [:auto_apply_filters  {:optional true} [:maybe :boolean]]
   [:cache_ttl           {:optional true} [:maybe :int]]
   [:archived            {:optional true} [:maybe :boolean]]
   [:validate_only       {:optional true} [:maybe :boolean]]
   [:ops                 {:optional true} [:maybe [:sequential :map]]]])

;;; ──────────────────────────────────────────────────────────────────
;;; Errors, indexed by op
;;; ──────────────────────────────────────────────────────────────────
;;
;; An op list is one call, and a failure in it has to say *which* op failed: "add_card needs a card_id" leaves a
;; model looking through five identical-looking ops for the one that is wrong.

(def ^:private ^:dynamic *op-index*
  "The index of the op being compiled, so a failure raised deep inside the compile still names it."
  nil)

(defn- op-error!
  ([message] (op-error! message 400))
  ([message status]
   (tools/teaching-error!
    (if *op-index*
      (str "Op " *op-index* ": " message " Nothing was written — fix that op and send the whole list again.")
      message)
    status)))

(defn- required
  "The value of `k` on `op`, or a teaching error naming the op that needs it."
  [op k]
  (let [v (get op k)]
    (if (some? v)
      v
      (op-error! (str "`" (:op op) "` needs `" (name k) "`.")))))

(defn- one-of!
  "Exactly one of `ks`, or a teaching error. The op-indexed twin of [[metabase.agent-api.tools/check-exactly-one!]]."
  [op ks]
  (let [given (filterv #(some? (get op %)) ks)
        names (str/join " or " (map #(str "`" (name %) "`") ks))]
    (case (count given)
      0 (op-error! (str "`" (:op op) "` needs " names "."))
      1 (first given)
      (op-error! (str "`" (:op op) "` takes " names ", not both.")))))

;;; ──────────────────────────────────────────────────────────────────
;;; The state the compiler carries
;;; ──────────────────────────────────────────────────────────────────
;;
;; The dashboard as the ops have left it so far: its tabs in order, its dashcards, and the parameters it already
;; has — which is all an op may attach a filter widget to, parameters themselves being this tool's other half.
;;
;; A dashcard or tab the compiler creates gets a negative id, which is how the app's own save names a row that does
;; not exist yet: the save swaps it for the real one, and it resolves a dashcard's tab through the same table, so a
;; card can land on a tab this very call created.

(defn- state-dashcard
  "One of the dashboard's current dashcards, narrowed to what a save carries. The nested `card` rides along for the
   response's sake — the skeleton names the card a dashcard shows — and is dropped on the way into the save."
  [dashcard]
  (-> (select-keys dashcard [:id :card_id :dashboard_tab_id :row :col :size_x :size_y
                             :visualization_settings :parameter_mappings :inline_parameters :action_id :card])
      (assoc :series (mapv #(select-keys % [:id :name]) (:series dashcard)))))

(defn- initial-state
  [{:keys [id dashcards tabs parameters]}]
  {:dashboard-id id
   :tabs         (mapv #(select-keys % [:id :name]) tabs)
   :dashcards    (mapv state-dashcard dashcards)
   :parameters   (vec parameters)
   :next-temp-id -1})

(defn- temp-id
  "The next negative id, and the state that has spent it."
  [state]
  [(:next-temp-id state) (update state :next-temp-id dec)])

(defn- tab-cards
  [state tab-id]
  (filterv #(= tab-id (:dashboard_tab_id %)) (:dashcards state)))

(defn- dashcard
  "The dashcard `dashcard_id` names, or a teaching error. Only a dashcard already on the dashboard can be named: a
   dashcard this call is adding has no id to name it by yet, which is why an add takes its tab, position and size
   up front."
  [state dashcard-id]
  (or (m/find-first #(= dashcard-id (:id %)) (:dashcards state))
      (op-error! (str "This dashboard has no dashcard " (pr-str dashcard-id)
                      ". `get_content` on the dashboard lists its dashcards and their ids.")
                 404)))

(defn- replace-dashcard
  [state id f]
  (update state :dashcards (partial mapv #(cond-> % (= id (:id %)) f))))

;;; ──────────────────────────────────────────────────────────────────
;;; Tabs
;;; ──────────────────────────────────────────────────────────────────

(defn- tab-list
  [state]
  (if-let [tabs (seq (:tabs state))]
    (str "This dashboard's tabs are: "
         (str/join ", " (map #(str (pr-str (:name %)) " (id " (:id %) ")") tabs)) ".")
    "This dashboard has no tabs — `add_tab` makes one."))

(defn- resolve-tab
  "The id of the tab a `tab` argument names: its numeric id, or its name. A name is what a call has to use for a tab
   it added earlier in the same list, whose real id does not exist yet.

   `nil` names the first tab, or no tab at all on a dashboard that has none."
  [state tab]
  (cond
    (nil? tab)     (:id (first (:tabs state)))
    (integer? tab) (if (m/find-first #(= tab (:id %)) (:tabs state))
                     tab
                     (op-error! (str "This dashboard has no tab " tab ". " (tab-list state)) 404))
    (string? tab)  (let [matches (filterv #(= tab (:name %)) (:tabs state))]
                     (case (count matches)
                       0 (op-error! (str "This dashboard has no tab named " (pr-str tab) ". " (tab-list state))
                                    404)
                       1 (:id (first matches))
                       (op-error! (str "This dashboard has " (count matches) " tabs named " (pr-str tab)
                                       ", so the name does not say which of them. Name it by id instead."))))
    :else          (op-error! (str "`tab` takes a tab's id or its name; " (pr-str tab) " is neither."))))

(defn- add-tab
  "A new tab, at the end.

   The first tab a dashboard gets adopts the cards it already had. A dashboard with tabs has no cards outside them —
   the save refuses one — so the alternative to adopting them would be refusing to add the tab."
  [state op]
  (let [tab-name   (required op :name)
        first-tab? (empty? (:tabs state))
        [id state] (temp-id state)]
    (cond-> (update state :tabs conj {:id id :name tab-name})
      first-tab? (update :dashcards
                         (partial mapv #(cond-> % (nil? (:dashboard_tab_id %)) (assoc :dashboard_tab_id id)))))))

(defn- rename-tab
  [state op]
  (let [tab-name (required op :name)
        id       (resolve-tab state (required op :tab_id))]
    (update state :tabs (partial mapv #(cond-> % (= id (:id %)) (assoc :name tab-name))))))

(defn- move-tab
  "A tab, at another index. A tab's position *is* its place in the list the save sends, so moving one is reordering
   that list."
  [state op]
  (let [id     (resolve-tab state (required op :tab_id))
        index  (required op :index)
        tabs   (:tabs state)]
    (when-not (<= 0 index (dec (count tabs)))
      (op-error! (str "This dashboard has " (count tabs) " tab(s), so `index` is between 0 and "
                      (dec (count tabs)) ". 0 is the first tab.")))
    (let [moving (m/find-first #(= id (:id %)) tabs)
          others (filterv #(not= id (:id %)) tabs)]
      (assoc state :tabs (into (conj (subvec others 0 index) moving) (subvec others index))))))

(defn- remove-tab
  "A tab, and the cards on it. A card on a removed tab has nowhere left to be: the app deletes it with the tab, and
   the response says which cards went."
  [state op]
  (let [id (resolve-tab state (required op :tab_id))]
    (-> state
        (update :tabs (partial filterv #(not= id (:id %))))
        (update :dashcards (partial filterv #(not= id (:dashboard_tab_id %)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Where a card lands
;;; ──────────────────────────────────────────────────────────────────

(def ^:private grid-width dashboard.constants/grid-width)

(defn- default-size
  "The size the app gives a new card of this display: a heading spans the grid, a scalar is small, a table is large.
   A call that knows better passes `size`."
  [display]
  (let [{:keys [width height]} (merge dashboard.constants/default-card-size
                                      (:default (dashboard.constants/card-size-defaults (keyword display))))]
    {:size_x width :size_y height}))

(defn- checked-size
  "The `{size_x, size_y}` an op named, refused when it does not fit a 24-column grid."
  [{:keys [size_x size_y]}]
  (when (and size_x (not (<= 1 size_x grid-width)))
    (op-error! (str "`size_x` is between 1 and " grid-width ": the dashboard grid is "
                    grid-width " columns wide.")))
  (when (and size_y (< size_y 1))
    (op-error! "`size_y` is at least 1."))
  (m/remove-vals nil? {:size_x size_x :size_y size_y}))

(defn- checked-position
  "The `{row, col}` an op named. Half a position is not a position — a row without a column says where to put the
   card only if you already know the column — so it is refused rather than half-honored."
  [{:keys [row col] :as position}]
  (when (and position (not (and row col)))
    (op-error! "`position` is `{row, col}` — both, or neither and the card is placed in the first free slot."))
  (when (and row (neg? row))
    (op-error! "`row` is 0 or more. 0 is the top of the tab."))
  (when (and col (not (<= 0 col (dec grid-width))))
    (op-error! (str "`col` is between 0 and " (dec grid-width) ". 0 is the left edge of the grid.")))
  position)

(defn- placement
  "Where a card goes: the slot the call named, or the first free one on its tab.

   Autoplace walks the cards already on the target tab — including the ones earlier ops in this same list put there
   — so a list that adds five cards lays out five cards rather than stacking them all at the origin."
  [state tab-id display position size]
  (let [{:keys [row col]}       (checked-position position)
        {:keys [size_x size_y]} (merge (default-size display) (checked-size size))]
    (if (and row col)
      (do (when (< grid-width (+ col size_x))
            (op-error! (str "A card " size_x " columns wide at column " col " runs past the " grid-width
                            "-column grid. Move it left, or make it narrower with `size`.")))
          {:row row :col col :size_x size_x :size_y size_y})
      (-> (or (autoplace/get-position-for-new-dashcard (tab-cards state tab-id) size_x size_y grid-width)
              (op-error! "There is no free slot on this tab for a card that size."))
          (select-keys [:row :col :size_x :size_y])))))

(defn- parameter
  "The filter a `parameter_id` argument names: its id, or its name. A name is what a call has to use for a filter it
   added earlier in the same list, whose id the server mints and the caller has not seen yet — the same bargain `tab`
   makes."
  [state parameter-ref]
  (let [parameters (:parameters state)]
    (or (m/find-first #(= parameter-ref (:id %)) parameters)
        (case (count (filterv #(= parameter-ref (:name %)) parameters))
          0 (op-error! (str "This dashboard has no filter " (pr-str parameter-ref)
                            ". `get_content` on the dashboard lists its filters, by id and by name, and "
                            "`add_parameter` makes one.")
                       404)
          1 (m/find-first #(= parameter-ref (:name %)) parameters)
          (op-error! (str "This dashboard has more than one filter named " (pr-str parameter-ref)
                          ", so the name does not say which of them. Name it by id instead."))))))

(defn- check-inline-parameters!
  "A filter widget an op attaches to a card has to be one the dashboard has — `add_parameter` earlier in this same list
   counts."
  [state parameter-ids]
  (doseq [parameter-id parameter-ids]
    (parameter state parameter-id)))

(defn- place
  "A new dashcard, placed. What every add op has in common: an id, a tab, a slot, and the empty content a dashcard
   starts life with."
  [state {:keys [tab position size inline_parameters]} display extra]
  (let [_          (check-inline-parameters! state inline_parameters)
        tab-id     (resolve-tab state tab)
        [id state] (temp-id state)]
    (update state :dashcards conj
            (merge {:id                     id
                    :card_id                nil
                    :dashboard_tab_id       tab-id
                    :series                 []
                    :parameter_mappings     []
                    :inline_parameters      (vec inline_parameters)
                    :visualization_settings {}}
                   (placement state tab-id display position size)
                   extra))))

;;; ──────────────────────────────────────────────────────────────────
;;; The cards an op places
;;; ──────────────────────────────────────────────────────────────────

(defn- readable-card
  "The card an op names, read-checked as the app read-checks it. A card in the trash is refused here rather than by
   the save, so the failure names the op that named it."
  [ref]
  (let [card (api/read-check :model/Card (tools/resolve-id :model/Card ref))]
    (when (:archived card)
      (op-error! (str "Card " (:id card) " (" (pr-str (:name card)) ") is in the trash, and a dashboard cannot show "
                      "a trashed card. Restore it with `question_write` and `archived: false`.")))
    card))

(defn- virtual-card
  "The stub card a virtual dashcard shows. It has no query and no id: its `display` is the whole of it, and that is
   what tells the app to render text, or a heading, or an iframe, where a card would be."
  [display settings]
  (assoc settings :virtual_card {:name                   nil
                                 :display                display
                                 :visualization_settings {}
                                 :archived               false}))

(defn- add-card
  [state {:keys [series] :as op}]
  (let [card (readable-card (required op :card_id))]
    (place state op (:display card)
           {:card_id (:id card)
            :card    card
            :series  (mapv #(select-keys (readable-card %) [:id :name]) series)})))

(defn- add-text
  [state op]
  (place state op "text"
         {:visualization_settings (virtual-card "text" {:text (required op :markdown)})}))

(defn- add-heading
  [state op]
  (place state op "heading"
         {:visualization_settings (virtual-card "heading" {:text                (required op :text)
                                                           :dashcard.background false})}))

(defn- link-settings
  "What a link card points at: a URL, or something in this Metabase. Exactly one — a link that named both would
   point at one of them and silently drop the other."
  [{:keys [url entity] :as op}]
  (if (= :url (one-of! op [:url :entity]))
    {:link {:url url}}
    (let [{entity-type :type :keys [id]} entity]
      (when-not (and entity-type id)
        (op-error! "`entity` is `{type, id}`: what kind of thing to link to, and which one."))
      {:link {:entity {:model entity-type :id id}}})))

(defn- add-link
  [state op]
  (place state op "link" {:visualization_settings (virtual-card "link" (link-settings op))}))

(defn- add-iframe
  [state op]
  (place state op "iframe"
         {:visualization_settings (virtual-card "iframe" {:iframe (required op :src)})}))

(defn- add-action
  [state {:keys [label display] :as op}]
  (let [action (api/read-check :model/Action (tools/resolve-id :model/Action (required op :action_id)))]
    (when (and display (not ((set action-displays) display)))
      (op-error! (str "`display` is " (str/join " or " (map pr-str action-displays)) ".")))
    (place state op "action"
           {:action_id              (:id action)
            :visualization_settings (virtual-card "action"
                                                  (m/remove-vals nil? {:button.label      label
                                                                       :actionDisplayType display}))})))

;;; ──────────────────────────────────────────────────────────────────
;;; The cards an op changes
;;; ──────────────────────────────────────────────────────────────────

(defn- card-display
  "The display of the card a dashcard shows, which is what sizes it. A virtual dashcard has no card, and its size
   comes from the copy being made rather than from a display."
  [dashcard]
  (get-in dashcard [:card :display]))

(defn- duplicate-card
  "A copy of a dashcard, on the tab and in the slot the call names.

   It copies what the dashcard *shows* — its card, its series, its visualization settings. It does not copy the
   filter widgets attached to it: those are parameters of the dashboard, and a copy of one is a new parameter,
   which is a parameter op."
  [state {:keys [tab position size] :as op}]
  (let [source     (dashcard state (required op :dashcard_id))
        tab-id     (resolve-tab state (or tab (:dashboard_tab_id source)))
        [id state] (temp-id state)]
    (update state :dashcards conj
            (merge source
                   {:id                id
                    :dashboard_tab_id  tab-id
                    :inline_parameters []}
                   (placement state tab-id (card-display source) position
                              (or size (select-keys source [:size_x :size_y])))))))

(defn- replace-card
  "A different card, in the same place. The dashcard keeps its slot and its tab and loses everything that was about
   the old card — its series, its filter wiring, the settings that named its columns — exactly as replacing a card
   does in the editor."
  [state op]
  (let [id   (:id (dashcard state (required op :dashcard_id)))
        card (readable-card (required op :card_id))]
    (replace-dashcard state id #(assoc %
                                       :card_id                (:id card)
                                       :card                   card
                                       :series                 []
                                       :parameter_mappings     []
                                       :visualization_settings {}))))

(defn- move-card
  "A dashcard, onto another tab or into another slot. A move that names a tab but no slot re-places the card on the
   new tab, because the slot it held on the old one may well be taken on this one."
  [state {:keys [tab position] :as op}]
  (let [source  (dashcard state (required op :dashcard_id))]
    (when-not (or tab position)
      (op-error! "`move` needs a `tab`, a `position`, or both."))
    (let [tab-id  (resolve-tab state (or tab (:dashboard_tab_id source)))
          ;; The card leaves the tab before its new slot is chosen, or autoplace routes around the very card it is
          ;; placing.
          without (update state :dashcards (partial filterv #(not= (:id source) (:id %))))
          slot    (placement without tab-id (card-display source) position
                             (select-keys source [:size_x :size_y]))]
      (replace-dashcard state (:id source) #(merge % slot {:dashboard_tab_id tab-id})))))

(defn- resize-card
  [state op]
  (let [source (dashcard state (required op :dashcard_id))
        size   (checked-size (required op :size))
        size_x (:size_x size (:size_x source))]
    (when (< grid-width (+ (:col source) size_x))
      (op-error! (str "A card " size_x " columns wide at column " (:col source) " runs past the " grid-width
                      "-column grid. Move it left with `move` first.")))
    (replace-dashcard state (:id source) #(merge % size))))

(defn- remove-card
  [state op]
  (let [id (:id (dashcard state (required op :dashcard_id)))]
    (update state :dashcards (partial filterv #(not= id (:id %))))))

(defn- set-series
  "The extra cards plotted on one dashcard, in order. The list is the whole series, so `[]` clears it."
  [state {:keys [card_ids] :as op}]
  (let [source (dashcard state (required op :dashcard_id))]
    (when (nil? card_ids)
      (op-error! "`set_series` needs `card_ids` — the whole series, in order, or `[]` to clear it."))
    (when-not (:card_id source)
      (op-error! (str "Dashcard " (:id source) " shows no saved card, so there is no chart to plot a series on.")))
    (replace-dashcard state (:id source)
                      #(assoc % :series (mapv (fn [ref] (select-keys (readable-card ref) [:id :name]))
                                              card_ids)))))

(defn- text-tags
  "The `{{tags}}` a text, heading, link, or iframe card carries — the only things a filter can be wired to on one."
  [dashcard]
  (let [settings (:visualization_settings dashcard)]
    (set (parameters.shared/tag-names (or (:text settings)
                                          (get-in settings [:link :url])
                                          (:iframe settings)
                                          "")))))

(defn- prune-text-mappings
  "The wiring a text card can no longer carry, dropped. A filter fills in a `{{tag}}` where it stands in the card's
   text; edit that tag out of the text and the mapping points at nothing. The editor drops it on the same edit."
  [dashcard]
  (if (:card_id dashcard)
    dashcard
    (let [tags (text-tags dashcard)]
      (update dashcard :parameter_mappings
              (partial filterv (fn [{[kind tag] :target}]
                                 (or (not= :text-tag (keyword kind))
                                     (contains? tags tag))))))))

(defn- patch-dashcard
  "The content escape hatch: a merge over a dashcard's visualization settings, which is where everything a dashcard
   *shows* lives — a chart's settings, its column settings, its click behavior, a link's target, a visualizer's
   definition. Layout is not content, and a patch that carried it is refused with the op that owns it."
  [state op]
  (let [source (dashcard state (required op :dashcard_id))
        patch  (required op :patch)]
    (doseq [[k owner] layout-keys
            :when     (contains? patch k)]
      (op-error! (str "`patch` does not set `" (name k) "`: that is layout, not content. Use " owner " for it.")))
    (replace-dashcard state (:id source)
                      #(-> %
                           (update :visualization_settings merge patch)
                           prune-text-mappings))))

(defn- duplicate-tab
  "A copy of a tab, with copies of its cards, at the end. The cards keep their slots — the copy is a copy."
  [state op]
  (let [id             (resolve-tab state (required op :tab_id))
        source         (m/find-first #(= id (:id %)) (:tabs state))
        cards          (tab-cards state id)
        [tab-id state] (temp-id state)
        copies         (map-indexed (fn [i card]
                                      (assoc card
                                             :id                (- (:next-temp-id state) i)
                                             :dashboard_tab_id  tab-id
                                             :inline_parameters []))
                                    cards)]
    (-> state
        (update :tabs conj {:id tab-id :name (or (:name op) (str (:name source) " (copy)"))})
        (update :dashcards into copies)
        (update :next-temp-id - (count copies)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Filters
;;; ──────────────────────────────────────────────────────────────────
;;
;; A dashboard filter is two things, and the ops keep them apart. The *parameter* is the widget — its name, its type,
;; the values it offers — and lives on the dashboard. The *mapping* is the wire from that widget to one thing on one
;; card: a column of an MBQL query, a field-filter tag or a variable of a native one, a `{{tag}}` in a text card. A
;; parameter with no mappings is a widget that does nothing, which is the failure this half of the tool exists to make
;; hard: `wire_parameter` with `autowire` maps every card that has the column, in one op, the way the editor offers to
;; when a person maps the first one.

(def parameter-types
  "Every type a dashboard filter can have, in the app's own vocabulary."
  (mapv u/qualified-name (keys lib.schema.parameter/types)))

(def values-query-types
  "How a filter offers its values: not at all, as a list to pick from, or as a search box."
  ["none" "list" "search"])

(def values-source-types
  "Where a filter's values come from: a list the dashboard carries, or a column of a card."
  ["static-list" "card"])

(def ^:private parameter-fields
  "The fields of a filter an op sets, named as the dashboard row names them — `filteringParameters` and `isMultiSelect`
   included, camelCase and all. A tool that renamed them would have to rename them back on the way into the save, and a
   read of the dashboard would answer in a vocabulary no write takes."
  [:default :required :isMultiSelect :temporal_units :values_query_type :values_source_type :values_source_config
   :filteringParameters])

(defn- check-enum!
  [op k allowed]
  (when-let [v (get op k)]
    (when-not (some #{v} allowed)
      (op-error! (str "`" (name k) "` is " (str/join " or " (map pr-str allowed)) ".")))))

(defn- check-boolean!
  [op k]
  (when-let [v (get op k)]
    (when-not (boolean? v)
      (op-error! (str "`" (name k) "` is true or false.")))))

(defn- checked-parameter-fields
  "The parameter fields the op sets, checked. The dashboard's own schema lets `required` and `isMultiSelect` through
   unvalidated — they are not fields it declares — so a `\"yes\"` would be stored and read back as a filter nobody can
   fill in. The tool is where they are checked, or nowhere is."
  [state op]
  (check-boolean! op :required)
  (check-boolean! op :isMultiSelect)
  (check-enum! op :values_query_type values-query-types)
  (check-enum! op :values_source_type values-source-types)
  (doseq [unit (:temporal_units op)]
    (when-not (contains? lib.schema.temporal-bucketing/temporal-bucketing-units (keyword unit))
      (op-error! (str (pr-str unit) " is not a time unit. The units are: "
                      (str/join ", " (sort (map name lib.schema.temporal-bucketing/temporal-bucketing-units))) "."))))
  (doseq [filtering-id (:filteringParameters op)]
    (parameter state filtering-id))
  (select-keys op parameter-fields))

(defn- check-default!
  "A filter that must be answered has to answer itself when nobody does. The app's editor will not let a person mark one
   required without giving it a default, and a dashboard that carries one runs its cards with an empty filter."
  [parameter]
  (when (and (:required parameter) (nil? (:default parameter)))
    (op-error! (str "A required filter needs a `default`: `required: true` means the dashboard cannot be read without "
                    "a value for it, so it has to bring one."))))

(defn- fresh-parameter-id
  "An id for a new filter — eight hex characters, as the editor mints them, and none this dashboard already uses."
  [state]
  (let [taken? (into #{} (map :id) (:parameters state))]
    (first (remove taken? (repeatedly #(format "%08x" (rand-int Integer/MAX_VALUE)))))))

(defn- checked-parameter-name
  "The name a new filter takes, refused when the dashboard already has one by that name. Two filters called \"Date\" are
   two filters a reader cannot tell apart — and two a later op cannot tell apart either, because a filter added in this
   same call is named by its name until the save mints its id."
  [state wanted own-id]
  (when-let [clash (m/find-first #(and (= wanted (:name %)) (not= own-id (:id %))) (:parameters state))]
    (op-error! (str "This dashboard already has a filter named " (pr-str wanted) " (id " (pr-str (:id clash))
                    "). Wire that one instead, or give this one a name of its own.")))
  wanted)

(defn- checked-parameter-type
  "A filter's type, refused when the app has no such type. It is what decides which columns the filter can reach, so a
   type nobody has is a filter that can reach nothing."
  [parameter-type]
  (when-not (some #{parameter-type} parameter-types)
    (op-error! (str (pr-str parameter-type) " is not a filter type. The common ones are \"string/=\", \"number/=\", "
                    "\"number/between\", \"date/all-options\", \"id\", and \"temporal-unit\".")))
  parameter-type)

(defn- add-parameter
  "A new filter on the dashboard. It filters nothing until it is wired — `wire_parameter` does that, and can name this
   filter by the name this op gave it."
  [state op]
  (let [parameter-name (checked-parameter-name state (required op :name) nil)
        new-parameter  (merge {:id    (fresh-parameter-id state)
                               :name  parameter-name
                               :slug  (u/slugify parameter-name)
                               :type  (checked-parameter-type (required op :type))}
                              (checked-parameter-fields state op))]
    (check-default! new-parameter)
    (update state :parameters conj new-parameter)))

(defn- replace-parameter
  [state id f]
  (update state :parameters (partial mapv #(cond-> % (= id (:id %)) f))))

(defn- retyped
  "A filter whose type changed, with what the old type meant stripped off it: its default, and the values it offered.
   A default of `\"Widget\"` on a filter that is now a number is a default the dashboard cannot apply, and the editor
   clears it for the same reason."
  [parameter]
  (dissoc parameter :default :values_query_type :values_source_type :values_source_config))

(defn- mapped-dashcards
  "The dashcards a filter reaches, and the mapping on each."
  [state parameter-id]
  (for [dashcard (:dashcards state)
        mapping  (:parameter_mappings dashcard)
        :when    (= parameter-id (:parameter_id mapping))]
    [dashcard mapping]))

(defn- drop-mapping
  [dashcard parameter-id]
  (update dashcard :parameter_mappings
          (partial filterv #(not= parameter-id (:parameter_id %)))))

(defn- unwire-incompatible
  "The wiring a retyped filter can no longer carry, cut. A date filter wired to a date column and then made a number
   filter is wired to a column it cannot narrow; the app's editor drops the mapping, and a dashboard that kept it would
   run its cards with a filter that does nothing."
  [state parameter]
  (reduce (fn [state [dashcard {:keys [target]}]]
            (if (or (not (:card_id dashcard))
                    (parameters.mapping/resolve-option (:card dashcard) parameter target))
              state
              (replace-dashcard state (:id dashcard) #(drop-mapping % (:id parameter)))))
          state
          (mapped-dashcards state (:id parameter))))

(defn- update-parameter
  "One filter, changed. Every property of a filter is a field of one object — the editor's ten sidebar controls all
   write to it — so there is one op for all of them."
  [state op]
  (let [current (parameter state (required op :parameter_id))
        retyped? (and (:type op) (not= (:type op) (u/qualified-name (:type current))))
        renamed (when-let [parameter-name (:name op)]
                  {:name (checked-parameter-name state parameter-name (:id current))
                   :slug (u/slugify parameter-name)})
        changed (merge (cond-> current retyped? retyped)
                       renamed
                       (when-let [parameter-type (:type op)]
                         {:type (checked-parameter-type parameter-type)})
                       (checked-parameter-fields state op))]
    (check-default! changed)
    (cond-> (replace-parameter state (:id current) (constantly changed))
      retyped? (unwire-incompatible changed))))

(defn- inline-dashcard
  "The dashcard a filter sits on, when it sits on one rather than at the top of the page."
  [state parameter-id]
  (m/find-first #(some #{parameter-id} (:inline_parameters %)) (:dashcards state)))

(defn- remove-inline-parameter
  [state parameter-id]
  (update state :dashcards
          (partial mapv (fn [dashcard]
                          (cond-> dashcard
                            (some #{parameter-id} (:inline_parameters dashcard))
                            (update :inline_parameters (partial filterv #(not= parameter-id %))))))))

(defn- remove-parameter
  "A filter, and every reference to it: the wiring to the cards it filtered, the linked-filter lists that narrowed it,
   and the card it sat on. A reference left behind is a filter the dashboard cannot show and the save cannot resolve.
   The subscriptions it breaks are named in the response — the save archives them, and a person who was getting that
   email is not going to notice on their own."
  [state op]
  (let [{:keys [id]} (parameter state (required op :parameter_id))]
    (-> (reduce (fn [state [dashcard _]]
                  (replace-dashcard state (:id dashcard) #(drop-mapping % id)))
                state
                (mapped-dashcards state id))
        (remove-inline-parameter id)
        (update :parameters (partial into []
                                     (comp (remove #(= id (:id %)))
                                           (map (fn [parameter]
                                                  (cond-> parameter
                                                    (:filteringParameters parameter)
                                                    (update :filteringParameters
                                                            (partial filterv #(not= id %))))))))))))

(defn- reordered-parameters
  "The dashboard's filters with `parameter-id` at `index` of the row of filters at the top of the page.

   A filter's place in the list is its place in that row — but the filters that sit on cards are in the list too and
   are not in the row, so the index the caller means is counted over the header's own. The moved filter lands directly
   after the filter it is to follow, which leaves the others where they were."
  [state parameter-id index]
  (let [moving (parameter state parameter-id)
        others (filterv #(not= parameter-id (:id %)) (:parameters state))
        header (filterv #(not (inline-dashcard state (:id %))) others)]
    (when-not (<= 0 index (count header))
      (op-error! (str "This dashboard has " (count header) " other filter(s) in its header, so `index` is between 0 "
                      "and " (count header) ". 0 is the leftmost.")))
    (let [follows (when (pos? index) (:id (nth header (dec index))))
          at      (if follows
                    (inc (first (keep-indexed #(when (= follows (:id %2)) %1) others)))
                    0)]
      (into (conj (subvec others 0 at) moving) (subvec others at)))))

(defn- move-parameter
  "A filter, somewhere else: to another place in the row of filters at the top of the page, or onto a card — where it
   shows as a widget on the card itself. `dashcard_id` puts it on a card; `index` puts it back in the header, at that
   place in the row."
  [state {:keys [index dashcard_id] :as op}]
  (let [{:keys [id]} (parameter state (required op :parameter_id))
        _            (when-not (or index dashcard_id)
                       (op-error! (str "`move_parameter` needs an `index` — where in the header to put the filter — "
                                       "or a `dashcard_id`, to put it on a card.")))
        state        (remove-inline-parameter state id)]
    (if dashcard_id
      (let [target (dashcard state dashcard_id)]
        (when-not (or (:card_id target) (= "heading" (projections/dashcard-kind target)))
          (op-error! (str "A filter can only sit on a card or on a heading. Dashcard " (:id target)
                          " is neither, so this filter belongs in the header — `move_parameter` with an `index`.")))
        (replace-dashcard state (:id target) #(update % :inline_parameters (fnil conj []) id)))
      (assoc state :parameters (reordered-parameters state id index)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Wiring
;;; ──────────────────────────────────────────────────────────────────

(defn- virtual-target
  "The target a `target_tag` names on a card the editor drew rather than a query: the `{{tag}}` itself, which is
   substituted with the filter's value where it stands."
  [dashcard op]
  (let [tag  (or (:target_tag op)
                 (op-error! (str "Dashcard " (:id dashcard) " is a text, heading, link, or iframe card, and the only "
                                 "thing a filter can fill in on one is a `{{tag}}` in its text. Pass `target_tag`.")))
        tags (text-tags dashcard)]
    (when-not (contains? tags tag)
      (op-error! (str "Dashcard " (:id dashcard) " has no `{{" tag "}}` in it. "
                      (if (seq tags)
                        (str "Its tags are: " (str/join ", " (map #(str "{{" % "}}") (sort tags))) ".")
                        (str "Write `{{" tag "}}` into its text first — `patch_dashcard` with `text`.")))))
    [:text-tag tag]))

(defn- named-option
  "The mapping option a `target_field` names: a column of the card, by its name, its display name, or its field id. The
   editor's dropdown is this list, and so is the error when the name is not on it.

   A card reaches the columns of the tables it joins as well as its own — an order has a product's category — and two
   of them can carry the same name. The card's own column wins, because that is what a person naming a bare column
   means; a name that is still ambiguous after that is refused rather than guessed at."
  [card parameter ref]
  (let [options (parameters.mapping/mapping-options card parameter)
        named?  (fn [{:keys [name column]}]
                  (if (integer? ref)
                    (= ref (:id column))
                    (some #(and % (.equalsIgnoreCase ^String % ^String ref)) [name (:name column)])))
        matches (filterv named? options)
        matches (or (not-empty (filterv #(not= :source/implicitly-joinable (:lib/source (:column %))) matches))
                    matches)]
    (case (count matches)
      1 (first matches)
      0 (op-error!
         (str "Card " (:id card) " (" (pr-str (:name card)) ") has nothing called " (pr-str ref)
              " that this filter can narrow. "
              (if (seq options)
                (str "It can filter: " (str/join ", " (map #(pr-str (:name %)) options)) ".")
                (str "It has no column of the filter's type at all — a date filter needs a date column. Check the "
                     "filter's `type`, or wire it to another card."))))
      (op-error!
       (str "Card " (:id card) " (" (pr-str (:name card)) ") has " (count matches) " columns called " (pr-str ref)
            ", so the name does not say which of them. Name it by field id instead — `browse_data` with `get_fields` "
            "lists the ids.")))))

(defn- tag-option
  "The mapping option a `target_tag` names on a native card: one of the `{{tags}}` its SQL declares."
  [card parameter tag]
  (let [options (parameters.mapping/mapping-options card parameter)
        tag-of  (fn [{:keys [target]}]
                  (let [[_ [reference tag-name]] target]
                    (when (= :template-tag (keyword reference))
                      tag-name)))]
    (or (m/find-first #(= tag (tag-of %)) options)
        (op-error!
         (str "Card " (:id card) " (" (pr-str (:name card)) ") has no `{{" tag "}}` this filter can fill in. "
              (if-let [tags (seq (keep tag-of options))]
                (str "Its tags are: " (str/join ", " (map #(str "{{" % "}}") tags)) ".")
                (str "It declares no variable of the filter's kind. A card is filtered by a `{{tag}}` only when its "
                     "SQL declares one — otherwise write the filter into the SQL first.")))))))

(defn- given-target
  "The target an op spelled out in full — the escape hatch for a wiring the named forms cannot say, and the way a
   mapping read out of `get_content`'s `layout` is written straight back."
  [card parameter target]
  (or (parameters.mapping/resolve-option card parameter target)
      (op-error! (str "Card " (:id card) " (" (pr-str (:name card)) ") cannot be filtered by " (pr-str target)
                      ". `target_field` names a column of the card and is what to reach for; `target` is for a target "
                      "you read off the dashboard's own `layout`."))))

(defn- wiring-target
  "What a `wire_parameter` op wires to, on the dashcard it names."
  [dashcard param {:keys [target_field target_tag target] :as op}]
  (let [card (:card dashcard)]
    (one-of! op [:target_field :target_tag :target])
    (cond
      (not (:card_id dashcard)) (virtual-target dashcard op)
      target_field              (:target (named-option card param target_field))
      target_tag                (:target (tag-option card param target_tag))
      :else                     (:target (given-target card param target)))))

(defn- rewire
  "The dashcard's mappings with this filter wired to `target` — replacing whatever it was wired to on this card, because
   one filter narrows one thing on one card."
  [dashcard parameter-id target]
  (let [mappings (->> (:parameter_mappings dashcard)
                      (filterv #(and (not= parameter-id (:parameter_id %))
                                     ;; a `{{tag}}` in a text card takes one filter: a second one would substitute over
                                     ;; the first
                                     (not= target (:target %)))))]
    (assoc dashcard :parameter_mappings
           (conj mappings (cond-> {:parameter_id parameter-id :target target}
                            (:card_id dashcard) (assoc :card_id (:card_id dashcard)))))))

(defn- autowire-candidates
  "The other cards `autowire` reaches: every card on the *same tab* that shows a saved question and has this filter
   wired to nothing yet. The tab is the boundary the editor draws — it offers to wire the cards a person is looking at
   — and a filter that sits on a card rather than in the header is a filter about that card, so it spreads to nothing."
  [state parameter-id seed]
  (when-not (inline-dashcard state parameter-id)
    (for [candidate (:dashcards state)
          :when     (and (:card_id candidate)
                         (not= (:id seed) (:id candidate))
                         (= (:dashboard_tab_id seed) (:dashboard_tab_id candidate))
                         (not-any? #(= parameter-id (:parameter_id %)) (:parameter_mappings candidate)))]
      candidate)))

(defn- autowire
  "The same wiring, on every candidate card that has the column. A card that does not have it is left alone — auto-wire
   maps what it can and says nothing about what it cannot, exactly as the editor's does."
  [state param seed target]
  (reduce (fn [state candidate]
            (if-let [option (parameters.mapping/resolve-option (:card candidate) param target)]
              (replace-dashcard state (:id candidate) #(rewire % (:id param) (:target option)))
              state))
          state
          (autowire-candidates state (:id param) seed)))

(defn- wired-dashcard
  "The dashcard a wiring op acts on: the one it names by `dashcard_id`, or the one showing the card it names by
   `card_id`. The second is how a call wires a card it added in this same list — the dashcard's id does not exist until
   the save mints it, and the card's does."
  [state op]
  (if-let [dashcard-id (:dashcard_id op)]
    (dashcard state dashcard-id)
    (let [card-id (tools/resolve-id :model/Card
                                    (or (:card_id op)
                                        (op-error! (str "`" (:op op) "` needs a `dashcard_id` — the card on the "
                                                        "dashboard to wire — or a `card_id`, which names the dashcard "
                                                        "showing that card."))))
          matches (filterv #(= card-id (:card_id %)) (:dashcards state))]
      (case (count matches)
        0 (op-error! (str "This dashboard shows no card " card-id ". `add_card` puts it on the dashboard first.") 404)
        1 (first matches)
        (op-error! (str "This dashboard shows card " card-id " on " (count matches)
                        " of its dashcards, so `card_id` does not say which one to wire. Name it by `dashcard_id` — "
                        "this tool's response lists them."))))))

(defn- wire-parameter
  "A filter, wired to one thing on one card. `autowire` carries the same wiring to every other card on the tab that has
   the column — which is what makes one filter narrow a whole dashboard, rather than the one card the op names."
  [state op]
  (let [param    (parameter state (required op :parameter_id))
        seed     (wired-dashcard state op)
        target   (wiring-target seed param op)
        state    (replace-dashcard state (:id seed) #(rewire % (:id param) target))]
    (cond-> state
      (and (:autowire op) (:card_id seed)) (autowire param seed target))))

(defn- unwire-parameter
  "A filter, unwired: from the card the op names, or — naming none — from every card it reached. The filter itself stays
   on the dashboard; `remove_parameter` is what takes it away."
  [state op]
  (let [{:keys [id]} (parameter state (required op :parameter_id))]
    (if-let [dashcard-id (:dashcard_id op)]
      (let [target (dashcard state dashcard-id)]
        (replace-dashcard state (:id target) #(drop-mapping % id)))
      (reduce (fn [state [dashcard _]]
                (replace-dashcard state (:id dashcard) #(drop-mapping % id)))
              state
              (mapped-dashcards state id)))))

;;; ──────────────────────────────────────────────────────────────────
;;; The compiler
;;; ──────────────────────────────────────────────────────────────────

(def ^:private op-fns
  {"add_card"       add-card
   "add_text"       add-text
   "add_heading"    add-heading
   "add_link"       add-link
   "add_iframe"     add-iframe
   "add_action"     add-action
   "duplicate_card" duplicate-card
   "replace_card"   replace-card
   "move"           move-card
   "resize"         resize-card
   "remove"         remove-card
   "set_series"     set-series
   "patch_dashcard" patch-dashcard
   "add_tab"          add-tab
   "rename_tab"       rename-tab
   "move_tab"         move-tab
   "duplicate_tab"    duplicate-tab
   "remove_tab"       remove-tab
   "add_parameter"    add-parameter
   "update_parameter" update-parameter
   "remove_parameter" remove-parameter
   "move_parameter"   move-parameter
   "wire_parameter"   wire-parameter
   "unwire_parameter" unwire-parameter})

(defn- apply-op
  [state [index {op-name :op :as op}]]
  (binding [*op-index* index]
    (let [f (or (op-fns op-name)
                (op-error! (str (pr-str op-name) " is not an op. The ops are: " (str/join ", " ops) ".")))]
      (f state op))))

(defn- compile-ops
  "The dashboard the ops leave behind. Each op validates against the state the ops before it produced, so one call
   can add a tab and put a card on it, or add a card and move the card it displaced."
  [dashboard ops]
  (reduce apply-op (initial-state dashboard) (map-indexed vector ops)))

;;; ──────────────────────────────────────────────────────────────────
;;; What the compile writes, and what the write answers with
;;; ──────────────────────────────────────────────────────────────────

(def ^:private save-keys
  "The keys a dashcard carries into the save. The `card` the compiler kept for the response's sake does not: the
   save reads the card from `card_id`."
  [:id :card_id :dashboard_tab_id :row :col :size_x :size_y
   :series :visualization_settings :parameter_mappings :inline_parameters :action_id])

(defn- layout
  "The `dashcards`, `tabs`, and `parameters` of the save: the dashboard's whole desired state, which is what the save
   takes. Sending them at all is what makes a save a layout change, so a call with no ops sends none of them and the
   layout is left exactly as it was."
  [state]
  {:dashcards  (mapv #(select-keys % save-keys) (:dashcards state))
   :tabs       (mapv #(select-keys % [:id :name]) (:tabs state))
   :parameters (:parameters state)})

(defn- broken-subscriptions
  "The subscriptions this call's ops break: the ones that send a filter it removes. The save archives them and mails
   their creators — nothing here does that — so naming them is all the tool can do, and is the whole of what a
   `validate_only` can offer before the fact."
  [dashboard state]
  (let [kept    (into #{} (map :id) (:parameters state))
        removed (remove kept (map :id (:parameters dashboard)))]
    (dashboards.write/subscriptions-filtering-on (:id dashboard) removed)))

(defn- answer
  "The dashboard a write answers with: the editing skeleton, the same shape `get_content` returns for a dashboard, so
   the next op is authorable from it and a build needs no read between its steps. And the subscriptions it broke, which
   nothing else is going to mention."
  [dashboard broken]
  (cond-> (projections/dashboard-skeleton dashboard
                                          (tools/project "concise" (projections/spec :dashboard) dashboard))
    (seq broken) (assoc :broken_subscriptions (vec broken))))

(defn- would-be
  "The dashboard the ops would produce, without producing it. Every check an op makes has run — the cards exist and are
   readable, the tabs resolve, the slots fit the grid, the filters reach a column of the cards they name — and nothing
   has been written. The ids of the rows it would create are negative, because they do not exist."
  [dashboard state broken]
  (assoc (answer (merge dashboard (select-keys state [:dashcards :tabs :parameters])) broken)
         :validated true))

;;; ──────────────────────────────────────────────────────────────────
;;; dashboard_write
;;; ──────────────────────────────────────────────────────────────────

(def ^:private dashboard-fields
  "The dashboard's own fields — the ones that are not its layout. Named as REST names them, and applied as REST
   applies them: a field the call does not name is left as it was."
  [:name :description :collection_position :width :auto_apply_filters :cache_ttl :archived])

(defn- dashboard-updates
  "The patch a call makes to the dashboard itself: the fields it named, and nothing else. A `nil` is not a value — a
   strict client sends one for every argument the call did not set."
  [params]
  (reduce (fn [updates k]
            (cond-> updates
              (some? (get params k)) (assoc k (get params k))))
          {}
          dashboard-fields))

(defn- create-collection-id
  "The collection a create saves into: the one the call named, or — when it named none — the caller's own personal
   collection. A dashboard an agent made lands in the user's own space rather than in the one collection everybody
   sees and nobody owns."
  [collection-ref]
  (if (= :null (:kind (tools/classify-ref collection-ref)))
    (:id (collection/user->personal-collection api/*current-user-id*))
    (tools/resolve-collection-id collection-ref)))

(defn- empty-dashboard
  "The dashboard a create's ops compile against: nothing on it yet."
  [params]
  (assoc (select-keys params [:name :description])
         :dashcards [] :tabs [] :parameters []))

(defn- create-dashboard!
  [{dashboard-name :name
    :keys          [description collection_id collection_position cache_ttl ops validate_only]
    :as            params}]
  (let [collection-id (create-collection-id collection_id)
        state         (compile-ops (empty-dashboard params) ops)]
    (if validate_only
      ;; A dry run that said yes and then failed on permission would have taught the model nothing, so the create
      ;; check runs here too.
      (do (api/create-check :model/Dashboard {:collection_id collection-id})
          (would-be (empty-dashboard params) state nil))
      (let [dashboard (dashboards.write/create-dashboard!
                       (cond-> {:name          dashboard-name
                                :collection_id collection-id}
                         description         (assoc :description description)
                         collection_position (assoc :collection_position collection_position)
                         cache_ttl           (assoc :cache_ttl cache_ttl)))]
        (answer (if (seq ops)
                  (dashboards.write/update-dashboard! (:id dashboard) (layout state))
                  dashboard)
                nil)))))

(defn- current-dashboard
  "The dashboard the ops compile against.

   The *save's* view of it, not the read's: a read hydrates a link card's target into the dashcard's visualization
   settings, and settings carried out of a read and back into a save would persist that hydration over the
   reference it came from. The caller's permissions still narrow it — [[dashboards.read/apply-card-permission-filters]]
   hides the details of a card they may not read, so the skeleton this write answers with cannot name one."
  [dashboard-id]
  (dashboards.read/apply-card-permission-filters (dashboards.write/dashboard-for-save dashboard-id)))

(defn- update-dashboard!
  [{:keys [id collection_id ops validate_only] :as params}]
  (let [dashboard-id (tools/resolve-id :model/Dashboard id)
        _            (api/write-check :model/Dashboard dashboard-id)
        current      (current-dashboard dashboard-id)
        state        (compile-ops current ops)
        broken       (broken-subscriptions current state)]
    (if validate_only
      (would-be current state broken)
      (answer (dashboards.write/update-dashboard!
               dashboard-id
               (cond-> (dashboard-updates params)
                 (some? collection_id) (assoc :collection_id (tools/resolve-collection-id collection_id))
                 (seq ops)             (merge (layout state))))
              broken))))

(mu/defn dashboard-write :- :map
  "Create or update a dashboard. See the tool's description on `POST /v2/dashboard-write` for the argument
   contract."
  [{:keys [method] :as params} :- DashboardParams]
  (tools/validate-write! params {"create" [:name] "update" []})
  (if (= "create" method)
    (create-dashboard! params)
    (update-dashboard! params)))
