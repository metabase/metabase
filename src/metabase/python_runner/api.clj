(ns metabase.python-runner.api
  "API endpoints for executing Python code in a sandboxed environment."
  (:require
   #_[metabase.server.streaming-response :as streaming]
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver :as driver]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.request.core :as request]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2])
  (:import
   (com.fasterxml.jackson.core JsonGenerator)
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.io ByteArrayOutputStream File)
   (java.nio.charset StandardCharsets)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(defn- create-temp-file
  "Create a temporary file with the given prefix and suffix."
  ^File [prefix suffix]
  (let [temp-file (Files/createTempFile prefix suffix (make-array FileAttribute 0))]
    (.toFile temp-file)))

(defmacro with-temp-files
  "Execute body with temporary files bound to symbols, ensuring cleanup.
   file-specs: vector of [symbol [prefix suffix]] pairs
   Example: (with-temp-files [code-file [\"python_code_\" \".py\"]] ...)"
  [file-specs & body]
  (let [pairs          (partition 2 file-specs)
        file-bindings  (mapcat (fn [[sym spec]]
                                 [sym `(.getAbsolutePath (create-temp-file ~(first spec) ~(second spec)))])
                               pairs)
        temp-file-syms (mapv first pairs)]
    `(let [~@file-bindings
           temp-files# ~temp-file-syms]
       (try
         ~@body
         (finally
           ;; TODO: we need these files for uploading csv, should we delete it here still?
           ;; or should we dump csv content to file when upload
           (doseq [^File file# temp-files#]
             (try (.delete file#) (catch Exception _#))))))))

(defn- safe-slurp
  "Safely slurp a file, returning empty string on error."
  [file]
  (try (slurp file) (catch Exception _ "")))

(defn cleanup-output-files!
  "Clean up all output files of python execution."
  [{:keys [output-file stdout-file stderr-file code-file]}]
  (doseq [^File file [output-file stdout-file stderr-file code-file]]
    (try (.delete file) (catch Exception _))))

(defn execute-python-code
  "Execute Python code using the Python execution server."
  [code table-name->id]
  (let [mount-path (transforms.settings/python-execution-mount-path)
        work-dir-name (str "run-" (System/currentTimeMillis) "-" (rand-int 10000))
        work-dir (str mount-path "/" work-dir-name)
        work-dir-file (io/file work-dir)]

    ;; Ensure mount base path exists
    (.mkdirs (io/file mount-path))
    ;; Create working directory
    (.mkdirs work-dir-file)

    (try
      (let [server-url (transforms.settings/python-execution-server-url)
            api-key (transforms.settings/python-runner-api-key)
            metabase-url (transforms.settings/python-runner-callback-base-url)

            response (http/post (str server-url "/execute")
                                {:content-type     :json
                                 :accept           :json
                                 :body             (json/encode {:code          code
                                                                 :working_dir   work-dir
                                                                 :timeout       30
                                                                 :metabase_url  metabase-url
                                                                 :api_key       api-key
                                                                 :table_mapping table-name->id})
                                 :throw-exceptions false
                                 :as               :json})

            result  (:body response)
            ;; TODO look into why some tests return json and others strings
            result (if (string? result) (json/decode result keyword) result)]

        (try
          (if (and (= 200 (:status response))
                   (zero? (:exit_code result)))
            ;; Success - read the output CSV if it exists
            (let [output-path (:output_file result)]
              (if (and output-path (.exists (io/file output-path)))
                {:output (slurp output-path)
                 :stdout (safe-slurp (:stdout_file result))
                 :stderr (safe-slurp (:stderr_file result))}
                {:status 500
                 :body   {:error  "Transform did not produce output CSV"
                          :stdout (safe-slurp (:stdout_file result))
                          :stderr (safe-slurp (:stderr_file result))}}))
            ;; Error from execution server
            {:status 500
             :body
             {:error     (or (:error result) "Execution failed")
              :exit-code (:exit_code result)
              :timeout   (:timeout result)
              :stdout    (safe-slurp (:stdout_file result))
              :stderr    (safe-slurp (:stderr_file result))}})
          (finally
            ;; Clean up working directory after use
            (try
              (when (.exists work-dir-file)
                ;; Delete directory and all contents
                (doseq [file (reverse (file-seq work-dir-file))]
                  (.delete ^File file)))
              (catch Exception _)))))

      (catch Exception e
        {:status 500
         :body {:error (str "Failed to connect to Python execution server: " (.getMessage e))}}))))

(api.macros/defendpoint :post "/execute"
  "Execute Python code in a sandboxed environment and return the output."
  [_route-params
   _query-params
   {:keys [code tables]} :- [:map
                             [:code ms/NonBlankString]
                             [:tables [:map-of :string ms/PositiveInt]]]]
  (api/check-superuser)
  (execute-python-code code tables))

(defn- execute-mbql-query
  [driver db-id query respond]
  (driver/with-driver driver
    (qp.store/with-metadata-provider db-id
      (let [native (driver/mbql->native driver (qp.preprocess/preprocess {:type :query, :database db-id :query query}))

            query {:database db-id
                   :type :native
                   :native native}]
        (driver/execute-reducible-query driver query {} respond)))))

(defn- write-to-stream! [^OutputStream os col-names reducible-rows]
  (let [^JsonGenerator jgen (-> os
                                (OutputStreamWriter. StandardCharsets/UTF_8)
                                (BufferedWriter.)
                                json/create-generator)]

    (.writeStartArray jgen)

    (run! (fn [row]
            (let [row-map (zipmap col-names row)]
              (json/generate jgen row-map json/default-date-format nil nil)))
          reducible-rows)

    (doto jgen
      (.writeEndArray)
      (.flush)
      (.close))))

(defn- respond-os [{cols-meta :cols} reducible-rows]
  (let [os (ByteArrayOutputStream.)]
    (write-to-stream! os (mapv :name cols-meta) reducible-rows)
    (String. (.toByteArray os) "UTF-8"))
  #_(streaming/streaming-response {:content-type "application/json; charset=utf-8"} [os _canceled-chan]
      (write-to-stream! os (mapv :name cols-meta) reducible-rows)))

(api.macros/defendpoint :get "/table/:id/data"
  "Fetch table data for Python transforms."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _ _ _ respond raise]
  (try
    (let [db-id (api/check-404 (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id))

         ;; TODO
          row-limit (or (request/limit) 10000)

          driver (t2/select-one-fn :engine :model/Database db-id)

          query {:source-table id, :limit row-limit}

          respond (fn [cols-meta reducible-rows]
                    (respond (-> (response/response (respond-os cols-meta reducible-rows))
                                 (response/content-type "application/json"))))]

      (execute-mbql-query driver db-id query respond))
    (catch Throwable e
      (raise e))))
