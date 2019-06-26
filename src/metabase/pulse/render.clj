(ns metabase.pulse.render
  (:require [clojure.tools.logging :as log]
            [hiccup.core :refer [h]]
            [metabase.pulse.render
             [body :as body]
             [common :as common]
             [image-bundle :as image-bundle]
             [png :as png]
             [style :as style]]
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

(defn- is-attached?
  [card]
  (or (:include_csv card)
      (:include_xls card)))

(s/defn ^:private render-pulse-card-body :- common/RenderedPulseCard
  [render-type timezone card {:keys [data error], :as results}]
  (try
    (when error
      (let [^String msg (str (tru "Card has errors: {0}" error))]
        (throw (ex-info msg results))))
    (let [render-type (or (body/detect-pulse-card-type card data)
                          (when (is-attached? card)
                            :attached)
                          :unknown)]
      (body/render render-type timezone card data))
    (catch Throwable e
      (log/error e (trs "Pulse card render error"))
      (body/render :error timezone card e))))

(defn- card-href
  [card]
  (h (urls/card-url (:id card))))

(s/defn ^:private render-pulse-card :- common/RenderedPulseCard
  "Render a single `card` for a `Pulse` to Hiccup HTML. `result` is the QP results."
  [render-type timezone card results]
  (let [{title :content title-attachments :attachments} (make-title-if-needed render-type card)
        {pulse-body :content body-attachments :attachments} (render-pulse-card-body render-type timezone card results)]
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
  [timezone card results]
  (:content (render-pulse-card :inline timezone card results)))

(s/defn render-pulse-section :- common/RenderedPulseCard
  "Render a specific section of a Pulse, i.e. a single Card, to Hiccup HTML."
  [timezone {card :card {:keys [data] :as result} :result}]
  (let [{:keys [attachments content]} (binding [*include-title* true]
                                        (render-pulse-card :attachment timezone card result))]
    {:attachments attachments
     :content     [:div {:style (style/style (merge
                                              {:margin-top    :10px
                                               :margin-bottom :20px}
                                              ;; Don't include the border on cards rendered with a table as the table
                                              ;; will be to larger and overrun the border
                                              (when-not (= :table (body/detect-pulse-card-type card data))
                                                {:border           "1px solid #dddddd"
                                                 :border-radius    :2px
                                                 :background-color :white
                                                 :width            "500px !important"
                                                 :box-shadow       "0 1px 2px rgba(0, 0, 0, .08)"})))}
                   content]}))

(defn render-pulse-card-to-png
  "Render a `pulse-card` as a PNG. `data` is the `:data` from a QP result (I think...)"
  ^bytes [timezone pulse-card result]
  (png/render-html-to-png (render-pulse-card :inline timezone pulse-card result) card-width))
