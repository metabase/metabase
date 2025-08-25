(ns metabase.python-runner.api
  "API endpoints for executing Python code in a sandboxed environment."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io File)
   [java.nio.file Files]
   [java.nio.file.attribute FileAttribute]))

(set! *warn-on-reflection* true)

(defn- create-temp-file
  "Create a temporary file with the given prefix and suffix."
  [prefix suffix]
  (let [temp-file (Files/createTempFile prefix suffix (make-array FileAttribute 0))]
    (.toFile temp-file)))

(defn- with-temp-files
  "Execute function f with temporary files, ensuring cleanup."
  [file-specs f]
  (let [temp-files (mapv (fn [[prefix suffix]] (create-temp-file prefix suffix)) file-specs)]
    (try
      (f temp-files)
      (finally
        (doseq [^File file temp-files]
          (try (.delete file) (catch Exception _)))))))

(defn- safe-slurp
  "Safely slurp a file, returning empty string on error."
  [file]
  (try (slurp file) (catch Exception _ "")))

(defn- execute-python-code
  "Execute Python code in a sandboxed environment using the run-sandbox.sh script."
  [code]
  (with-temp-files [["python_code_" ".py"]
                    ["python_output_" ".txt"]
                    ["python_stdout_" ".txt"]
                    ["python_stderr_" ".txt"]]
    (fn [[^File code-file ^File output-file ^File stdout-file ^File stderr-file]]
      ;; Write the code to the temporary file
      (spit code-file code)

      ;; Execute the script with the temporary files as arguments
      (let [result (shell/sh "/bin/bash" "python-runner/run-sandbox.sh"
                             (.getAbsolutePath code-file)
                             (.getAbsolutePath output-file)
                             (.getAbsolutePath stdout-file)
                             (.getAbsolutePath stderr-file)
                             :dir (io/file "."))]
        (if (zero? (:exit result))
          ;; Read and return all outputs
          {:output (slurp output-file)
           :stdout (slurp stdout-file)
           :stderr (slurp stderr-file)}
          ;; Return error information
          {:error (str "Execution failed: " (:err result))
           :exit-code (:exit result)
           :stdout (safe-slurp stdout-file)
           :stderr (safe-slurp stderr-file)})))))

(api.macros/defendpoint :post "/execute"
  "Execute Python code in a sandboxed environment and return the output."
  [_route-params
   _query-params
   {:keys [code]} :- [:map
                      [:code ms/NonBlankString]]]
  (api/check-superuser)
  (log/info "Executing Python code in sandbox")
  (execute-python-code code))
