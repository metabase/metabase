(ns metabase.python-runner.api
  "API endpoints for executing Python code in a sandboxed environment."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io File)
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
           #_(doseq [^File file# temp-files#]
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
  [code]
  (with-temp-files [code-file ["python_code_" ".py"]
                    output-file ["python_output_" ".txt"]
                    stdout-file ["python_stdout_" ".txt"]
                    stderr-file ["python_stderr_" ".txt"]]
    (spit code-file code)
    (let [script-args ["/bin/bash" "python-runner/run-sandbox.sh"
                       code-file output-file stdout-file stderr-file
                       ;; TODO
                       (transforms.settings/python-runner-base-url)
                       (transforms.settings/python-runner-api-key)]
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
   {:keys [code]} :- [:map [:code ms/NonBlankString]]]
  (api/check-superuser)
  (execute-python-code code))

(api.macros/defendpoint :get "/table/:id/data"
  "Fetch table data for Python transforms."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  ;; (api/check-superuser)
  (let [db-id (api/check-404 (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id))
        ;; _ (api/read-check :model/Database db-id)
        ;; _ (api/read-check :model/Table id)

        ;; TODO
        row-limit (or (request/limit) 10000)

        query {:database db-id
               :type :query
               :query {:source-table id
                       :limit row-limit}}]

    ;; TODO: jsonl
    (qp.streaming/streaming-response [rff :json]
      (qp/process-query query rff))))
