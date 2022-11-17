(ns metabase.query-processor.streaming.png
  (:require [hiccup.core :as hiccup]
            [java-time :as t]
            [metabase.models.card :as card :refer [Card]]
            [metabase.models.user :as user]
            [metabase.pulse :as pulse]
            [metabase.pulse.render :as render]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.query-processor.streaming.interface :as qp.si]
            [metabase.util.date-2 :as u.date]
            [ring.util.response :as response]
            [toucan.db :as db]))

(defn image-response
  "Returns a Ring response to serve a static-viz image download."
  [byte-array]
  (-> (response/response byte-array)
      (#'response/content-length (count byte-array))))

(defn- render-card
  "WIP"
  [query-results]
  (let [png-bytes (render/render-pulse-card-to-png (pulse-impl/defaulted-timezone card)
                                                   card
                                                   query-results
                                                   1000)]
    (-> png-bytes
        image-response
        (response/header "Content-Disposition" (format "attachment; filename=\"card-%d.png\"" card-id)))))

(defmethod qp.si/stream-options :png
  ([_]
   (qp.si/stream-options :csv "query_result"))
  ([_ filename-prefix]
   {:content-type              "image/png"
    :status                    200
    :headers                   {"Content-Disposition" (format "attachment; filename=\"%s_%s.png\""
                                                              (or filename-prefix "query_result")
                                                              (u.date/format (t/zoned-date-time)))}
    :write-keepalive-newlines? false}))

(defmethod qp.si/streaming-results-writer :png
  [_ ^OutputStream os]
  (reify qp.si/StreamingResultsWriter
    (begin! [_ {{:keys [ordered-cols]} :data :as asdf} _]
      (def asdf asdf)
      (-> (render-card (hiccup.core/html [:html [:body [:p "hi"]]]) 500)
          (write-image! "png" os)))

    (write-row! [_ row _row-num _ {:keys [output-order]}]
      nil #_(let [ordered-row (if output-order
                                (let [row-v (into [] row)]
                                  (for [i output-order] (row-v i)))
                                row)]
              (csv/write-csv writer [(map common/format-value ordered-row)])
              (.flush writer)))

    (finish! [_ _]
      ;; TODO -- not sure we need to flush both
      #_(.flush writer)
      (.flush os)
      #_(.close writer))))
