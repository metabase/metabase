(ns metabase.pulse.render.test-util
  (:require [metabase.pulse.render :as render]
            [metabase.pulse.render.body :as body]
            [metabase.pulse.render.js-svg :as js-svg]
            [metabase.pulse.render.png :as png])
  (:import org.apache.batik.anim.dom.SVGOMDocument
           [org.graalvm.polyglot Context Value]
           [org.w3c.dom Element Node]))

(def test-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased"]
    :graph.dimensions ["Price"]
    :table.column_formatting [{:columns       ["a"]
                               :type          :single
                               :operator      ">"
                               :value         5
                               :color         "#ff0000"
                               :highlight_row true}
                              {:columns       ["c"]
                               :type          "range"
                               :min_type      "custom"
                               :min_value     3
                               :max_type      "custom"
                               :max_value     9
                               :colors        ["#00ff00" "#0000ff"]}]}})

(def test-combo-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased", "NumKazoos"]
    :graph.dimensions ["Price"]}})

(def test-stack-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased", "NumKazoos"]
    :graph.dimensions ["Price"]
    :stackable.stack_type "stack"}})

(def test-combo-card-multi-x
  {:visualization_settings
   {:graph.metrics ["NumKazoos"]
    :graph.dimensions ["Price" "NumPurchased"]}})

(defn- sin-gen
  []
  (mapv (fn [t] [(* 100.0 t) (* 100.0 (Math/sin t))]) (range 0 (* 2 Math/PI) (/ Math/PI 12))))

(defn- cos-gen
  []
  (mapv (fn [t] [(* 100.0 t) (* 100.0 (Math/cos t))]) (range 0 (* 2 Math/PI) (/ Math/PI 12))))

(defn- minimal-card
  "Create a map that contains the minimum required data to actually render something with static-viz.
  `dimensions` is a vector of strings for the X axis. Should only contain 1 string.
  `metrics` is a vector of strings for the Y axes. Should contain at least 1 string, but can contain multiple
  if the chart is `:combo`, or a multi-series `:line`, `:area`, or `:bar` chart."
  [display-type dimensions metrics]
  {:display display-type
   :visualization_settings
   {:graph.metrics    metrics
    :graph.dimensions dimensions}})

(defn- generate-series-settings
  []
  {:color (rand-nth ["red" "green" "blue" "cyan" "magenta" "yellow" "slategray" "honeydew" "brown"])
   :title (apply str (take (+ 3 (rand-int 12)) (repeatedly #(rand-nth "abcdefghijklmnopqrstuvwxyz"))))})

(defn add-custom-series-settings
  "Add series-specific settings like :color and :title to each series."
  [card-and-data series-settings-maps]
  (let [series-keys     (map keyword (get-in card-and-data [:card :visualization_settings :graph.metrics]))
        series-settings (zipmap series-keys (repeatedly generate-series-settings))]
    (update-in card-and-data [:data :viz-settings :series_settings] merge
               (merge-with merge
                series-settings
                (zipmap series-keys series-settings-maps)))))

(defn- minimal-data
  "Generate a minimal data map from a given card map, for use with static-viz rendering tests."
  [{:keys [visualization_settings]}]
  (let [dimensions (:graph.dimensions visualization_settings)
        metrics    (:graph.metrics visualization_settings)]
    (-> {:viz-settings {}
         :cols         (mapv (fn [metric]
                               {:name         metric
                                :display_name metric
                                :settings     nil
                                :base_type    :type/Number}) (concat dimensions metrics))
         :rows         (if (= 2 (count metrics))
                         (map #(conj %1 (second %2)) (sin-gen) (cos-gen))
                         (sin-gen))}
        (add-custom-series-settings (repeat (count metrics) {})))))

(defn- minimal-card-and-data
  ([display-type]
   (minimal-card-and-data display-type ["X"] ["Y1"]))
  ([display-type dimensions metrics]
   (let [card (minimal-card display-type dimensions metrics)]
     {:card card
      :data (minimal-data card)})))

(defn add-goal-line-settings
  [card-and-data goal-settings]
  (update-in card-and-data [:data :viz-settings] merge
             {:graph.show_goal  true
              :graph.goal_label "Goal"
              :graph.goal_value 0}
             goal-settings))

(defn add-axes-label-settings
  [card-and-data axes-label-settings]
  (update-in card-and-data [:data :viz-settings] merge
             {:graph.y_axis.title_text     "Y"
              :graph.x_axis.labels_enabled true
              :graph.x_axis.title_text     "X"
              :graph.y_axis.labels_enabled true}
             axes-label-settings))

(defn add-show-graph-values-settings
  [card-and-data show-values-settings]
  (update-in card-and-data [:data :viz-settings] merge
             {:graph.show_values  true}
             show-values-settings))

(defn add-column-types
  "Add keys like :semantic_type and :effective_type"
  [card-and-data columns-settings-maps]
  (prn "NOT IMPLEMENTED YET")
  card-and-data)

(defn add-insights
  "Add data to the :insights key of the data. Useful for testing smart-scalar renders"
  [card-and-data insights]
  (prn "NOT IMPLEMENTED YET")
  card-and-data)

#_(merge some-data
         {:metabase.shared.models.visualization-settings/column-settings
          {#:metabase.shared.models.visualization-settings{:column-name "avg"}
           #:metabase.shared.models.visualization-settings{:number-style "decimal"}}})

(defn add-shared-column-settings
  "Add shared visualization settings to the data."
  [card-and-data insights]
  (prn "NOT IMPLEMENTED YET")
  card-and-data)

#_(update-in some-data
             [:viz-settings :metabase.shared.models.visualization-settings/global-column-settings] merge
             #:type{:Temporal #:metabase.shared.models.visualization-settings{:date-style "MMMM D, YYYY"}})

(defn add-shared-column-viz-settings
  "Add shared column visualization settings to the data."
  [card-and-data insights]
  (prn "NOT IMPLEMENTED YET")
  card-and-data)

(defn- render-viz-data
  [{:keys [card data]}]
  (with-redefs [metabase.pulse.render.js-svg/svg-string->bytes
                identity
                metabase.pulse.render.image-bundle/make-image-bundle
                (fn [_ s]
                  {:image-src   s
                   :render-type :inline})]
    (let [render (body/render (render/detect-pulse-chart-type card nil data) :inline "UTC" card nil data)]
      (->> render
           :content
           (tree-seq vector? (fn [node] (filter vector? node)))
           (filter #(= :img (first %)))
           first
           last
           :src))))

(def parse-svg #'js-svg/parse-svg-string)
(def svg-string->bytes #'js-svg/svg-string->bytes)

(defn document-tag-hiccup [^SVGOMDocument document]
  (letfn [(tree [^Node node]
            (into [(.getNodeName node)]
                  (if (instance? org.apache.batik.dom.GenericText node)
                    [(.getWholeText node)]
                    (map tree
                         (when (instance? Element node)
                           (let [children (.getChildNodes node)]
                             (reduce (fn [cs i] (conj cs (.item children i)))
                                     [] (range (.getLength children)))))))))]
    (tree (.getDocumentElement document))))

(def display-type->static-viz-chart-type
  {:pin_map nil
   :state nil
   :country nil
   :line :line ;; uses combo in js-svg
   :area :area ;; uses combo
   :bar :bar ;; uses combo
   :combo :combo
   :pie :categorical/donut
   :funnel :funnel
   :progress :progress
   :scalar :scalar
   :smartscalar :smartscalar ;; this is 'trend' in the UI
   :gauge :scalar
   :table :table
   ;; these aren't properly handled yet, should fall to :table, but sometimes incorrectly go to :line
   :scatter :table
   :row :bar ;; should probably do this, but doesn't yet
   :list :table
   :pivot :table})

(def display-types (set (keys display-type->static-viz-chart-type)))

(def can-have-goal-line
  #{:scatter
    :line :area :bar :combo})

(def can-have-multiple-y-series
  #{:scatter
    :line :area :bar :combo})

(def can-stack-multiple-y-series
  #{:area :bar :combo})




;; todo: make this a multi-method dispatching on :display-type, or 'scenario' or something
(defmulti create-test-viz-data
  "WIP. Create a map of card and data mimicking a valid card and dataset-query result according to a `visualization-scenario` map.

  A `visualization-scenario` is a set of keys dictating the various visualization settings possible."
  (fn
    ([] nil)
    ([scenario] scenario)))

(defmethod create-test-viz-data :default
  []
  (-> (minimal-card-and-data :bar ["X"] ["Y1"])))

(defmethod create-test-viz-data #{:multi-series}
  [_]
  (-> (minimal-card-and-data :bar ["X"] ["Y1" "Y2"])))

(defn render-as-png
  [viz-data]
  (let [svg-string (render-viz-data viz-data)]
    (dev.render-png/open-png-bytes (svg-string->bytes svg-string))))

(defn rendered-nodes
  [viz-data desired-node-tags]
  (let [svg-string (render-viz-data viz-data)
        svg-hiccup (-> svg-string parse-svg document-tag-hiccup)]
    (->> svg-hiccup (tree-seq vector? rest) (filter #(desired-node-tags (first %))))))

(defn asdf
  []
  (let [data (-> (minimal-card-and-data :bar ["x-axis label"] ["y-axis label"])
                 (add-goal-line-settings {}#_{:graph.show_goal true
                                              :graph.goal_label "My Goal"
                                              :graph.goal_value 0}))]
    (render-as-png data)
    (rendered-nodes data #{"#text"})))

#_(def some-card
  {:display :line
   :visualization_settings
   {:graph.metrics               ["avg_2" "avg"]
    :graph.dimensions            ["CATEGORY"]}})
#_(def some-data
  {:cols
   [{:semantic_type     :type/Category
     :name              "CATEGORY"
     :settings          nil
     :source            :breakout
     :field_ref         [:field 26 nil]
     :effective_type    :type/Text
     :id                26
     :display_name      "Category"
     :base_type         :type/Text}
    {:base_type      :type/Float
     :semantic_type  nil
     :settings       nil
     :name           "avg"
     :display_name   "Average of Price"
     :source         :aggregation
     :field_ref      [:aggregation 0]
     :effective_type :type/Float}
    {:base_type      :type/Float
     :semantic_type  :type/Score
     :settings       nil
     :name           "avg_2"
     :display_name   "Average of Rating"
     :source         :aggregation
     :field_ref      [:aggregation 1]
     :effective_type :type/Float}]
   :viz-settings
   {:graph.show_goal             false,
    :graph.y_axis.title_text     " ",
    :graph.show_values           false,
    :metabase.shared.models.visualization-settings/column-settings
    {#:metabase.shared.models.visualization-settings{:column-name "avg"}
     #:metabase.shared.models.visualization-settings{:number-style "decimal"}},
    :graph.x_axis.labels_enabled true,
    :graph.goal_label            "Goal",
    :stackable.stack_display     "bar",
    :graph.x_axis.title_text     "",
    :graph.y_axis.labels_enabled true,
    :graph.goal_value            4,
    :graph.metrics               ["avg_2" "avg"],
    :metabase.shared.models.visualization-settings/global-column-settings
    #:type{:Temporal #:metabase.shared.models.visualization-settings{:date-style "MMMM D, YYYY"}},
    :series_settings             {:avg {:color "#A989C5", :title "$PRICE$"}, :avg_2 {:color "#999AC4", :title "*RATING*"}},
    :graph.dimensions            ["CATEGORY"]}
   :insights         nil
   :rows
   [["Doohickey" 52.04430453374854 3.7285714285714286]
    ["Gadget" 56.96577359222534 3.432075471698113]
    ["Gizmo" 55.58662658036943 3.6372549019607834]
    ["Widget" 57.57991087370232 3.153703703703704]]})
