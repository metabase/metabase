(ns metabase.slackbot.uploads
  "CSV upload handling for slackbot."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.analytics-interface.core :as analytics]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.upload.core :as upload]
   [metabase.util.log :as log])
  (:import
   (java.io File InputStream OutputStream)))

(set! *warn-on-reflection* true)

(def ^:private max-file-size-bytes
  "Maximum file size for CSV uploads (200MB)"
  (* 200 1024 1024))

(def ^:private allowed-csv-filetypes
  "File types that are allowed for CSV uploads"
  #{"csv" "tsv"})

(defn- csv-file?
  "Whether `file` is a CSV or TSV, going by the filetype Slack reports."
  [{:keys [filetype]}]
  (contains? allowed-csv-filetypes filetype))

(defn- remote-file?
  "Whether a Slack file is stored outside Slack, so its URL and size come from the app that registered it rather
  than from Slack. Those are never downloaded, whatever filetype they claim."
  [{:keys [mode]}]
  (= "external" mode))

(defn- size-limit-message
  "The user-facing message for a file over [[max-file-size-bytes]]."
  [filename]
  (format "File '%s' exceeds %dMB size limit" filename (quot max-file-size-bytes (* 1024 1024))))

(defn- file-size-error
  "Why `file` is too large to upload, or nil if it is not."
  [{:keys [name size]}]
  (when (> size max-file-size-bytes)
    (size-limit-message name)))

(defn- copy-to-file!
  "Copy `in` into `file`, refusing more than [[max-file-size-bytes]]. The size on the event is only what the sender
  declared, so the limit has to hold as the bytes arrive."
  [^InputStream in ^File file filename]
  (let [buf (byte-array 8192)]
    (with-open [^OutputStream out (io/output-stream file)]
      (loop [written 0]
        (let [n (.read in buf)]
          (when-not (neg? n)
            (let [total (+ written n)]
              (when (> total max-file-size-bytes)
                (throw (ex-info (size-limit-message filename) {:status-code 400})))
              (.write out buf 0 n)
              (recur total))))))))

(defn- upload-target
  "The database uploads go to, with the schema and table prefix to create tables under, or nil if no
  database has uploads enabled."
  []
  (when-let [db (upload/current-database)]
    {:db           db
     :schema-name  (:uploads_schema_name db)
     :table-prefix (:uploads_table_prefix db)}))

(defn- process-csv-file
  "Process a single CSV file upload. Returns a result map with either
   :model-id/:model-name (success) or :error (failure)."
  [client {:keys [db schema-name table-prefix]} {:keys [name url_private] :as file}]
  (if-let [size-error (file-size-error file)]
    (do
      (log/warnf "[slackbot] File exceeds size limit: error=%s" size-error)
      {:error size-error :filename name})
    (try
      ;; [[upload/create-csv-upload!]] reads the file more than once, so the download has to land on
      ;; disk first.
      (let [temp-file (File/createTempFile "slack-upload-" (str "-" name))]
        (try
          (with-open [^InputStream stream (slackbot.client/download-file-stream client url_private)]
            (copy-to-file! stream temp-file name))
          (let [result (upload/create-csv-upload!
                        {:filename      name
                         :file          temp-file
                         :db-id         (:id db)
                         :schema-name   schema-name
                         :table-prefix  table-prefix
                         :collection-id nil})]
            (log/infof "[slackbot] File uploaded: model_id=%s" (:id result))
            (analytics/inc! :metabase-slackbot/file-uploads {:result "success"})
            {:filename   name
             :model-id   (:id result)
             :model-name (:name result)})
          (finally
            (io/delete-file temp-file true))))
      (catch Exception e
        (log/warnf "[slackbot] File upload failed: error=%s" (ex-message e))
        (analytics/inc! :metabase-slackbot/file-uploads {:result "error"})
        {:error (ex-message e) :filename name}))))

(defn- process-file-uploads
  "Process all files from a Slack event. Returns a map with:
   :results - seq of individual file results
   :skipped - seq of non-CSV filenames that were skipped
   :remote  - seq of filenames refused for being stored outside Slack"
  [client target files]
  (let [{remote-files true local-files false}  (group-by remote-file? files)
        {csv-files true other-files false}     (group-by csv-file? local-files)
        skipped                                (mapv :name other-files)
        remote                                 (mapv :name remote-files)]
    (when (seq skipped)
      (log/debugf "[slackbot] Skipping %d non-CSV files" (count skipped)))
    (when (seq remote)
      (log/debugf "[slackbot] Refusing %d files stored outside Slack" (count remote)))
    {:results (mapv #(process-csv-file client target %) csv-files)
     :skipped skipped
     :remote  remote}))

(defn- assistant-message
  "One message to inject into the AI request."
  [content]
  {:role    :assistant
   :content content})

(def ^:private uploads-not-enabled-message
  "CSV uploads are not enabled. An administrator needs to configure a database for uploads in Admin > Settings > Uploads.")

(def ^:private no-permission-message
  "You don't have permission to upload files. Contact your Metabase administrator.")

(defn- build-upload-system-messages
  "Messages describing what became of each attached file."
  [{:keys [results skipped remote]}]
  (let [successes (filter :model-id results)
        failures  (filter :error results)]
    (cond-> []
      (seq successes)
      (conj (assistant-message
             (format "CSV files attached to this message are now available as models in Metabase: %s. You can help the user query this data."
                     (str/join ", " (map #(format "%s (model ID: %s)"
                                                  (:filename %)
                                                  (:model-id %))
                                         successes)))))

      (seq failures)
      (conj (assistant-message
             (format "These files attached to this message could not be uploaded: %s. Explain the errors to the user."
                     (str/join ", " (map #(format "%s: %s"
                                                  (:filename %)
                                                  (:error %))
                                         failures)))))

      (seq skipped)
      (conj (assistant-message
             (format "These files attached to this message are neither CSV nor TSV, so they were not uploaded: %s. Let the user know that only CSV and TSV files can be uploaded."
                     (str/join ", " skipped))))

      (seq remote)
      (conj (assistant-message
             (format "These files attached to this message are stored outside Slack, so Metabase cannot upload them: %s. Let the user know the file has to be uploaded to Slack itself."
                     (str/join ", " remote)))))))

(defn handle-file-uploads
  "Upload the CSV files attached to a Slack message, downloading each with `client`.
  Returns nil if there are no files, otherwise a map of:
   :upload-result   - per-file results and the names of skipped files, absent if nothing was attempted
   :system-messages - messages to inject into the AI request describing the outcome"
  [client files]
  (when (seq files)
    (if-let [{:keys [db schema-name] :as target} (upload-target)]
      (if-not (upload/can-create-upload? db schema-name)
        {:system-messages [(assistant-message no-permission-message)]}
        (let [result (process-file-uploads client target files)]
          {:upload-result   result
           :system-messages (build-upload-system-messages result)}))
      {:system-messages [(assistant-message uploads-not-enabled-message)]})))
