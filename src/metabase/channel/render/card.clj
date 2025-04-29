(ns metabase.channel.render.card
  (:require
   [hiccup.core :refer [h]]
   [metabase.channel.render.body :as body]
   [metabase.channel.render.image-bundle :as image-bundle]
   [metabase.channel.render.png :as png]
   [metabase.channel.render.style :as style]
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.markdown :as markdown]
   [metabase.util.urls :as urls]
   [toucan2.core :as t2]))

;;; I gave these keys below namespaces to make them easier to find usages for but didn't use `metabase.channel.render` so
;;; we can keep this as an internal namespace you don't need to know about outside of the module.
(mr/def ::options
  "Options for Pulse (i.e. Alert/Dashboard Subscription) rendering."
  [:map
   [:channel.render/include-buttons?     {:description "default: false", :optional true} :boolean]
   [:channel.render/include-title?       {:description "default: false", :optional true} :boolean]
   [:channel.render/include-description? {:description "default: false", :optional true} :boolean]])

(defn- card-href
  [card]
  (h (urls/card-url (u/the-id card))))

(mu/defn- make-title-if-needed :- [:maybe ::body/RenderedPartCard]
  [render-type card dashcard options :- [:maybe ::options]]
  (when (:channel.render/include-title? options)
    (let [card-name    (or (-> dashcard :visualization_settings :card.title)
                           (-> card :name))
          image-bundle (when (:channel.render/include-buttons? options)
                         (image-bundle/external-link-image-bundle render-type))]
      {:attachments (when image-bundle
                      (image-bundle/image-bundle->attachment image-bundle))
       :content     [:table {:style (style/style {:margin-bottom   :2px
                                                  :border-collapse :collapse
                                                  :width           :100%})}
                     [:tbody
                      [:tr
                       [:td {:style (style/style {:padding :0
                                                  :margin  :0})}
                        [:a {:style  (style/style (style/header-style))
                             :href   (card-href card)
                             :target "_blank"
                             :rel    "noopener noreferrer"}
                         (h card-name)]]
                       [:td {:style (style/style {:text-align :right})}
                        (when (:channel.render/include-buttons? options)
                          [:img {:style (style/style {:width :16px})
                                 :width 16
                                 :src   (:image-src image-bundle)}])]]]]})))

(mu/defn- make-description-if-needed :- [:maybe ::body/RenderedPartCard]
  [dashcard card options :- [:maybe ::options]]
  (when (:channel.render/include-description? options)
    (when-let [description (or (get-in dashcard [:visualization_settings :card.description])
                               (:description card))]
      {:attachments {}
       :content [:div {:style (style/style {:color style/color-text-medium
                                            :font-size :12px
                                            :margin-bottom :8px})}
                 (markdown/process-markdown description :html)]})))

(defn detect-pulse-chart-type
  "Determine the pulse (visualization) type of a `card`, e.g. `:scalar` or `:bar`."
  [{display-type :display card-name :name} maybe-dashcard {:keys [cols rows] :as data}]
  (let [col-sample-count          (delay (count (take 3 cols)))
        row-sample-count          (delay (count (take 2 rows)))]
    (letfn [(chart-type [tyype reason & args]
              (log/tracef "Detected chart type %s for Card %s because %s"
                          tyype (pr-str card-name) (apply format reason args))
              tyype)]
      (cond
        (or (empty? rows)
            ;; Many aggregations result in [[nil]] if there are no rows to aggregate after filters
            (= [[nil]] (-> data :rows)))
        (chart-type :empty "there are no rows in results")

        (#{:pin_map :state :country} display-type)
        (chart-type nil "display-type is %s" display-type)

        (and (some? maybe-dashcard)
             (pos? (count (dashboard-card/dashcard->multi-cards maybe-dashcard))))
        (chart-type :javascript_visualization "result has multiple card semantics, a multiple chart")

        ;; for scalar/smartscalar, the display-type might actually be :line, so we can't have line above
        (and (not (contains? #{:progress :gauge} display-type))
             (= @col-sample-count @row-sample-count 1))
        (chart-type :scalar "result has one row and one column")

        (#{:scalar
           :row
           :progress
           :gauge
           :table
           :funnel} display-type)
        (chart-type display-type "display-type is %s" display-type)

        (#{:smartscalar
           :sankey
           :scalar
           :pie
           :scatter
           :waterfall
           :line
           :area
           :bar
           :combo} display-type)
        (chart-type :javascript_visualization "display-type is javascript_visualization")

        :else
        (chart-type :table "no other chart types match")))))

(defn- is-attached?
  [card]
  ((some-fn :include_csv :include_xls) card))

(mu/defn- render-pulse-card-body :- ::body/RenderedPartCard
  [render-type
   timezone-id :- [:maybe :string]
   card
   dashcard
   {:keys [data error] :as results}]
  (try
    (when error
      (throw (ex-info (tru "Card has errors: {0}" error) (assoc results :card-error true))))
    (let [chart-type (or (detect-pulse-chart-type card dashcard data)
                         (when (is-attached? card)
                           :attached)
                         :unknown)]
      (log/debugf "Rendering pulse card with chart-type %s and render-type %s" chart-type render-type)
      (body/render chart-type render-type timezone-id card dashcard data))
    (catch Throwable e
      (if (:card-error (ex-data e))
        (do
          (log/error e "Pulse card query error")
          (body/render :card-error nil nil nil nil nil))
        (do
          (log/error e "Pulse card render error")
          (body/render :render-error nil nil nil nil nil))))))

(def logo [:svg {:width "81" :height "20" :viewBox "0 0 65 16" :fill "none"}
 [:g {:clip-path "url(#a)"}
  [:path
   {:d "M26.925 3.992v8.12h-1.483V7.126c0-.104.002-.216.006-.336.008-.119.019-.24.034-.363L23.16 10.83a.623.623 0 0 1-.587.364h-.236a.667.667 0 0 1-.346-.09.667.667 0 0 1-.24-.274L19.416 6.41c.011.13.02.257.028.38.008.12.011.232.011.336v4.986h-1.482v-8.12h1.275c.071 0 .135.002.19.006a.418.418 0 0 1 .146.033.273.273 0 0 1 .117.079.523.523 0 0 1 .107.145l2.271 4.332c.071.13.136.265.196.403.063.138.123.28.179.425.056-.15.114-.295.173-.437.064-.141.13-.277.202-.408l2.254-4.315a.523.523 0 0 1 .107-.145.324.324 0 0 1 .117-.079.462.462 0 0 1 .146-.033c.056-.004.12-.006.195-.006h1.276ZM31.664 8.547c0-.16-.022-.313-.067-.459a1.033 1.033 0 0 0-.202-.386.961.961 0 0 0-.352-.263 1.18 1.18 0 0 0-.51-.1c-.368 0-.657.104-.866.313-.21.209-.345.507-.409.895h2.406Zm-2.428.918c.048.541.201.937.459 1.187.26.25.6.375 1.018.375.212 0 .395-.025.548-.073.157-.052.293-.108.409-.168.119-.063.225-.12.318-.168a.599.599 0 0 1 .286-.078.33.33 0 0 1 .28.134l.447.56c-.164.19-.345.348-.543.475a3.11 3.11 0 0 1-.615.297c-.213.07-.427.12-.643.145-.217.03-.426.045-.627.045-.403 0-.78-.065-1.13-.196a2.643 2.643 0 0 1-.912-.587 2.804 2.804 0 0 1-.61-.968c-.149-.385-.223-.83-.223-1.338a3.2 3.2 0 0 1 .19-1.108c.13-.347.317-.65.56-.907.242-.257.536-.46.883-.61.347-.153.739-.23 1.175-.23.37 0 .709.06 1.018.18a2.2 2.2 0 0 1 1.332 1.337c.126.325.19.696.19 1.114 0 .116-.006.211-.017.286a.507.507 0 0 1-.056.179.219.219 0 0 1-.106.095.56.56 0 0 1-.174.022h-3.457ZM35.706 12.202c-.26 0-.492-.038-.694-.112a1.413 1.413 0 0 1-.509-.33 1.385 1.385 0 0 1-.313-.515 2.051 2.051 0 0 1-.106-.683V7.45h-.543a.312.312 0 0 1-.212-.078c-.056-.052-.084-.13-.084-.235v-.604l.923-.168.313-1.495c.041-.167.155-.251.341-.251h.806v1.757h1.488V7.45h-1.488v3.011c0 .16.037.287.112.38.078.094.188.14.33.14a.701.701 0 0 0 .19-.022c.052-.018.097-.037.134-.056l.101-.056a.205.205 0 0 1 .1-.028.18.18 0 0 1 .113.034c.03.019.06.052.09.1l.463.74a2.264 2.264 0 0 1-.721.38 2.722 2.722 0 0 1-.834.129ZM40.735 9.7c-.377.019-.69.052-.94.1a2.25 2.25 0 0 0-.599.18.797.797 0 0 0-.313.257.56.56 0 0 0-.09.308c0 .224.062.383.185.476.127.093.302.14.526.14.258 0 .48-.045.666-.134.19-.094.378-.237.565-.431V9.7ZM37.59 7.143a3.41 3.41 0 0 1 1.124-.683 3.78 3.78 0 0 1 1.332-.23c.343 0 .649.056.917.168a1.998 1.998 0 0 1 1.124 1.18c.102.277.152.58.152.908v3.626h-.705a.737.737 0 0 1-.336-.061c-.074-.041-.136-.127-.184-.258l-.123-.37a5.2 5.2 0 0 1-.426.337 2.52 2.52 0 0 1-.42.246 2.305 2.305 0 0 1-.47.145 2.78 2.78 0 0 1-.553.05c-.254 0-.485-.033-.694-.1a1.559 1.559 0 0 1-.542-.297 1.36 1.36 0 0 1-.347-.498 1.768 1.768 0 0 1-.123-.682c0-.213.054-.426.162-.638.108-.213.293-.405.554-.577.265-.175.615-.319 1.051-.43.44-.116.99-.182 1.65-.197v-.296c0-.362-.076-.627-.229-.795-.152-.172-.373-.257-.66-.257-.212 0-.39.026-.531.078a2.353 2.353 0 0 0-.375.162c-.104.056-.203.11-.297.163a.693.693 0 0 1-.324.072.465.465 0 0 1-.274-.078.811.811 0 0 1-.18-.196l-.273-.492ZM44.765 10.59c.146.168.302.285.47.353.172.067.349.1.532.1.19 0 .361-.033.514-.1.157-.071.291-.181.403-.33.112-.154.198-.351.258-.594.06-.242.09-.535.09-.878 0-.306-.025-.566-.074-.778a1.483 1.483 0 0 0-.218-.532.84.84 0 0 0-.347-.302 1.141 1.141 0 0 0-.48-.095c-.243 0-.454.054-.633.162-.175.104-.347.26-.515.464v2.53Zm0-3.582c.228-.227.48-.41.756-.548.276-.138.585-.207.928-.207.332 0 .63.067.895.201.269.13.496.32.683.566.19.246.336.544.436.895.105.347.157.737.157 1.17 0 .466-.06.891-.18 1.275a2.92 2.92 0 0 1-.497.98 2.208 2.208 0 0 1-1.779.856 1.894 1.894 0 0 1-.873-.201 1.837 1.837 0 0 1-.33-.224c-.1-.09-.196-.189-.285-.297l-.062.347c-.026.108-.069.185-.128.23a.417.417 0 0 1-.241.061h-1.024V3.768h1.544v3.24ZM52.405 9.7c-.377.019-.69.052-.94.1a2.25 2.25 0 0 0-.599.18.797.797 0 0 0-.313.257.56.56 0 0 0-.09.308c0 .224.062.383.185.476.127.093.302.14.526.14.258 0 .48-.045.666-.134.19-.094.378-.237.565-.431V9.7ZM49.26 7.143a3.41 3.41 0 0 1 1.124-.683 3.78 3.78 0 0 1 1.332-.23c.343 0 .649.056.917.168a1.998 1.998 0 0 1 1.124 1.18c.101.277.152.58.152.908v3.626h-.705a.737.737 0 0 1-.336-.061c-.074-.041-.136-.127-.184-.258l-.123-.37a5.218 5.218 0 0 1-.426.337 2.52 2.52 0 0 1-.42.246 2.305 2.305 0 0 1-.47.145 2.78 2.78 0 0 1-.553.05c-.254 0-.485-.033-.694-.1a1.559 1.559 0 0 1-.542-.297c-.15-.134-.265-.3-.347-.498a1.77 1.77 0 0 1-.123-.682c0-.213.054-.426.162-.638.108-.213.293-.405.554-.577.265-.175.615-.319 1.052-.43.44-.116.99-.182 1.65-.197v-.296c0-.362-.077-.627-.23-.795-.152-.172-.372-.257-.66-.257-.212 0-.39.026-.531.078a2.358 2.358 0 0 0-.375.162c-.104.056-.203.11-.296.163a.693.693 0 0 1-.325.072.466.466 0 0 1-.274-.078.813.813 0 0 1-.179-.196l-.274-.492ZM58.477 7.529a.473.473 0 0 1-.128.14.323.323 0 0 1-.174.039.531.531 0 0 1-.23-.056 6.535 6.535 0 0 0-.262-.118 2.46 2.46 0 0 0-.336-.123 1.49 1.49 0 0 0-.43-.056c-.25 0-.444.053-.582.157a.474.474 0 0 0-.207.403c0 .116.039.213.117.291.079.078.181.147.308.207.13.056.278.11.442.162.164.049.332.103.503.163.176.06.345.128.51.207.163.078.309.177.436.296.13.116.235.258.313.426.078.164.118.363.118.598 0 .28-.053.54-.157.778-.1.235-.25.439-.448.61a2.124 2.124 0 0 1-.738.403 3.255 3.255 0 0 1-1.018.146c-.198 0-.394-.019-.588-.056a3.258 3.258 0 0 1-.553-.146 3.72 3.72 0 0 1-.493-.23 2.2 2.2 0 0 1-.397-.279l.358-.576a.468.468 0 0 1 .151-.157.469.469 0 0 1 .24-.056.48.48 0 0 1 .258.073l.263.15c.097.053.21.103.341.152.134.045.3.067.498.067.15 0 .278-.017.386-.05a.755.755 0 0 0 .263-.135.55.55 0 0 0 .145-.195.556.556 0 0 0 .05-.23.406.406 0 0 0-.122-.308 1.003 1.003 0 0 0-.314-.212 2.996 2.996 0 0 0-.441-.163c-.168-.048-.34-.102-.515-.162a4.58 4.58 0 0 1-.51-.213 1.84 1.84 0 0 1-.441-.307 1.543 1.543 0 0 1-.314-.465 1.69 1.69 0 0 1-.117-.666c0-.239.047-.464.14-.677.093-.216.233-.407.42-.57a2.08 2.08 0 0 1 .693-.393 2.95 2.95 0 0 1 .968-.145c.41 0 .783.067 1.119.201.335.135.611.31.828.526l-.353.549ZM63.276 8.547c0-.16-.022-.313-.067-.459a1.031 1.031 0 0 0-.202-.386.96.96 0 0 0-.352-.263 1.18 1.18 0 0 0-.509-.1c-.37 0-.658.104-.867.313-.209.209-.345.507-.409.895h2.406Zm-2.428.918c.049.541.202.937.459 1.187.26.25.6.375 1.018.375.212 0 .396-.025.548-.073.157-.052.293-.108.409-.168l.319-.168a.597.597 0 0 1 .285-.078.33.33 0 0 1 .28.134l.447.56a2.49 2.49 0 0 1-.542.475 3.11 3.11 0 0 1-.616.297c-.212.07-.427.12-.643.145-.216.03-.425.045-.627.045-.403 0-.78-.065-1.13-.196a2.642 2.642 0 0 1-.912-.587 2.803 2.803 0 0 1-.61-.968c-.149-.385-.223-.83-.223-1.338 0-.392.063-.761.19-1.108.13-.347.317-.65.56-.907a2.62 2.62 0 0 1 .883-.61c.347-.153.739-.23 1.175-.23.37 0 .709.06 1.018.18a2.202 2.202 0 0 1 1.331 1.337c.127.325.191.696.191 1.114 0 .116-.005.211-.017.286a.505.505 0 0 1-.056.179.215.215 0 0 1-.106.095.556.556 0 0 1-.173.022h-3.458Z"
    :fill "#5A6072"}]
  [:path
   {:fill-rule "evenodd"
    :clip-rule "evenodd"
    :d "M.972 4.755a.972.972 0 1 0 0-1.944.972.972 0 0 0 0 1.944ZM.972 7.566a.972.972 0 1 0 0-1.943.972.972 0 0 0 0 1.943ZM3.783 7.566a.972.972 0 1 0 0-1.943.972.972 0 0 0 0 1.943ZM12.217 4.755a.972.972 0 1 0 0-1.944.972.972 0 0 0 0 1.944ZM9.406 7.566a.972.972 0 1 0 0-1.943.972.972 0 0 0 0 1.943ZM6.594 10.377a.972.972 0 1 0 0-1.943.972.972 0 0 0 0 1.944ZM12.217 7.566a.972.972 0 1 0 0-1.944.972.972 0 0 0 0 1.944ZM.972 10.377a.972.972 0 1 0 0-1.943.972.972 0 0 0 0 1.944ZM12.217 10.377a.972.972 0 1 0 0-1.943.972.972 0 0 0 0 1.944ZM.972 13.19a.972.972 0 1 0 0-1.945.972.972 0 0 0 0 1.944ZM12.217 13.19a.972.972 0 1 0 0-1.945.972.972 0 0 0 0 1.944Z"
    :fill "#509EE3"}]
  [:path
   {:fill-rule "evenodd"
    :clip-rule "evenodd"
    :d "M3.783 4.755a.972.972 0 1 0 0-1.944.972.972 0 0 0 0 1.944ZM6.594 4.755a.972.972 0 1 0 0-1.944.972.972 0 0 0 0 1.944ZM6.594 1.944a.972.972 0 1 0 0-1.944.972.972 0 0 0 0 1.944ZM6.594 7.566a.972.972 0 1 0 0-1.944.972.972 0 0 0 0 1.944ZM9.406 4.755a.972.972 0 1 0 0-1.944.972.972 0 0 0 0 1.944ZM3.783 10.377a.972.972 0 1 0 0-1.943.972.972 0 0 0 0 1.944ZM9.406 10.377a.972.972 0 1 0 0-1.943.972.972 0 0 0 0 1.944ZM3.783 13.19a.972.972 0 1 0 0-1.945.972.972 0 0 0 0 1.944ZM6.594 13.19a.972.972 0 1 0 0-1.945.972.972 0 0 0 0 1.944ZM6.594 16a.972.972 0 1 0 0-1.944.972.972 0 0 0 0 1.944ZM9.406 13.19a.972.972 0 1 0 0-1.945.972.972 0 0 0 0 1.944Z"
    :fill "#C2DAF0"}]]
 [:defs
  [:clipPath {:id "a"}
   [:path {:fill "#fff" :d "M0 0h65v16H0z"}]]]])

(def branding-content
  [:table {:style (style/style {:height :32px :width "100%" :font-size :12px})}
   [:tr {}
    [:td {:style (style/style { :width "100%" :vertical-align :middle :padding-right :8px :text-align :right})} "Made with"]
    [:td {:style (style/style { :vertical-align :middle})} logo]]])

(mu/defn render-pulse-card :- ::body/RenderedPartCard
  "Render a single `card` for a `Pulse` to Hiccup HTML. `result` is the QP results. Returns a map with keys

  - attachments
  - content (a hiccup form suitable for rendering on rich clients or rendering into an image)
  - render/text : raw text suitable for substituting on clients when text is preferable. (Currently slack uses this for
    scalar results where text is preferable to an image of a div of a single result."
  ([render-type timezone-id card dashcard results]
   (render-pulse-card render-type timezone-id card dashcard results nil))

  ([render-type
    timezone-id :- [:maybe :string]
    card
    dashcard
    results
    options     :- [:maybe ::options]]
   (let [{title             :content
          title-attachments :attachments} (make-title-if-needed render-type card dashcard options)
         {description :content}           (make-description-if-needed dashcard card options)
         {pulse-body       :content
          body-attachments :attachments
          text             :render/text}  (render-pulse-card-body render-type timezone-id card dashcard results)]
     (cond-> {:attachments (merge title-attachments body-attachments)
              :content [:p
                        ;; Provide a horizontal scrollbar for tables that overflow container width.
                        ;; Surrounding <p> element prevents buggy behavior when dragging scrollbar.
                        [:div
                         [:a {:href        (card-href card)
                              :target      "_blank"
                              :rel         "noopener noreferrer"
                              :style       (style/style
                                            (style/section-style)
                                            {:display         :block
                                             :text-decoration :none})}
                          title
                          description
                          [:div {:class "pulse-body"
                                 :style (style/style {:overflow-x :auto ;; when content is wide enough, automatically show a horizontal scrollbar
                                                      :display :block
                                                      :margin  :16px})}
                           (if-let [more-results-message (body/attached-results-text render-type card)]
                             (conj more-results-message (list pulse-body))
                             pulse-body)]]
                         branding-content]]}
       text (assoc :render/text text)))))

(mu/defn render-pulse-card-for-display
  "Same as `render-pulse-card` but isn't intended for an email, rather for previewing so there is no need for
  attachments"
  ([timezone-id card results]
   (render-pulse-card-for-display timezone-id card results nil))

  ([timezone-id card results options :- [:maybe ::options]]
   (:content (render-pulse-card :inline timezone-id card nil results options))))

(mu/defn render-pulse-section :- ::body/RenderedPartCard
  "Render a single Card section of a Pulse to a Hiccup form (representating HTML)."
  ([timezone-id part]
   (render-pulse-section timezone-id part {}))

  ([timezone-id
    {card :card, dashcard :dashcard, result :result, :as _part}
    options :- [:maybe ::options]]
   (log/with-context {:card_id (:id card)}
     (let [options                       (merge {:channel.render/include-title?       true
                                                 :channel.render/include-description? true}
                                                options)
           {:keys [attachments content]} (render-pulse-card :attachment timezone-id card dashcard result options)]
       {:attachments attachments
        :content     [:div {:style (style/style {:margin-top    :20px
                                                 :margin-bottom :20px})}
                      content]}))))

(mu/defn render-pulse-card-to-png :- bytes?
  "Render a `pulse-card` as a PNG. `data` is the `:data` from a QP result."
  (^bytes [timezone-id pulse-card result width]
   (render-pulse-card-to-png timezone-id pulse-card result width nil))

  (^bytes [timezone-id :- [:maybe :string]
           pulse-card
           result
           width
           options :- [:maybe ::options]]
   (png/render-html-to-png (render-pulse-card :inline timezone-id pulse-card nil result options) width)))

(mu/defn render-pulse-card-to-base64 :- string?
  "Render a `pulse-card` as a PNG and return it as a base64 encoded string."
  ^String [timezone-id card dashcard result width]
  (-> (render-pulse-card :inline timezone-id card dashcard result)
      (png/render-html-to-png width)
      image-bundle/render-img-data-uri))

(mu/defn png-from-render-info :- bytes?
  "Create a PNG file (as a byte array) from rendering info."
  ^bytes [rendered-info :- ::body/RenderedPartCard width]
  ;; TODO huh? why do we need this indirection?
  (png/render-html-to-png rendered-info width))

(mu/defn defaulted-timezone :- :string
  "Returns the timezone ID for the given `card`. Either the report timezone (if applicable) or the JVM timezone."
  [card]
  (or (some->> card :database_id (t2/select-one :model/Database :id) qp.timezone/results-timezone-id)
      (qp.timezone/system-timezone-id)))
