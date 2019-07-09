(ns metabase.transforms.dashboard
  (:require [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.models.collection :refer [Collection]]
            [metabase.transforms.materialize :as materialize]
            [metabase.util :as u]
            [toucan.db :as db]))

(def ^:private ^:const ^Long width 12)
(def ^:private ^:const ^Long total-width 18)
(def ^:private ^:const ^Long height 6)

(defn dashboard
  "Create a (transient) dashboard for transform."
  [transform-name]
  (let [collection-id (materialize/get-collection transform-name)
        title         (str transform-name " automatically generated transform")]
    (reduce (fn [dashboard [idx card]]
              (update dashboard :ordered_cards concat
                      [{:col                    0
                        :row                    (* idx (inc height))
                        :sizeX                  width
                        :sizeY                  height
                        :card                   card
                        :card_id                (u/get-id card)
                        :visualization_settings {}
                        :id                     (gensym)}
                       {:col                    width
                        :row                    (* idx (inc height))
                        :sizeX                  (- total-width width)
                        :sizeY                  height
                        :card                   nil
                        :visualization_settings {:text         (:description card)
                                                 :virtual_card {:name                   nil
                                                                :display                :text
                                                                :dataset_query          {}
                                                                :visualization_settings {}}}
                        :creator_id             api/*current-user-id*
                        :id                     (gensym)}]))
            {:name              title
             :transient_name    title
             :description       (-> collection-id Collection :description)
             :creator_id        api/*current-user-id*
             :parameters        []}
            (m/indexed (db/select 'Card :collection_id collection-id)))))
