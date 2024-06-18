(ns metabase.xrays.transforms.dashboard
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.models.table :refer [Table]]
   [metabase.util :as u]
   [metabase.xrays.automagic-dashboards.populate :as populate]
   [metabase.xrays.transforms.materialize :as tf.materialize]
   [metabase.xrays.transforms.specs :refer [transform-specs]]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(def ^:private ^:const ^Long width 12)
(def ^:private ^:const ^Long total-width 18)
(def ^:private ^:const ^Long height 4)

(defn- cards->section
  "Build a section of cards and format them according to what the automagic dashboards code expects."
  [group cards]
  (mapcat (fn [{:keys [name description display] :as card}]
            (cond-> [(assoc card
                       :group         group
                       :width         width
                       :height        height
                       :card-score    100
                       :title         name
                       :visualization [display]
                       :position      0)]
              description (conj {:text       description
                                 :group      group
                                 :width      (- total-width width)
                                 :height     height
                                 :card-score 100
                                 :position   0})))
          cards))

(defn- card-for-source-table
  [table]
  {:pre [(map? table)]}
  {:creator_id             api/*current-user-id*
   :dataset_query          {:type     :query
                            :query    {:source-table (u/the-id table)}
                            :database (:db_id table)}
   :name                   (:display_name table)
   :collection_id          nil
   :visualization_settings {}
   :display                :table})

(defn- sources [steps]
  (when-let [table-ids (->> steps
                            (map (comp :source-table :query :dataset_query))
                            (filter number?)
                            not-empty)]
    (let [table-id->table (t2/select-pk->fn t2.realize/realize Table :id [:in (set table-ids)])]
      (mapv (fn [table-id]
              (let [table (get table-id->table table-id)]
                (card-for-source-table table)))
            table-ids))))

(defn dashboard
  "Create a (transient) dashboard for transform named `transform-name`."
  [transform-name]
  (let [transform-spec              (m/find-first (comp #{transform-name} :name) @transform-specs)
        {steps false provides true} (->> transform-name
                                         tf.materialize/get-collection
                                         (t2/select 'Card :collection_id)
                                         (group-by (comp some?
                                                         (-> transform-spec :provides set)
                                                         :name)))
        sources                     (sources steps)]
    (populate/create-dashboard {:cards       (concat (cards->section "sources" sources)
                                                     (cards->section "steps" steps)
                                                     (cards->section "provides" provides))
                                :title       (str transform-name " automatically generated transform")
                                :description (:description transform-spec)
                                :groups      {"sources"  {:title "Sources"}
                                              "steps"    {:title "Steps"}
                                              "provides" {:title "Resulting datasets"}}})))
