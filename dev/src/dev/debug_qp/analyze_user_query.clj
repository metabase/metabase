(ns dev.debug-qp.analyze-user-query
  "Given access to e.g. a Cloud instance with a querying issue, this script can use a login token borrowed from your
  browser to make API calls to the instance, and assemble a local mock `MetadataProvider` which contains the tables,
  fields and cards necessary to run QP preprocessing and compilation locally against the same metadata the user
  instance is seeing.

  Of course the queries can't be executed without a connection to the user's DWH, which is usually impossible."
  (:require
   [clj-http.client :as http]
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib.js.metadata :as lib.js.metadata]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.upload.core :as upload]
   [metabase.upload.settings :as upload.settings]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

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
                             {"questions" {(str card-id) card}}
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
    (let [dataset-query (-> (lib.metadata/card metadata-provider card-id)
                            :dataset-query)
          start (System/nanoTime)
          _ (qp.compile/compile dataset-query)
          elapsed-ms (/ (- (System/nanoTime) start) 1e6)]
      elapsed-ms)))

(defn generate-card-compilation-analysis
  "`csv-file-name` is the name of the csv file that the results will be saved to locally and uploaded to metabase.
   `card-ids` are the ids of the cards from the instance you've configured in `my-ctx` that you want to analyze.
   Use `criterium.core` for more statistically significiant benchmarking. It greatly increases the time to test many cards."
  [csv-file-name card-ids]
  (let [num-cards (count card-ids)
        _ (tap> (format "Processing %d cards" num-cards))
        card-stats (into {}
                         (for [[idx card-id] (map-indexed vector card-ids)]
                           (try
                             (let [mp (metadata-for my-ctx {:card [card-id]})
                                   elapsed-ms (compile-card mp card-id)
                                   card-num (inc idx)
                                   card-pct (-> card-num (/ num-cards) (* 100) double)]
                               (when (= 0 (mod card-num 10))
                                 (tap> (format "Processed %.0f%% of %d cards"  card-pct num-cards)))
                               [card-id {:compilation_time elapsed-ms :error_msg ""}])
                             (catch Throwable t
                               (tap> (format "Error on card %d: %s" card-id (.getMessage t)))
                               [card-id {:compilation_time 0.0 :error_msg (.getMessage t)}]))))
        _ (tap> (format "Finished processing %d cards" num-cards))
        cols (-> card-stats vals first keys)
        header (into ["card_id"] (map name cols))
        rows (for [[card-id stats] card-stats]
               (into [(str card-id)]
                     (map #(str (get stats %)) cols)))]
    (with-open [w (io/writer csv-file-name)]
      (csv/write-csv w (cons header rows)))
    (let [path (str (System/getProperty "user.dir") "/" csv-file-name)
          file (java.io.File. path)
          user  (t2/select-one :model/User :is_superuser true :is_active true)
          {:keys [db_id schema_name table_prefix]} (upload.settings/uploads-settings)]
      (binding [api/*current-user-id* (:id user)
                api/*current-user* (delay user)
                api/*is-superuser?* true
                api/*current-user-permissions-set* (delay #{"/"})]
        (upload/create-csv-upload!
         {:collection-id nil
          :filename (.getName file)
          :file file
          :db-id db_id
          :schema-name schema_name
          :table-prefix table_prefix}))
      (tap> (format "Created and uploaded %s" path)))
    card-stats))

(comment
  ;; Example calls
  (let [card-id 456
        mp      (metadata-for my-ctx {:card [card-id]})]
    (compile-card mp card-id))

  (let [card-id 456
        mp      (metadata-for my-ctx {:card [card-id]})]
    (preprocess-card mp card-id))

  (let [csv-file-name "card_analysis.csv"
        card-ids [123 456]]
    (generate-card-compilation-analysis csv-file-name card-ids))

  "You can look for differences card compilation performance between two csvs with this query"
  "
   ```sql
   with master_stats_2000 as (
     select card_id, compilation_time,
     count(*) over() as total_cards,
     count(*) filter (where error_msg is not null) over() as num_errors,
     (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY compilation_time)
      FROM \"public\".\"master_7000_20260410175341\") as median_comp_time,
     avg(compilation_time) over() as avg_comp_time
     from \"public\".\"master_7000_20260410175341\"
   ),
   ck_stats_2000 as (
     select card_id, compilation_time,
     count(*) over() as total_cards,
     count(*) filter (where error_msg is not null) over() as num_errors,
     (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY compilation_time)
      FROM \"public\".\"col_keys_7000_20260410175334\") as median_comp_time,
     avg(compilation_time) over() as avg_comp_time
     from \"public\".\"col_keys_7000_20260410175334\"
   )
   select count(*) over(),
   m.card_id, m.compilation_time as master_time, ck.compilation_time as ck_time,
   m.compilation_time - ck.compilation_time as compilation_diff,
   m.num_errors as master_errors, ck.num_errors as ck_errors,
   m.median_comp_time as master_median, ck.median_comp_time as ck_median,
   m.avg_comp_time as master_avg, ck.avg_comp_time as ck_avg
   from master_stats_2000 m
   left join ck_stats_2000 ck
   on m.card_id = ck.card_id
   order by compilation_diff asc;
   ```")
