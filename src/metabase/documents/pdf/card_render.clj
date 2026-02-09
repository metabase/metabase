(ns metabase.documents.pdf.card-render
  "Card query execution and rendering for document PDF export.
  Returns raw SVG/HTML for supported chart types, with PNG fallback for others."
  (:require
   [metabase.channel.render.body :as body]
   [metabase.channel.render.card :as render.card]
   [metabase.channel.render.image-bundle :as image-bundle]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.channel.render.png :as png]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private card-image-width
  "Width in pixels for rendered card images in the PNG output."
  1200)

(defn- execute-card-query
  "Execute the query for a card and return the QP result map (not a streaming response)."
  [card-id]
  (qp.card/process-query-for-card
   card-id :api
   :context     :pulse
   :constraints {}
   :middleware  {:skip-results-metadata?            false
                 :process-viz-settings?             true
                 :js-int-to-string?                 false
                 :add-default-userland-constraints? false}
   :make-run    (fn [qp _export-format]
                  (fn [query info]
                    (qp (qp/userland-query query info) nil)))))

(defn- render-as-png
  "Fallback: render card through the existing pulse pipeline → PNG data URI."
  [card card-id result]
  (let [tz        (render.card/defaulted-timezone card)
        rendered  (render.card/render-pulse-card :inline tz card nil result)
        png-bytes (png/render-html-to-png rendered card-image-width)
        data-uri  (image-bundle/render-img-data-uri png-bytes)]
    {:status    :ok
     :card-name (:name card)
     :card-id   card-id
     :format    :png
     :data-uri  data-uri}))

(defn render-card-for-pdf
  "Render a card for PDF embedding.
  Returns raw SVG/HTML for supported chart types, PNG for others.
  Result map: {:status :ok/:error, :card-name str,
               :format :svg/:html/:png, :content str (for svg/html), :data-uri str (for png)}"
  [card-id dimensions]
  (try
    (let [card   (t2/select-one :model/Card :id card-id)
          _      (when-not card
                   (throw (ex-info (str "Card not found: " card-id) {:card-id card-id})))
          result (execute-card-query card-id)
          chart-type (render.card/detect-pulse-chart-type card nil (:data result))]
      (binding [js.svg/*chart-width*              (:width dimensions)
                js.svg/*chart-height*             (:height dimensions)
                js.svg/*fit-legend-within-height* true]
        (case chart-type
          :javascript_visualization
          (let [{rendered-type :type content :content}
                (js.svg/*javascript-visualization*
                 [{:card card :data (:data result)}]
                 (:visualization_settings card))]
            {:status    :ok
             :card-name (:name card)
             :card-id   card-id
             :format    rendered-type
             :content   content})

          :gauge
          {:status    :ok
           :card-name (:name card)
           :card-id   card-id
           :format    :svg
           :content   (js.svg/gauge-svg-string card (:data result))}

          :table
          (let [tz       (render.card/defaulted-timezone card)
                rendered (body/render :table :inline tz card nil (:data result))]
            {:status    :ok
             :card-name (:name card)
             :card-id   card-id
             :format    :hiccup
             :content   (:content rendered)})

          ;; fallback: PNG via existing pipeline
          (render-as-png card card-id result))))
    (catch Throwable e
      (log/errorf e "Failed to render card %d for PDF export" card-id)
      {:status  :error
       :message (ex-message e)})))

(defn render-all-cards
  "Render all cards in parallel, returning {card-id → render-result}.
  `card-dimensions` is a map of {card-id {:width w :height h}} from the document AST."
  [card-ids card-dimensions]
  (if (empty? card-ids)
    {}
    (into {}
          (pmap (fn [card-id]
                  [card-id (render-card-for-pdf card-id (get card-dimensions card-id))])
                card-ids))))
