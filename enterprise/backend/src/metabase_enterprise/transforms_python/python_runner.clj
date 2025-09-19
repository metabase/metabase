(ns metabase-enterprise.transforms-python.python-runner
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.pipeline :as qp.pipeline]
   ;; TODO check that querying team are ok with us accessing this directly, otherwise make another plan
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (clojure.lang PersistentQueue)
   (java.io BufferedWriter File OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defn- authorization-headers
  "Returns HTTP headers with Authorization bearer token if configured.
  Throws configuration error in production if token is not set."
  []
  (let [api-token (transforms-python.settings/python-runner-api-token)]
    (if api-token
      {"Authorization" (str "Bearer " api-token)}
      (if config/is-prod?
        (throw (ex-info "Python runner API token is required in production but not configured"
                        {:error-type :configuration-error}))
        {}))))

(defn- python-runner-request
  "Helper function for making HTTP requests to the python runner service."
  [server-url method endpoint & [request-options]]
  (let [url          (str server-url "/v1" endpoint)
        base-options {:content-type     :json
                      :accept           :json
                      :throw-exceptions false
                      :as               :json
                      :headers          (authorization-headers)}]
    (http/request (merge base-options request-options {:method method, :url url}))))

(defn- write-jsonl-to-stream! [^OutputStream os col-names reducible-rows]
  (let [none? (volatile! true)
        writer (-> os
                   (OutputStreamWriter. StandardCharsets/UTF_8)
                   (BufferedWriter.))]

    (run! (fn [row]
            (when @none? (vreset! none? false))
            (let [row-map (zipmap col-names row)]
              (json/encode-to row-map writer {})
              (.newLine writer)))
          reducible-rows)

    ;; Workaround for LocalStack, which doesn't support zero byte files.
    (when @none?
      (.write writer " "))

    (doto writer
      (.flush)
      (.close))))

(defn- execute-mbql-query
  [driver db-id query respond cancel-chan]
  (driver/with-driver driver
    (let [native (qp.compile/compile {:type :query, :database db-id :query query})
          query  {:database db-id
                  :type     :native
                  :native   native}]
      (qp.store/with-metadata-provider db-id
        (binding [qp.pipeline/*canceled-chan* cancel-chan]
          (driver/execute-reducible-query driver query {:canceled-chan cancel-chan} respond))))))

(defn root-type
  "Supported type for roundtrip/insertion"
  [base-type]
  (when base-type
    (some #(when (isa? base-type %) %)
          [:type/Number
           :type/Date
           :type/DateTime
           :type/Instant
           :type/DateTimeWithTZ
           :type/Text
           :type/Boolean])))

(defn restricted-insert-type
  "Type for insertion restricted to supported"
  [base_type]
  (if base_type
    (let [base-type-kw (keyword "type" base_type)]
      (if (root-type base-type-kw)
        base-type-kw
        :type/Text))
    :type/Text))

(defn- closest-ancestor [t pred]
  (loop [remaining (conj PersistentQueue/EMPTY [t])]
    (when-let [t (first remaining)]
      (if (pred t)
        t
        (recur (into (pop t) (parents t)))))))

(defn- effective-semantic-type-i-think
  "Kinda sketchy but maybe reasonable way to infer the effective-semantic-type"
  [{:keys [base_type effective_type semantic_type]}]
  (or semantic_type (closest-ancestor (or effective_type base_type) #(isa? % :Semantic/*))))

(defn- generate-manifest
  "Generate a manifest to communicate schema and metadata information around the table."
  [table-id cols-meta]
  {:schema_version 1
   :data_format    "jsonl"
   :data_version   1
   :table_metadata {:table_id table-id}
   :fields         (mapv (fn [col-meta]
                           {:name           (:name col-meta)
                            :base_type      (some-> (:base_type col-meta) name)
                            :database_type  (some-> (:database_type col-meta) name)
                            :root_type      (some-> (root-type (:base_type col-meta)) name)
                            :semantic_type  (some-> (effective-semantic-type-i-think col-meta) name)
                            :effective_type (some-> (or (:effective_type col-meta) (:database_type col-meta)) name)
                            :field_id       (:id col-meta)})
                         cols-meta)})

(defn- maybe-fixup-value [col v]
  (cond
    (nil? (root-type (:base_type col)))
    ;; we're not a supported base type, so we just stringify it
    (when v (json/encode v))

    ;; the clickhouse driver returns bigdecimals for int64 values
    (and (isa? (:base_type col) :type/Integer)
         (or (instance? BigDecimal v)
             (float? v)))
    (bigint v)

    :else
    v))

(defn- write-table-data-to-file! [{:keys [db-id driver table-id fields-meta temp-file cancel-chan]}]
  (let [query    {:source-table table-id}]
    (execute-mbql-query driver db-id query
                        (fn [{cols-meta :cols} reducible-rows]
                          (with-open [os (io/output-stream temp-file)]
                            (let [filtered-col-meta (m/index-by :name fields-meta)
                                  col-names         (map :name cols-meta)
                                  filtered-rows     (eduction (map (fn [row]
                                                                     (->>
                                                                      (map vector col-names row)
                                                                      (filter (fn [[n _]]
                                                                                (contains? filtered-col-meta n)))
                                                                      (map (fn [[n v]]
                                                                             (maybe-fixup-value (filtered-col-meta n) v))))))
                                                              reducible-rows)]
                              (write-jsonl-to-stream! os (filter filtered-col-meta col-names) filtered-rows))))
                        cancel-chan)))

(defn get-logs
  "Return the logs of the current running python process"
  [run-id]
  (let [server-url (transforms-python.settings/python-runner-url)]
    (python-runner-request server-url :get "/logs" {:query-params {:request_id run-id}})))

(defn execute-python-code-http-call!
  "Calls the /execute endpoint of the python runner. Blocks until the run either succeeds or fails and returns
  the response from the server."
  [{:keys [server-url code run-id table-name->id shared-storage]}]
  (let [{:keys [objects]} shared-storage
        {:keys [output output-manifest events]} objects

        url-for-path             (fn [path] (:url (get objects path)))
        table-name->url          (update-vals table-name->id #(url-for-path [:table % :data]))
        table-name->manifest-url (update-vals table-name->id #(url-for-path [:table % :manifest]))

        payload                  {:code                code
                                  :library             (t2/select-fn->fn :path :source :model/PythonLibrary)
                                  :timeout             30
                                  :request_id          run-id
                                  :output_url          (:url output)
                                  :output_manifest_url (:url output-manifest)
                                  :events_url          (:url events)
                                  :table_mapping       table-name->url
                                  :manifest_mapping    table-name->manifest-url}

        response                 (transforms.instrumentation/with-python-api-timing [run-id]
                                   (python-runner-request server-url :post "/execute" {:body (json/encode payload)}))]
    ;; when a 500 is returned we observe a string in the body (despite the python returning json)
    ;; always try to parse the returned string as json before yielding (could tighten this up at some point)
    (update response :body (fn [string-if-error]
                             (if (string? string-if-error)
                               (try
                                 (json/decode+kw string-if-error)
                                 (catch Exception _
                                   {:error string-if-error}))
                               string-if-error)))))

;; temporary, we should not need to realize data/events files into memory longer term
(defn read-output-objects
  "Temporary function that strings/jsons stuff in S3 and returns it for compatibility."
  [{:keys [s3-client bucket-name objects]}]
  (let [{:keys [output output-manifest events]} objects
        output-content          (s3/read-to-string s3-client bucket-name (:path output) nil)
        output-manifest-content (s3/read-to-string s3-client bucket-name (:path output-manifest) "{}")
        events-content          (s3/read-to-string s3-client bucket-name (:path events))]
    {:output          output-content
     :output-manifest (json/decode+kw output-manifest-content)
     :events          (mapv json/decode+kw (str/split-lines events-content))}))

(defn- safe-delete
  "Safely delete a file."
  [^File file]
  (try (.delete file) (catch Exception _)))

(defn- fields-metadata [_driver table-id]
  (t2/select [:model/Field :id :name :base_type :effective_type :semantic_type :database_type :database_position]
             :table_id table-id
             :active true
             ;; we are only interested in top-level objects, so filter out nested fields (parent or path)
             :parent_id nil
             :nfc_path nil
             {:order-by [[:database_position :asc]]}))

;; TODO break this up such that s3 can be swapped out for other transfer mechanisms.
(defn copy-tables-to-s3!
  "Writes table content to their corresponding objects named in shared-storage, see (open-shared-storage!).
  Blocks until all tables are fully written and committed to shared storage."
  [{:keys [run-id
           shared-storage
           table-name->id
           cancel-chan]}]
  ;; TODO there's scope for some parallelism here, in particular across different databases
  (doseq [table-id (vals table-name->id)
          :let [{:keys [s3-client bucket-name objects]} shared-storage
                {data-path :path}                       (get objects [:table table-id :data])
                {manifest-path :path}                   (get objects [:table table-id :manifest])]]
    (let [tmp-data-file (File/createTempFile data-path "")
          tmp-meta-file (File/createTempFile manifest-path "")]
      (try
        (let [db-id       (t2/select-one-fn :db_id (t2/table-name :model/Table) :id table-id)
              driver      (t2/select-one-fn :engine :model/Database db-id)
              fields-meta (fields-metadata driver table-id)
              manifest    (generate-manifest table-id fields-meta)]

          (transforms.instrumentation/with-stage-timing [run-id :dwh-to-file]
            (write-table-data-to-file!
             {:db-id       db-id
              :driver      driver
              :table-id    table-id
              :fields-meta fields-meta
              :temp-file   tmp-data-file
              :cancel-chan cancel-chan}))

          (with-open [writer (io/writer tmp-meta-file)]
            (json/encode-to manifest writer {}))
          (let [data-size (.length tmp-data-file)
                meta-size (.length tmp-meta-file)]
            (transforms.instrumentation/record-data-transfer! run-id :dwh-to-file data-size nil)

            (transforms.instrumentation/with-stage-timing [run-id :file-to-s3]
              (s3/upload-file s3-client bucket-name data-path tmp-data-file)
              (s3/upload-file s3-client bucket-name manifest-path tmp-meta-file))

            (transforms.instrumentation/record-data-transfer! run-id :file-to-s3 (+ data-size meta-size) nil)))
        (finally
          (safe-delete tmp-data-file)
          (safe-delete tmp-meta-file))))))
