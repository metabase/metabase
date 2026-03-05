(ns metabase-enterprise.metabot-v3.api.slackbot.uploads
  "CSV upload handling for slackbot."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.api.slackbot.client :as slackbot.client]
   [metabase.channel.settings :as channel.settings]
   [metabase.upload.core :as upload]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private max-file-size-bytes
  "Maximum file size for CSV uploads (1GB, matches Slack's limit)"
  (* 1024 1024 1024))

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
    (format "File '%s' exceeds 1GB size limit" name)))

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
      (log/warnf "[slackbot] File exceeds size limit: file=%s error=%s" name size-error)
      {:error size-error :filename name})
    (let [temp-file (java.io.File/createTempFile "slack-upload-" (str "-" name))]
      (try
        (let [content (slackbot.client/download-file {:token (channel.settings/unobfuscated-slack-app-token)} url_private)]
          (io/copy content temp-file)
          (let [result (upload/create-csv-upload!
                        {:filename      name
                         :file          temp-file
                         :db-id         db_id
                         :schema-name   schema_name
                         :table-prefix  table_prefix
                         :collection-id nil})]
            (log/infof "[slackbot] File uploaded: file=%s model_id=%d" name (:id result))
            {:filename name
             :model-id (:id result)
             :model-name (:name result)}))
        (catch Exception e
          (log/warnf "[slackbot] File upload failed: file=%s error=%s" name (ex-message e))
          {:error (ex-message e) :filename name})
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
      (log/debugf "[slackbot] Skipping non-CSV files: %s" (pr-str skipped)))
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
      (let [db (t2/select-one :model/Database :id db_id)]
        (if-not (upload/can-create-upload? db schema_name)
          {:error "You don't have permission to upload files. Contact your Metabase administrator."}
          (let [result (process-file-uploads settings files)]
            {:upload-result result
             :system-messages (build-upload-system-messages result)})))
      {:error "CSV uploads are not enabled. An administrator needs to configure a database for uploads in Admin > Settings > Uploads."})))
