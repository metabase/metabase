(ns metabase.channel.email.result-attachment
  (:require
   [clojure.java.io :as io]
   [medley.core :as m]
   [metabase.channel.render.body :as body]
   [metabase.channel.render.util :as render.util]
   [metabase.channel.shared :as channel.shared]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.performance :as perf])
  (:import
   (java.io File IOException OutputStream)))

(set! *warn-on-reflection* true)

(mu/defn- stream-api-results-to-export-format!
  "For legacy compatibility. Takes QP results in the normal `:api` response format and streams them to a different
  format.

  TODO -- this function is provided mainly because rewriting all the Pulse/Alert code to stream results directly
  was a lot of work. I intend to rework that code so we can stream directly to the correct export format(s) at some
  point in the future; for now, this function is a stopgap.

  Results are streamed synchronously. Caller is responsible for closing `os` when this call is complete."
  [^OutputStream os                                              :- (ms/InstanceOfClass OutputStream)
   {:keys [export-format format-rows? pivot? csv-include-bom?]
    :or   {csv-include-bom? true}
    :as   _options}                                              :- [:map {:closed true}
                                                                     [:export-format    :keyword]
                                                                     [:format-rows?     {:optional true} [:maybe :boolean]]
                                                                     [:pivot?           {:optional true} [:maybe :boolean]]
                                                                     [:csv-include-bom? {:optional true} [:maybe :boolean]]]
   {{:keys [rows]} :data, database-id :database_id, :as results} :- [:merge
                                                                     ::body/QPResult
                                                                     [:map {:closed true}
                                                                      [:database_id ::lib.schema.id/database]]]]
  ;; make sure Database/driver info is available for the streaming results writers -- they might need this in order to
  ;; get timezone information when writing results
  (log/debugf "Streaming results to %s with %d rows" export-format (:row_count results))
  (driver/with-driver (driver.u/database->driver database-id)
    (qp.store/with-metadata-provider database-id
      (let [w                           (qp.si/streaming-results-writer export-format os)
            cols                        (-> results :data :cols)
            viz-settings                (-> results :data :viz-settings)
            [ordered-cols output-order] (qp.streaming/order-cols cols viz-settings)
            viz-settings'               (assoc viz-settings :output-order output-order)]
        (qp.si/begin! w
                      (-> results
                          (assoc-in [:data :format-rows?] (boolean format-rows?))
                          (assoc-in [:data :pivot?] pivot?)
                          (assoc-in [:data :csv-include-bom?] csv-include-bom?)
                          (assoc-in [:data :ordered-cols] ordered-cols))
                      viz-settings')
        (perf/reduce (fn [_ i row]
                       (qp.si/write-row! w row i ordered-cols viz-settings'))
                     nil (range) rows)
        (qp.si/finish! w results)))))

(defn- create-temp-file!
  "Separate from `create-temp-file-or-throw` primarily so that we can simulate exceptions in tests"
  [suffix]
  (doto (File/createTempFile "metabase_attachment" suffix)
    .deleteOnExit))

(defn- create-temp-file-or-throw!
  "Tries to create a temp file, will give the users a better error message if we are unable to create the temp file"
  [suffix]
  (try
    (create-temp-file! suffix)
    (catch IOException e
      (let [ex-msg (tru "Unable to create temp file in `{0}` for email attachments "
                        (System/getProperty "java.io.tmpdir"))]
        (throw (IOException. ex-msg e))))))

(defn- create-result-attachment-map [export-type card-name ^File attachment-file]
  (let [{:keys [content-type]} (qp.si/stream-options export-type)]
    {:type         :attachment
     :content-type content-type
     :file-name    (format "%s_%s.%s"
                           (or card-name "query_result")
                           (streaming.common/export-filename-timestamp)
                           (name export-type))
     :content      (-> attachment-file .toURI .toURL)
     :description  (format "More results for '%s'" card-name)}))

(defn- attachment-wanted?
  "Whether `part` asks for a result attachment and has rows to put in it."
  [{:keys [card result]}]
  (and (or (:include_csv card) (:include_xls card))
       (pos-int? (:row_count result))))

(defn assoc-attachment-booleans
  "Merge the attachment settings of the config in `part-configs` that belongs to each of `parts` into its card."
  [part-configs parts]
  (for [{{result-card-id :id} :card :as result} parts
        :let [result-dashboard-card-id (:id (:dashcard result))
              is-visualizer-part (render.util/is-visualizer-dashcard? (:dashcard result))
              ;; For visualizer dashcards we match on both card_id and dashboard_card_id
              ;; To disambiguate between regular cards and regular cards that were turned into visualizer dashcards
              noti-dashcard (or (and is-visualizer-part
                                     (m/find-first (fn [config]
                                                     (and (= (:card_id config) result-card-id)
                                                          (= (:dashboard_card_id config) result-dashboard-card-id)))
                                                   part-configs))
                                ;; Fall back to just matching on card_id
                                (m/find-first (fn [config]
                                                (= (:card_id config) result-card-id))
                                              part-configs))]]
    (if result-card-id
      (update result :card merge (select-keys noti-dashcard [:include_csv :include_xls :format_rows :pivot_results]))
      result)))

(defn card-attachment-part
  "The `card-part` of an alert with the attachment settings of the alert: its results as one csv."
  [notification-card card-part]
  (first (assoc-attachment-booleans
          [(assoc notification-card :include_csv true :format_rows true)]
          [card-part])))

(defn metadata-providers
  "Map of Database id to a metadata provider for the Databases of the `parts` that want a result attachment, each
  provider reading its Database once for all of them. A Database whose provider cannot be made is left out."
  [parts]
  (into {}
        (comp (filter attachment-wanted?)
              (keep #(get-in % [:result :database_id]))
              (distinct)
              (keep (fn [database-id]
                      (try
                        [database-id (qp.store/with-metadata-provider database-id
                                       (qp.store/metadata-provider))]
                        (catch Throwable _
                          nil)))))
        parts))

(defn download-levels
  "The download level of the user with `creator-id` for the query of each of `parts` that wants a result attachment, in
  order, nil for the others: read for all of them at once, or one by one when that throws, each failure in place of its
  level."
  [parts creator-id]
  (let [parts   (vec parts)
        indexes (filterv #(attachment-wanted? (parts %)) (range (count parts)))
        queries (mapv #(get-in (parts %) [:card :dataset_query]) indexes)
        levels  (when (seq queries)
                  (try
                    (perms/download-perms-levels queries creator-id)
                    (catch Throwable _
                      (mapv #(try
                               (perms/download-perms-level % creator-id)
                               (catch Throwable e
                                 e))
                            queries))))]
    (reduce (fn [acc [i level]] (assoc acc i level))
            (vec (repeat (count parts) nil))
            (map vector indexes levels))))

(defn result-attachment
  "Create result attachments for an email. `download-level` is the subscription creator's download level for the query
  of `part`, from [[download-levels]], which gates the attachment at send time. `providers` is the optional result of
  [[metadata-providers]]."
  ([part download-level]
   (result-attachment part download-level nil))
  ([{{format-rows :format_rows pivot-results :pivot_results :as card} :card
     dashcard :dashcard
     :as part}
    download-level
    providers]
   (when (instance? Throwable download-level)
     (throw download-level))
   (when (and (attachment-wanted? part)
              (keyword? download-level)
              (not= download-level :no))
     (let [database-id (get-in part [:result :database_id])]
       (qp.store/with-metadata-provider (get providers database-id database-id)
         (let [result           (:result (channel.shared/maybe-realize-data-rows part))
               ;; the dashboard-level title override (incl. the visualizer's) names the attachment, matching the card's
               ;; displayed title; falls back to the card's own name (see [[render.util/dashcard-title]]).
               filename-prefix  (render.util/dashcard-title card dashcard)]
           (when-not (:render/too-large? result)
             (->>
              [(when-let [temp-file (and (:include_csv card)
                                         (create-temp-file-or-throw! "csv"))]
                 (with-open [os (io/output-stream temp-file)]
                   (stream-api-results-to-export-format! os {:export-format :csv :format-rows? format-rows :pivot? pivot-results :csv-include-bom? true} result))
                 (create-result-attachment-map "csv" filename-prefix temp-file))
               (when-let [temp-file (and (:include_xls card)
                                         (create-temp-file-or-throw! "xlsx"))]
                 (with-open [os (io/output-stream temp-file)]
                   (stream-api-results-to-export-format! os {:export-format :xlsx :format-rows? format-rows :pivot? pivot-results} result))
                 (create-result-attachment-map "xlsx" filename-prefix temp-file))]
              (filterv some?)))))))))
