(ns metabase.python-runner.api
  "API endpoints for executing Python code in a sandboxed environment."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms])
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
  ;; TODO we take a db connection string not a db-id, as this API will eventually live on a separate service.
  ;;      this connection string might be replaced with a proxy, or we may use another protocol e.g. flight to
  ;;      provide data to the python process.
  [code db-connection-string]
  (with-temp-files [code-file ["python_code_" ".py"]
                    output-file ["python_output_" ".txt"]
                    stdout-file ["python_stdout_" ".txt"]
                    stderr-file ["python_stderr_" ".txt"]]
    (spit code-file code)

    (let [script-args (if db-connection-string
                        ["/bin/bash" "python-runner/run-sandbox.sh"
                         code-file output-file stdout-file stderr-file db-connection-string]
                        ["/bin/bash" "python-runner/run-sandbox.sh"
                         code-file output-file stdout-file stderr-file])
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
   {:keys [code db-connection-string]} :- [:map
                                           [:code ms/NonBlankString]
                                           [:db-connection-string {:optional true} [:maybe ms/NonBlankString]]]]
  (api/check-superuser)
  (execute-python-code code db-connection-string))
