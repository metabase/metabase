(ns metabase-enterprise.library-branching.format.kinds.dashboard
  "The codec of the kind :dashboard: a dashboard with its tabs, its cards and its parameters, as the file
  `<name>.dashboard.yaml`. The place is the collection, under `collection`. Tabs and dashboard cards are entries of the
  file, each with its own id; they are not items.

  A tab is `{:id :name}`, and its position is its index in `:tabs`. A dashboard card is `{:id :row :col :size_x
  :size_y}` with the optional `:card_id`, `:action_id`, `:dashboard_tab_id` (the id of its tab), `:parameter_mappings`,
  `:visualization_settings`, `:series` (the card ids of its other series, in order) and `:inline_parameters`; an entry
  at its default is absent. The app DB keeps no order of the dashboard cards, so `:dashcards` holds them in
  [[dashcard-order]]."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.format.kinds.portable :as portable]
   [metabase-enterprise.library-branching.format.kinds.visualization :as visualization]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Dashboard cards -------------------------------------------------

(def dashcard-defaults
  "The default of each optional entry of a dashboard card that is not a reference."
  {:parameter_mappings     []
   :visualization_settings {}
   :series                 []
   :inline_parameters      []})

(defn- entry-default?
  [k v]
  (or (nil? v)
      (and (contains? dashcard-defaults k) (= (get dashcard-defaults k) v))))

(defn- mapping-order
  "The parameter mappings `mappings` in the order of their parameter ids, as the serdes export sorts them; two mappings
  of one parameter keep their order. Values of other shapes are returned as they are."
  [mappings]
  (if (and (vector? mappings) (every? #(and (map? %) ((some-fn nil? string?) (:parameter_id %))) mappings))
    (vec (sort-by :parameter_id mappings))
    mappings))

(defn normal-dashcard
  "Dashboard card `dashcard` in its one form: without each entry that is nil or at its default
  ([[dashcard-defaults]]), with its parameter mappings in the order of their parameter ids. A value that is not a map
  is returned as it is."
  [dashcard]
  (if (map? dashcard)
    (let [dc (into {} (remove (fn [[k v]] (entry-default? k v))) dashcard)]
      (cond-> dc
        (contains? dc :parameter_mappings) (update :parameter_mappings mapping-order)))
    dashcard))

(defn- sort-key
  [tab-index {:keys [dashboard_tab_id row col id]}]
  [(get tab-index dashboard_tab_id -1) row col id])

(defn- tab-index
  [tabs]
  (into {} (map-indexed (fn [i tab] [(:id tab) i])) tabs))

(defn- sortable?
  [tabs dashcards]
  (and (vector? tabs) (every? map? tabs)
       (vector? dashcards)
       (every? (fn [dc] (and (map? dc) (int? (:row dc)) (int? (:col dc)) (string? (:id dc)))) dashcards)))

(defn dashcard-order
  "`dashcards` in the order of the file: by the position of their tab in `tabs` (no tab first), then by row, column and
  id. Values of other shapes are returned as they are."
  [tabs dashcards]
  (if (sortable? tabs dashcards)
    (let [index (tab-index tabs)]
      (vec (sort-by (partial sort-key index) dashcards)))
    dashcards))

(defn- distinct-ids?
  [entries]
  (or (empty? entries) (apply distinct? (map :id entries))))

(defn tabs-fit?
  "True iff the tabs and the dashboard cards of the attributes `attrs` have distinct ids, each dashboard card is on no
  tab or on a tab of `:tabs`, and the dashboard cards are in [[dashcard-order]]."
  [{:keys [tabs dashcards] :or {tabs [] dashcards []}}]
  (let [tab-ids (set (map :id tabs))]
    (and (distinct-ids? tabs)
         (distinct-ids? dashcards)
         (every? #(or (nil? (:dashboard_tab_id %)) (contains? tab-ids (:dashboard_tab_id %))) dashcards)
         (= dashcards (dashcard-order tabs dashcards)))))

(registry/def ::tab
  [:map {:closed true}
   [:id ::snapshot/entity-id]
   [:name [:string {:min 1}]]])

(registry/def ::dashcard
  [:and
   [:map {:closed true}
    [:id ::snapshot/entity-id]
    [:card_id {:optional true} ::snapshot/entity-id]
    [:action_id {:optional true} ::snapshot/entity-id]
    [:dashboard_tab_id {:optional true} ::snapshot/entity-id]
    [:row [:int {:min 0}]]
    [:col [:int {:min 0}]]
    [:size_x [:int {:min 1}]]
    [:size_y [:int {:min 1}]]
    [:parameter_mappings {:optional true} [:vector ::common/document-map]]
    [:visualization_settings {:optional true} ::common/document-map]
    [:series {:optional true} [:vector ::snapshot/entity-id]]
    [:inline_parameters {:optional true} [:vector :string]]]
   [:fn {:error/message "a dashboard card holds no entry at its default, and its parameter mappings are in their order"}
    #(= % (normal-dashcard %))]])

(registry/def ::parameter
  [:and ::common/document-map [:map [:id [:string {:min 1}]]]])

;;; ---------------------------------------------------- References ---------------------------------------------------

(defn- visualizer-card-id
  "The card id that the visualizer text `s` names (`card:<id>` or `$_card:<id>_name`), or nil."
  [s]
  (when (string? s)
    (or (second (re-matches #"card:(.+)" s))
        (second (re-matches #"\$_card:(.+)_name" s)))))

(defn visualizer-refs
  "The references of the visualizer settings of a dashboard card: the cards that its column mappings name by text."
  [settings]
  (let [mapping (get-in settings [:visualization :columnValuesMapping])]
    (into #{}
          (comp (mapcat (fn [cols] (when (sequential? cols) cols)))
                (keep (fn [col] (visualizer-card-id (if (map? col) (:sourceId col) col))))
                (map (fn [id] [:card id])))
          (when (map? mapping) (vals mapping)))))

(defn dashcard-refs
  "The references of the dashboard card `dashcard`: its card, its action, the cards of its series, its parameter
  mappings, and its visualization settings."
  [{:keys [card_id action_id series parameter_mappings visualization_settings]}]
  (cond-> (-> (portable/refs parameter_mappings)
              (into (visualization/refs visualization_settings))
              (into (visualizer-refs visualization_settings))
              (into (map (fn [id] [:card id])) (when (sequential? series) series)))
    (some? card_id)   (conj [:card card_id])
    (some? action_id) (conj [:action action_id])))

(defn refs
  "The references of a dashboard: those of its parameters (the card and the field of a values source) and of its
  dashboard cards."
  [_id {:keys [parameters dashcards]}]
  (into (portable/refs parameters)
        (mapcat dashcard-refs)
        (when (sequential? dashcards) (filter map? dashcards))))

;;; ------------------------------------------------------ Codec ------------------------------------------------------

(defn home
  "A root-level dashboard is in `library/`."
  [_item]
  {:dir ["library"]})

(defn decode-attrs
  "The attributes of the file in their one form: each dashboard card in [[normal-dashcard]] form, in
  [[dashcard-order]]."
  [attrs]
  (cond-> attrs
    (vector? (:dashcards attrs)) (update :dashcards (fn [dcs]
                                                      (dashcard-order (get attrs :tabs [])
                                                                      (mapv normal-dashcard dcs))))))

(def spec
  "The spec of the dashboard codec. Not content: the archive columns (scope), the public link and the embedding
  settings (instance-local), `cache_ttl`, the view count and the bookkeeping columns."
  {:kind         :dashboard
   :word         "dashboard"
   :directory?   false
   :home         #'home
   :id-schema    ::snapshot/entity-id
   :name-key     :name
   :place-key    :collection
   :attrs        {:description             {:schema :string}
                  :caveats                 {:schema :string}
                  :points_of_interest      {:schema :string}
                  :collection_position     {:schema :int}
                  :position                {:schema :int}
                  :width                   {:schema [:enum "fixed" "full"] :default "fixed"}
                  :auto_apply_filters      {:schema :boolean :default true}
                  :show_in_getting_started {:schema :boolean :default false}
                  :parameters              {:schema [:vector ::parameter] :default []}
                  :tabs                    {:schema [:vector ::tab] :default []}
                  :dashcards               {:schema [:vector ::dashcard] :default []}}
   :decode-attrs #'decode-attrs
   :refs         #'refs
   :checks       [[:fn {:error/message "the tabs and dashboard cards have distinct ids, each dashboard card is on a tab
                                       of the dashboard, and the dashboard cards are in their order"}
                   (comp #'tabs-fit? :attrs)]]})

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :dashboard."
  (common/codec spec ::item))
