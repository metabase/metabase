(ns metabase-enterprise.library-branching.format.old.dashboard
  "The old format of the kind `:dashboard`: a file of the serdes model Dashboard, with its tabs and dashboard cards
  inside it. The export sorts the parameters by id and gives each its `position`, gives a tab its `position`, a
  dashboard card the serdes path of its tab, and a series its card and `position`."
  (:require
   [metabase-enterprise.library-branching.format.old.common :as common]))

(set! *warn-on-reflection* true)

(def ^:private attribute-keys
  "The dashboard columns that are attributes, by the same names."
  [:description :caveats :points_of_interest :collection_position :position :width :auto_apply_filters
   :show_in_getting_started])

(defn- in-position-order
  "The maps `xs` in the order of their `:position`, each without it, when each has one; else as they are."
  [xs]
  (if (and (sequential? xs) (every? #(and (map? %) (int? (:position %))) xs))
    (mapv #(dissoc % :position) (sort-by :position xs))
    xs))

(defn- tab-id
  "The id of the tab of the serdes path `path` of a tab, `[dashboard tab]`."
  [path]
  (if (vector? path) (peek path) path))

(defn- dashcard
  "The entry of the new format of the dashboard card document `doc`."
  [doc]
  (common/present
   {:id                     (:entity_id doc)
    :card_id                (:card_id doc)
    :action_id              (:action_id doc)
    :dashboard_tab_id       (some-> (:dashboard_tab_id doc) tab-id)
    :row                    (:row doc)
    :col                    (:col doc)
    :size_x                 (:size_x doc)
    :size_y                 (:size_y doc)
    :parameter_mappings     (:parameter_mappings doc)
    ;; The export writes `column_settings: null`; an instance holds no nil setting.
    :visualization_settings (some-> (:visualization_settings doc) common/present)
    :series                 (some->> (:series doc) in-position-order (mapv :card_id))
    :inline_parameters      (:inline_parameters doc)}))

(defn decode
  "`{:doc d}` of dashboard document `doc`, or `{:skip :archived :id id}` for a dashboard in the trash."
  [doc _opts]
  (let [id (:entity_id doc)]
    (if (common/archived? doc)
      {:skip :archived :id id}
      {:doc (common/item-doc :dashboard id
                             (merge (select-keys doc attribute-keys)
                                    {:name       (:name doc)
                                     :collection (:collection_id doc)
                                     :parameters (some-> (:parameters doc) in-position-order)
                                     :tabs       (some->> (:tabs doc)
                                                          in-position-order
                                                          (mapv (fn [tab] {:id (:entity_id tab) :name (:name tab)})))
                                     :dashcards  (some->> (:dashcards doc) (mapv dashcard))}))})))
