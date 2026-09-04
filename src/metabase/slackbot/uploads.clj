(ns metabase.slackbot.uploads
  "CSV upload handling for slackbot."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.analytics-interface.core :as analytics]
   [metabase.channel.settings :as channel.settings]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.db :as slackbot.db]
   [metabase.upload.core :as upload]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private max-file-size-bytes
  "Maximum file size for CSV uploads (200MB)"
  (* 200 1024 1024))

(def ^:private allowed-csv-filetypes
  "File types that are allowed for CSV uploads"
  #{"csv" "tsv"})

(defn- csv-file?
  "Check if a Slack file is a CSV/TSV based on filetype."
  [{:keys [filetype]}]
  (contains? allowed-csv-filetypes filetype))

(defn- validate-file-size
  "Returns nil if valid, error string if too large."
  [{:keys [name size]}]
  (when (> size max-file-size-bytes)
    (format "File '%s' exceeds %dMB size limit" name (quot max-file-size-bytes (* 1024 1024)))))

(defn- upload-error-message
  "Failure text safe to hand to the model. Deliberate upload errors, 4xx `ex-info`s
   whose message was written for the user, pass through; raw driver and JDBC errors
   can name hosts or accounts, so they get a generic line and stay in the logs. A 4xx
   whose message contains its cause's text is a relabeled raw error, not an authored
   one. A relabel that drops its cause entirely reads as authored and passes through."
  [e]
  (let [{:keys [status-code]} (ex-data e)
        cause-message         (some-> (ex-cause e) ex-message)]
    (if (and status-code
             (<= 400 status-code 499)
             (not (and (seq cause-message)
                       (str/includes? (str (ex-message e)) cause-message))))
      (ex-message e)
      "the upload failed with an internal error on the Metabase server; details are in the server logs")))

(defn- upload-settings
  "Get upload settings map. Returns nil if uploads are not enabled."
  []
  (when-let [db (upload/current-database)]
    {:db_id        (:id db)
     :schema_name  (:uploads_schema_name db)
     :table_prefix (:uploads_table_prefix db)}))

(defn- process-csv-file
  "Process a single CSV file upload. Returns a result map with either
   :model-id/:model-name (success) or :error (failure)."
  [{:keys [db_id schema_name table_prefix]} {:keys [name url_private] :as file}]
  (if-let [size-error (validate-file-size file)]
    (do
      (log/warnf "[slackbot] File exceeds size limit: error=%s" size-error)
      {:error size-error :filename name})
    (let [temp-file (java.io.File/createTempFile "slack-upload-" (str "-" name))]
      (try
        (with-open [^java.io.InputStream stream (slackbot.client/download-file-stream {:token (channel.settings/unobfuscated-slack-app-token)} url_private)]
          (io/copy stream temp-file)
          (let [result (upload/create-csv-upload!
                        {:filename      name
                         :file          temp-file
                         :db-id         db_id
                         :schema-name   schema_name
                         :table-prefix  table_prefix
                         :collection-id nil})]
            (log/infof "[slackbot] File uploaded: model_id=%d" (:id result))
            (analytics/inc! :metabase-slackbot/file-uploads {:result "success"})
            {:filename name
             :model-id (:id result)
             :model-name (:name result)}))
        (catch Exception e
          (log/warnf e "[slackbot] File upload failed: error=%s" (ex-message e))
          (analytics/inc! :metabase-slackbot/file-uploads {:result "error"})
          {:error (upload-error-message e) :filename name})
        (finally
          (io/delete-file temp-file true))))))

(defn- process-file-uploads
  "Process all files from a Slack event. Returns a map with:
   :results - seq of individual file results
   :skipped - seq of non-CSV filenames that were skipped"
  [settings files]
  (let [{csv-files true other-files false} (group-by csv-file? files)
        skipped (mapv :name other-files)]
    (when (seq skipped)
      (log/debugf "[slackbot] Skipping %d non-CSV files" (count skipped)))
    {:results (mapv (partial process-csv-file settings) csv-files)
     :skipped skipped}))

(defn- build-upload-system-messages
  "Build system messages to inject into AI request about uploads."
  [{:keys [results skipped]}]
  (let [successes (filter :model-id results)
        failures (filter :error results)]
    (cond-> []
      (seq successes)
      (conj {:role :assistant
             :content (format "The following message included 1 or more attached CSV files which are now available as models in Metabase: %s. You can help them query this data."
                              (str/join ", " (map #(format "%s (model ID: %d)"
                                                           (:filename %)
                                                           (:model-id %))
                                                  successes)))})

      (seq failures)
      (conj {:role :assistant
             :content (format "The following message included 1 or more attached CSV files. Some file uploads failed: %s. Explain these errors to the user."
                              (str/join ", " (map #(format "%s: %s"
                                                           (:filename %)
                                                           (:error %))
                                                  failures)))})

      (seq skipped)
      (conj {:role :assistant
             :content (format "The following message included 1 or more non-CSV files which are not supported: %s. Let them know only CSV files can be uploaded."
                              (str/join ", " skipped))}))))

(defn handle-file-uploads
  "Handle file uploads if present. Returns nil if no files, otherwise
   returns upload result map and messages to inject into AI request."
  [files]
  (when (seq files)
    (if-let [{:keys [db_id schema_name] :as settings} (upload-settings)]
      (let [db (slackbot.db/database db_id)]
        (if-not (upload/can-create-upload? db schema_name)
          {:error "You don't have permission to upload files. Contact your Metabase administrator."}
          (let [result (process-file-uploads settings files)]
            {:upload-result result
             :system-messages (build-upload-system-messages result)})))
      {:error "CSV uploads are not enabled. An administrator needs to configure a database for uploads in Admin > Settings > Uploads."})))
