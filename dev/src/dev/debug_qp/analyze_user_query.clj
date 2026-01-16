(ns dev.debug-qp.analyze-user-query
  "Given access to e.g. a Cloud instance with a querying issue, this script can use a login token borrowed from your
  browser to make API calls to the instance, and assemble a local mock `MetadataProvider` which contains the tables,
  fields and cards necessary to run QP preprocessing and compilation locally against the same metadata the user
  instance is seeing.

  Of course the queries can't be executed without a connection to the user's DWH, which is usually impossible."
  (:require
   [clj-http.client :as http]
   [medley.core :as m]
   [metabase.lib.js.metadata :as lib.js.metadata]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

;; XXX: INSTRUCTIONS:
;; - Log into the instance, open DevTools, and navigate to the problem question.
;; - Open the Network tab, find a `/api/card/1234` or similar request, right click and "Copy as cURL".
;; - Paste that somewhere, probably into your shell to test that the `curl` call is working.
;; - Grab its `cookie` and edit it into `my-ctx` below. (It's the `-b` arg to curl.)
;; - Edit the `instance-url` of `my-ctx` below likewise.
;; - Edit the `database-id` of `my-ctx` below to match the problem database on the user instance.
;;   - That can be seen in eg. `/api/card` requests and similar.
;; - Now you can run the analysis functions below, like compile-card.
;;   - See the examples at the bottom of this file.
(def ^:private my-ctx
  "Contains instance details, for passing to the various functions below."
  {:instance-url        "https://acustomer.metabaseapp.com"  ; No trailing slash.
   :cookie-from-browser "COPY ME FROM YOUR curl COMMAND"
   :database-id         123})

(defn- mk-headers [{:keys [cookie-from-browser instance-url] :as _ctx}]
  {"accept" "application/json"
   "accept-language" "en-US,en;q=0.9"
   "cache-control" "no-cache"
   "content-type" "application/json"
   "cookie" cookie-from-browser
   "pragma" "no-cache"
   "priority" "u=1, i"
   "referer" instance-url
   "sec-ch-ua" "\"Google Chrome\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\""
   "sec-ch-ua-mobile" "?0"
   "sec-ch-ua-platform" "\"macOS\""
   "sec-fetch-dest" "empty"
   "sec-fetch-mode" "cors"
   "sec-fetch-site" "same-origin"
   "user-agent" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"})

(defn- instance-fetch [{:keys [instance-url] :as ctx} path]
  (let [headers  (mk-headers ctx)
        request  {:method           :get
                  :url              (str instance-url path)
                  :accept           :json
                  :content-type     :json
                  :throw-exceptions false
                  :headers          headers}
        response (-> (http/request request)
                     (select-keys [:body :headers :status])
                     (update :body json/decode))]
    (if (<= 200 (:status response) 299)
      (:body response)
      (throw (ex-info "Non-200 response" response)))))

(defn- qm-index [objs]
  (m/index-by (comp str #(get % "id")) objs))

(defn- qm->metadata [raw]
  ;; /query_metadata requests return a map in a different shape from what lib.js.metadata expects.
  ;; We get {"databases" [{...}], "tables" [{..., "fields": [{...}]}]} but we need
  ;; {"databases" {"12" {...}}
  ;;  "tables" {"333" {...}}
  ;;  "fields" {"4343" {...}}
  ;;  "questions" {"12" {...}}}
  (let [fields (for [table (get raw "tables")
                     :when (number? (get table "id"))
                     field (get table "fields")
                     :when (number? (get field "id"))]
                 field)]
    {"databases" (qm-index (get raw "databases"))
     "tables"    (qm-index (get raw "tables"))
     "fields"    (qm-index fields)}))

(defn- recursive-card-metadata
  "Helper for [[metadata-for]]. Prefer calling that function instead."
  [ctx main-card-id]
  (loop [metadata          {}
         cards-seen        #{main-card-id}
         [card-id & cards] [main-card-id]]
    (if-not card-id
      metadata
      (let [card         (instance-fetch ctx (str "/api/card/" card-id))
            raw          (instance-fetch ctx (str "/api/card/" card-id "/query_metadata"))
            nested-cards (->> (get raw "tables")
                              (map #(get % "id"))
                              (filter string?)
                              (map (comp Long/parseLong #(subs % 6)))
                              (remove cards-seen))]
        (recur (m/deep-merge metadata
                             {"questions" {(str card-id) card}
                              #_#_"fields"    (qm-index (get card "result_metadata"))}
                             (qm->metadata raw))
               (into cards-seen nested-cards)
               (concat cards nested-cards))))))

(defn- table-metadata
  "Helper for [[metadata-for]]. Prefer calling that function instead."
  [ctx table-id]
  (qm->metadata {"tables" [(-> (instance-fetch ctx (str "/api/table/" table-id "/query_metadata"))
                               (dissoc "db"))]}))

;; =============================================== External API ===================================================
(defn metadata-for
  "Given a map like `{:card [123 456], :table [789]}` returns a `MetadataProvider` with metadata for all the tables,
  cards and fields transitively required by the specified roots.

  Generally you only need a single `{:card [123]}` for the problem card you're investigating.

  Occasionally a broken card might reference fields by ID which are not really part of their query - then they're
  missing from the `/query_metadata` on that card and will be missed by this function unless you explicitly add
  `{:table [789]}` to the map of roots.

  Returns a complete `MetadataProvider` ready to use in a QP call."
  [{:keys [database-id] :as ctx} kind->ids]
  (->> (for [[kind ids] kind->ids
             id         ids]
         (case kind
           :card  (recursive-card-metadata ctx id)
           :table (table-metadata ctx id)))
       (apply m/deep-merge)
       (lib.js.metadata/metadata-provider database-id)))

(defn preprocess-card
  "Given a `MetadataProvider` built by [[metadata-for]] and a card ID, tries to preprocess that card."
  [metadata-provider card-id]
  (mu/disable-enforcement
    (-> (lib.metadata/card metadata-provider card-id)
        :dataset-query
        qp.preprocess/preprocess)))

(defn compile-card
  "Given a `MetadataProvider` built by [[metadata-for]] and a card ID, tries to compile that card to e.g. SQL."
  [metadata-provider card-id]
  (mu/disable-enforcement
    (-> (lib.metadata/card metadata-provider card-id)
        :dataset-query
        qp.compile/compile)))

(comment
  ;; Example calls
  (let [card-id 456
        mp      (metadata-for my-ctx {:card [card-id]})]
    (compile-card mp card-id))

  (let [card-id 456
        mp      (metadata-for my-ctx {:card [card-id]})]
    (preprocess-card mp card-id)))
