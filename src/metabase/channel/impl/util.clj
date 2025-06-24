(ns metabase.channel.impl.util
  (:require
   [hiccup.core :refer [html]]
   [metabase.channel.render.core :as channel.render]
   [metabase.parameters.shared :as shared.params]
   [metabase.system.core :as system]))

(defn render-filters
  "Renders dashboard parameters as a Hiccup table.
   Each parameter is rendered in a separate row with its name and value.
   The `parameters` argument should be a collection of parameter maps."
  [parameters]
  (let [cells (map
               (fn [filter]
                 [:td {:class "filter-cell"
                       :style (channel.render/style {:width "50%"
                                                     :padding "0px"
                                                     :vertical-align "baseline"})}
                  [:table {:cellpadding "0"
                           :cellspacing "0"
                           :width "100%"
                           :height "100%"}
                   [:tr
                    [:td
                     {:style (channel.render/style {:color channel.render/color-text-medium
                                                    :min-width "100px"
                                                    :width "50%"
                                                    :padding "4px 4px 4px 0"
                                                    :vertical-align "baseline"})}
                     (:name filter)]
                    [:td
                     {:style (channel.render/style {:color channel.render/color-text-dark
                                                    :min-width "100px"
                                                    :width "50%"
                                                    :padding "4px 16px 4px 8px"
                                                    :vertical-align "baseline"})}
                     (shared.params/value-string filter (system/site-locale))]]]])
               parameters)
        rows  (partition-all 2 cells)]
    (html
     [:table {:style (channel.render/style {:table-layout    :fixed
                                            :border-collapse :collapse
                                            :cellpadding     "0"
                                            :cellspacing     "0"
                                            :width           "100%"
                                            :font-size       "12px"
                                            :font-weight     700
                                            :margin-top      "8px"})}
      (for [row rows]
        [:tr {} row])])))

(defn remove-inline-parameters
  "Filters out parameters that are inline parameters in the given dashboard parts. Useful for obtaining a list of only
  top-level dashboard parameters."
  [parameters dashboard-parts]
  (let [inline-param-ids (->> dashboard-parts
                              (mapcat :inline_parameters)
                              (map :id)
                              set)]
    (filter #(not (inline-param-ids (:id %))) parameters)))
