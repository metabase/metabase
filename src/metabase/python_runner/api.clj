(ns metabase.python-runner.api
  "API endpoints for executing Python code in a sandboxed environment."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as streaming]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2])
  (:import
   (com.fasterxml.jackson.core JsonGenerator)
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.io File ByteArrayOutputStream)
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
  "Execute Python code in a sandboxed environment using the run-sandbox.sh script."
  [code table-id]
  (with-temp-files [code-file ["python_code_" ".py"]
                    output-file ["python_output_" ".txt"]
                    stdout-file ["python_stdout_" ".txt"]
                    stderr-file ["python_stderr_" ".txt"]]
    (spit code-file code)
    (let [script-args ["/bin/bash" "python-runner/run-sandbox.sh"
                       code-file output-file stdout-file stderr-file
                       (transforms.settings/python-runner-base-url)
                       (transforms.settings/python-runner-api-key)
                       (str table-id)]
          result (apply shell/sh (conj script-args :dir (io/file ".")))]
      (if (zero? (:exit result))
        {:output      (slurp output-file)
         :output-file output-file
         :stdout      (slurp stdout-file)
         :stdout-file stdout-file
         :stderr      (slurp stderr-file)
         :stderr-file stderr-file}
        {:status 500
         :body
         {:error     (str "Execution failed: " (:err result))
          :exit-code (:exit result)
          :stdout    (safe-slurp stdout-file)
          :stderr    (safe-slurp stderr-file)}}))))

(api.macros/defendpoint :post "/execute"
  "Execute Python code in a sandboxed environment and return the output."
  [_route-params
   _query-params
   {:keys [code table-id]} :- [:map
                               [:code ms/NonBlankString]
                               [:table-id ms/PositiveInt]]]
  (api/check-superuser)
  (execute-python-code code table-id))

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
