(ns metabase-enterprise.transforms.python-runner
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.driver :as driver]
   [metabase.query-processor.compile :as qp.compile]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedWriter OutputStream OutputStreamWriter File)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defn- safe-slurp
  "Safely slurp a file, returning empty string on error."
  [file]
  (try (slurp file) (catch Exception _ "")))

(defn- write-to-stream! [^OutputStream os col-names reducible-rows]
  (let [writer (-> os
                   (OutputStreamWriter. StandardCharsets/UTF_8)
                   (BufferedWriter.))]

    (run! (fn [row]
            (let [row-map (zipmap col-names row)]
              (json/encode-to row-map writer {})
              (.newLine writer)))
          reducible-rows)

    (doto writer
      (.flush)
      (.close))))

(defn- execute-mbql-query
  [driver db-id query respond]
  (driver/with-driver driver
    (let [native (qp.compile/compile {:type :query, :database db-id :query query})

          query {:database db-id
                 :type :native
                 :native native}]
      (qp.store/with-metadata-provider db-id
        (driver/execute-reducible-query driver query {} respond)))))

(defn- write-table-data! [id file]
  (let [db-id (t2/select-one-fn :db_id (t2/table-name :model/Table) :id id)
        driver (t2/select-one-fn :engine :model/Database db-id)
        ;; TODO: limit
        query {:source-table id}]
    (execute-mbql-query driver db-id query
                        (fn [{cols-meta :cols} reducible-rows]
                          (with-open [os (io/output-stream file)]
                            (write-to-stream! os (mapv :name cols-meta) reducible-rows))))))

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
            table-name->file (into {} (map (fn [[table-name id]]
                                             (let [file-name (gensym)
                                                   file (io/file (str work-dir "/" file-name ".jsonl"))]
                                               (write-table-data! id file)
                                               [table-name (.getAbsolutePath file)])))
                                   table-name->id)
            response (http/post (str server-url "/execute")
                                {:content-type     :json
                                 :accept           :json
                                 :body             (json/encode {:code          code
                                                                 :working_dir   work-dir
                                                                 :timeout       30
                                                                 :table_mapping table-name->file})
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
                {:status 200
                 :body   {:output (slurp output-path)
                          :stdout (safe-slurp (:stdout_file result))
                          :stderr (safe-slurp (:stderr_file result))}}
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
