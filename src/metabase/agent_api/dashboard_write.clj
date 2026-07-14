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
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def card-ops
  "The ops that act on the cards of a dashboard."
  ["add_card" "add_text" "add_heading" "add_link" "add_iframe" "add_action"
   "duplicate_card" "replace_card" "move" "resize" "remove" "set_series" "patch_dashcard"])

(def tab-ops
  "The ops that act on the tabs of a dashboard."
  ["add_tab" "rename_tab" "move_tab" "duplicate_tab" "remove_tab"])

(def ops
  "Every op `dashboard_write` takes."
  (into card-ops tab-ops))

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
  [{:keys [dashcards tabs parameters]}]
  {:tabs          (mapv #(select-keys % [:id :name]) tabs)
   :dashcards     (mapv state-dashcard dashcards)
   :parameter-ids (into #{} (map :id) parameters)
   :next-temp-id  -1})

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

(defn- check-inline-parameters!
  "A filter widget an op attaches to a card has to be a filter the dashboard already has: creating one is a
   parameter op, and those are this tool's other half."
  [state parameter-ids]
  (doseq [parameter-id parameter-ids
          :when        (not (contains? (:parameter-ids state) parameter-id))]
    (op-error! (str "This dashboard has no parameter " (pr-str parameter-id)
                    ". `get_content` on the dashboard lists its parameters and their ids.")
               404)))

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
    (replace-dashcard state (:id source) #(update % :visualization_settings merge patch))))

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
   "add_tab"        add-tab
   "rename_tab"     rename-tab
   "move_tab"       move-tab
   "duplicate_tab"  duplicate-tab
   "remove_tab"     remove-tab})

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
  "The `dashcards` and `tabs` of the save: the dashboard's whole desired state, which is what the save takes.
   Sending them at all is what makes a save a layout change, so a call with no ops sends neither and the layout is
   left exactly as it was."
  [state]
  {:dashcards (mapv #(select-keys % save-keys) (:dashcards state))
   :tabs      (mapv #(select-keys % [:id :name]) (:tabs state))})

(defn- skeleton
  "The dashboard a write answers with: the editing skeleton, the same shape `get_content` returns for a dashboard.
   The next op is authorable from it, so a build needs no read between its steps."
  [dashboard]
  (projections/dashboard-skeleton dashboard
                                  (tools/project "concise" (projections/spec :dashboard) dashboard)))

(defn- would-be
  "The layout the ops would produce, without producing it. Every check an op makes has run — the cards exist and are
   readable, the tabs resolve, the slots fit the grid — and nothing has been written. The ids of the rows it would
   create are negative, because they do not exist."
  [dashboard state]
  (assoc (skeleton (merge dashboard (select-keys state [:dashcards :tabs])))
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
          (would-be (empty-dashboard params) state))
      (let [dashboard (dashboards.write/create-dashboard!
                       (cond-> {:name          dashboard-name
                                :collection_id collection-id}
                         description         (assoc :description description)
                         collection_position (assoc :collection_position collection_position)
                         cache_ttl           (assoc :cache_ttl cache_ttl)))]
        (skeleton
         (if (seq ops)
           (dashboards.write/update-dashboard! (:id dashboard) (layout state))
           dashboard))))))

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
        state        (compile-ops current ops)]
    (if validate_only
      (would-be current state)
      (skeleton
       (dashboards.write/update-dashboard!
        dashboard-id
        (cond-> (dashboard-updates params)
          (some? collection_id) (assoc :collection_id (tools/resolve-collection-id collection_id))
          (seq ops)             (merge (layout state))))))))

(mu/defn dashboard-write :- :map
  "Create or update a dashboard. See the tool's description on `POST /v2/dashboard-write` for the argument
   contract."
  [{:keys [method] :as params} :- DashboardParams]
  (tools/validate-write! params {"create" [:name] "update" []})
  (if (= "create" method)
    (create-dashboard! params)
    (update-dashboard! params)))
