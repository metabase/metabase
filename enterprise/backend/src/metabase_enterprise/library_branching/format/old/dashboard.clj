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

(defn- metric-row-id
  "The row id that the link card of the visualization settings `settings` holds for a metric, or nil. The export of
  master converts the id of a link card only for the models that it knows, and \"metric\" is not one."
  [settings]
  (let [{:keys [model id]} (when (map? settings) (get-in settings [:link :entity]))]
    (when (and (= "metric" model) (int? id))
      id)))

(defn- with-metric-identity
  "The visualization settings `settings` with the entity id of `card-ids` (`{row-id entity-id}`) in place of the
  [[metric-row-id]] of its link card, when `card-ids` has it."
  [card-ids settings]
  (if-let [eid (some->> (metric-row-id settings) (get card-ids))]
    (assoc-in settings [:link :entity :id] eid)
    settings))

(defn- dashcard-docs
  [doc]
  (let [dcs (:dashcards doc)]
    (when (sequential? dcs)
      (filter map? dcs))))

(defn metric-row-ids
  "The [[metric-row-id]]s of the link cards of dashboard document `doc`, in the order of its dashboard cards."
  [doc]
  (keep (comp metric-row-id :visualization_settings) (dashcard-docs doc)))

(defn resolve-card-ids
  "`opts` with `:card-ids` as `{row-id entity-id}`: `((:card-ids opts) ids)`, where `ids` is the sorted vector of the
  distinct [[metric-row-ids]] of the dashboard documents `docs` that are not in the trash. `{}` when there is no such
  row id or no `:card-ids`; then `(:card-ids opts)` is not called."
  [opts docs]
  (let [ids (vec (sort (distinct (mapcat metric-row-ids (remove common/archived? docs)))))
        f   (:card-ids opts)]
    (assoc opts :card-ids (if (and f (seq ids)) (f ids) {}))))

(defn- dashcard
  "The entry of the new format of the dashboard card document `doc`, with the card ids `card-ids`."
  [card-ids doc]
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
    :visualization_settings (some->> (:visualization_settings doc) common/present (with-metric-identity card-ids))
    :series                 (some->> (:series doc) in-position-order (mapv :card_id))
    :inline_parameters      (:inline_parameters doc)}))

(defn- unknown-row-ids
  "The finding of dashboard `id` whose link cards hold the row ids `row-ids` of no card on the instance."
  [id row-ids]
  {:type    :unknown-row-id
   :reason  (str "The dashboard " id " links to the metrics of the row ids " (pr-str row-ids)
                 ", and no card on this instance has such a row id.")
   :id      id
   :row-ids row-ids})

(defn decode
  "`{:doc d}` of dashboard document `doc`, or `{:skip :archived :id id}` for a dashboard in the trash. The row id of
  a metric that a link card holds is the entity id of `(:card-ids opts)` (opts of [[resolve-card-ids]]); with no
  entity id for a row id, `{:finding f}`, of type `:unknown-row-id`, with the dashboard as `:id` and the row ids
  as `:row-ids`."
  [doc {:keys [card-ids]}]
  (let [id      (:entity_id doc)
        unknown (vec (distinct (remove #(contains? card-ids %) (metric-row-ids doc))))]
    (cond
      (common/archived? doc) {:skip :archived :id id}
      (seq unknown)          {:finding (unknown-row-ids id unknown)}
      :else
      {:doc (common/item-doc :dashboard id
                             (merge (select-keys doc attribute-keys)
                                    {:name       (:name doc)
                                     :collection (:collection_id doc)
                                     :parameters (some-> (:parameters doc) in-position-order)
                                     :tabs       (some->> (:tabs doc)
                                                          in-position-order
                                                          (mapv (fn [tab] {:id (:entity_id tab) :name (:name tab)})))
                                     :dashcards  (some->> (:dashcards doc) (mapv (partial dashcard card-ids)))}))})))
