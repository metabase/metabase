(ns metabase.transforms.dashboard
  (:require [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards.populate :as populate]
            [metabase.models.table :refer [Table]]
            [metabase.transforms
             [materialize :as materialize]
             [specs :refer [transform-specs]]]
            [metabase.util :as u]
            [toucan.db :as db]))

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
                       :score         100
                       :title         name
                       :visualization [display]
                       :position      0)]
              description (conj {:text     description
                                 :group    group
                                 :width    (- total-width width)
                                 :height   height
                                 :score    100
                                 :position 0})))
          cards))

(defn- card-for-source-table
  [table]
  {:creator_id             api/*current-user-id*
   :dataset_query          {:type     :query
                            :query    {:source-table (u/get-id table)}
                            :database (:db_id table)}
   :name                   (:display_name table)
   :collection_id          nil
   :visualization_settings {}
   :display                :table})

(defn dashboard
  "Create a (transient) dashboard for transform named `transform-name`."
  [transform-name]
  (let [transform-spec              (m/find-first (comp #{transform-name} :name) @transform-specs)
        {steps false provides true} (->> transform-name
                                         materialize/get-collection
                                         (db/select 'Card :collection_id)
                                         (group-by (comp some?
                                                         (-> transform-spec :provides set)
                                                         :name)))
        sources                     (->> steps
                                         (map (comp :source-table :query :dataset_query))
                                         (filter number?)
                                         (map (comp card-for-source-table Table)))]
    (populate/create-dashboard {:cards       (concat (cards->section "sources" sources)
                                                     (cards->section "steps" steps)
                                                     (cards->section "provides" provides))
                                :title       (str transform-name " automatically generated transform")
                                :description (:description transform-spec)
                                :groups      {"sources"  {:title "Sources"}
                                              "steps"    {:title "Steps"}
                                              "provides" {:title "Resulting datasets"}}})))
