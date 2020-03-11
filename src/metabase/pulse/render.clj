(ns metabase.pulse.render
  (:require [clojure.tools.logging :as log]
            [hiccup.core :refer [h]]
            [metabase.pulse.render
             [body :as body]
             [common :as common]
             [image-bundle :as image-bundle]
             [png :as png]
             [style :as style]]
            [metabase.types :as types]
            [metabase.util
             [i18n :refer [trs tru]]
             [urls :as urls]]
            [schema.core :as s]))

(def ^:private ^:const card-width 400)

(def ^:dynamic *include-buttons*
  "Should the rendered pulse include buttons? (default: `false`)"
  false)

(def ^:dynamic *include-title*
  "Should the rendered pulse include a title? (default: `false`)"
  false)

(s/defn ^:private make-title-if-needed :- (s/maybe common/RenderedPulseCard)
  [render-type card]
  (when *include-title*
    (let [image-bundle (when *include-buttons*
                         (image-bundle/external-link-image-bundle render-type))]
      {:attachments (when image-bundle
                      (image-bundle/image-bundle->attachment image-bundle))
       :content     [:table {:style (style/style {:margin-bottom   :8px
                                                  :border-collapse :collapse
                                                  :width           :100%})}
                     [:tbody
                      [:tr
                       [:td {:style (style/style {:padding :0
                                                  :margin  :0})}
                        [:span {:style (style/style (style/header-style))}
                         (-> card :name h)]]
                       [:td {:style (style/style {:text-align :right})}
                        (when *include-buttons*
                          [:img {:style (style/style {:width :16px})
                                 :width 16
                                 :src   (:image-src image-bundle)}])]]]]})))

(defn- number-field?
  [{base-type :base_type, special-type :special_type}]
  (some #(isa? % :type/Number) [base-type special-type]))

(defn detect-pulse-chart-type
  "Determine the pulse (visualization) type of a `card`, e.g. `:scalar` or `:bar`."
  [{display-type :display, card-name :name, :as card} {:keys [cols rows], :as data}]
  (let [col-sample-count          (delay (count (take 3 cols)))
        row-sample-count          (delay (count (take 2 rows)))
        [col-1-rowfn col-2-rowfn] (common/graphing-column-row-fns card data)
        col-1                     (delay (col-1-rowfn cols))
        col-2                     (delay (col-2-rowfn cols))]
    (letfn [(chart-type [tyype reason & args]
              (log/tracef "Detected chart type %s for Card %s because %s"
                          tyype (pr-str card-name) (apply format reason args))
              tyype)
            (col-description [{col-name :name, base-type :base_type}]
              (format "%s (%s)" (pr-str col-name) base-type))]
      (cond
        (or (empty? rows)
            ;; Many aggregations result in [[nil]] if there are no rows to aggregate after filters
            (= [[nil]] (-> data :rows)))
        (chart-type :empty "there are no rows in results")

        (#{:pin_map :state :country} display-type)
        (chart-type nil "display-type is %s" display-type)

        (= @col-sample-count @row-sample-count 1)
        (chart-type :scalar "result has one row and one column")

        (and (= @col-sample-count 2)
             (> @row-sample-count 1)
             (types/temporal-field? @col-1)
             (number-field? @col-2))
        (chart-type :sparkline "result has 2 cols (%s (temporal) and %s (number)) and > 1 row" (col-description @col-1) (col-description @col-2))

        (and (= @col-sample-count 2)
             (number-field? @col-2))
        (chart-type :bar "result has two cols (%s and %s (number))" (col-description @col-1) (col-description @col-2))

        :else
        (chart-type :table "no other chart types match")))))

(defn- is-attached?
  [card]
  ((some-fn :include_csv :include_xls) card))

(s/defn ^:private render-pulse-card-body :- common/RenderedPulseCard
  [render-type timezone-id :- (s/maybe s/Str) card {:keys [data error], :as results}]
  (try
    (when error
      (throw (ex-info (tru "Card has errors: {0}" error) results)))
    (let [chart-type (or (detect-pulse-chart-type card data)
                         (when (is-attached? card)
                           :attached)
                         :unknown)]
      (log/debug (trs "Rendering pulse card with chart-type {0} and render-type {1}" chart-type render-type))
      (body/render chart-type render-type timezone-id card data))
    (catch Throwable e
      (log/error e (trs "Pulse card render error"))
      (body/render :error nil nil nil nil))))

(defn- card-href
  [card]
  (h (urls/card-url (:id card))))

(s/defn ^:private render-pulse-card :- common/RenderedPulseCard
  "Render a single `card` for a `Pulse` to Hiccup HTML. `result` is the QP results."
  [render-type timezone-id :- (s/maybe s/Str) card results]
  (let [{title :content, title-attachments :attachments}     (make-title-if-needed render-type card)
        {pulse-body :content, body-attachments :attachments} (render-pulse-card-body render-type timezone-id card results)]
    {:attachments (merge title-attachments body-attachments)
     :content     [:a {:href   (card-href card)
                       :target "_blank"
                       :style  (style/style
                                (style/section-style)
                                {:margin          :16px
                                 :margin-bottom   :16px
                                 :display         :block
                                 :text-decoration :none})}
                   title
                   pulse-body]}))

(defn render-pulse-card-for-display
  "Same as `render-pulse-card` but isn't intended for an email, rather for previewing so there is no need for
  attachments"
  [timezone-id card results]
  (:content (render-pulse-card :inline timezone-id card results)))

(s/defn render-pulse-section :- common/RenderedPulseCard
  "Render a single Card section of a Pulse to a Hiccup form (representating HTML)."
  [timezone-id {card :card {:keys [data] :as result} :result}]
  (let [{:keys [attachments content]} (binding [*include-title* true]
                                        (render-pulse-card :attachment timezone-id card result))]
    {:attachments attachments
     :content     [:div {:style (style/style (merge
                                              {:margin-top    :10px
                                               :margin-bottom :20px}
                                              ;; Don't include the border on cards rendered with a table as the table
                                              ;; will be to larger and overrun the border
                                              (when-not (= :table (detect-pulse-chart-type card data))
                                                {:border           "1px solid #dddddd"
                                                 :border-radius    :2px
                                                 :background-color :white
                                                 :width            "500px !important"
                                                 :box-shadow       "0 1px 2px rgba(0, 0, 0, .08)"})))}
                   content]}))

(s/defn render-pulse-card-to-png :- bytes
  "Render a `pulse-card` as a PNG. `data` is the `:data` from a QP result (I think...)"
  [timezone-id :- (s/maybe s/Str) pulse-card result]
  (png/render-html-to-png (render-pulse-card :inline timezone-id pulse-card result) card-width))
