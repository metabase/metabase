(ns metabase.slackbot.uploads
  "CSV and TSV upload handling for Slack."
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

(def ^:private max-slack-upload-size-bytes
  "Maximum Slack upload size, independent of the 50 MB HTTP multipart upload limit."
  (* 200 1024 1024))

(def ^:private supported-filetypes
  "Slack file types that can be uploaded."
  #{"csv" "tsv"})

(defn- supported-file?
  "Whether Slack reports `file` as a CSV or TSV."
  [{:keys [filetype]}]
  (contains? supported-filetypes filetype))

(defn- remote-file?
  "Whether Slack reports `file` as stored outside Slack, so its URL and size come from the app that registered it
  rather than from Slack. Those are never downloaded, whatever filetype they claim."
  [{:keys [mode]}]
  (= "external" mode))

(defn- size-limit-message
  "The message for a file over [[max-slack-upload-size-bytes]]."
  [filename]
  (format "I couldn't upload %s because it is larger than the %d MB limit."
          filename
          (quot max-slack-upload-size-bytes (* 1024 1024))))

(defn- file-size-error
  "Why `file` is too large to upload, or nil if it is not."
  [{:keys [name size]}]
  (when (> size max-slack-upload-size-bytes)
    (size-limit-message name)))

(defn- copy-to-file!
  "Copy `in` into `file`, refusing more than [[max-slack-upload-size-bytes]]. The size on the event is only what
  the sender declared, so the limit has to hold as the bytes arrive."
  [^InputStream in ^File file filename]
  (let [buf (byte-array 8192)]
    (with-open [^OutputStream out (io/output-stream file)]
      (loop [written 0]
        (let [n (.read in buf)]
          (when-not (neg? n)
            (let [total (+ written n)]
              (when (> total max-slack-upload-size-bytes)
                (throw (ex-info (size-limit-message filename) {:status-code 400, ::over-size-limit true})))
              (.write out buf 0 n)
              (recur total))))))))

(defn- upload-target
  "The upload database, schema, and table prefix, or nil when uploads are not configured."
  []
  (when-let [db (upload/current-database)]
    {:db           db
     :schema-name  (:uploads_schema_name db)
     :table-prefix (:uploads_table_prefix db)}))

(defn- create-temp-file!
  "Create a temporary file using the validated Slack file type as its suffix."
  [filetype]
  (File/createTempFile "slack-upload-" (str "." filetype)))

(defn- upload-file!
  "Upload one CSV or TSV file.
  Returns `:filename`, `:model-id`, and `:model-name` on success, or `:filename` and a safe `:error` on failure."
  [client {:keys [db schema-name table-prefix]} {:keys [name filetype url_private] :as file}]
  (if-let [size-error (file-size-error file)]
    (do
      (log/warnf "[slackbot] File exceeds size limit: error=%s" size-error)
      {:error size-error, :filename name})
    (try
      ;; [[upload/create-csv-upload!]] reads the file more than once, so download it to disk first.
      (let [temp-file (create-temp-file! filetype)]
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
            (log/infof "[slackbot] File uploaded: model_id=%d" (:id result))
            (analytics/inc! :metabase-slackbot/file-uploads {:result "success"})
            {:filename   name
             :model-id   (:id result)
             :model-name (:name result)})
          (finally
            (io/delete-file temp-file true))))
      (catch Exception e
        (log/warn e "[slackbot] File upload failed" {:filename name})
        (analytics/inc! :metabase-slackbot/file-uploads {:result "error"})
        ;; Only the size limit is safe to repeat back; anything else could describe the instance's internals.
        {:error    (if (::over-size-limit (ex-data e))
                     (ex-message e)
                     (format "I couldn't upload %s because something went wrong. Please try again." name))
         :filename name}))))

(defn- upload-files!
  "Upload supported files and return their results with the names of unsupported and remote files."
  [client target files]
  (let [{remote-files true local-files false}          (group-by remote-file? files)
        {supported-files true unsupported-files false} (group-by supported-file? local-files)
        skipped                                        (mapv :name unsupported-files)
        remote                                         (mapv :name remote-files)]
    (when (seq skipped)
      (log/debugf "[slackbot] Skipping %d unsupported files" (count skipped)))
    (when (seq remote)
      (log/debugf "[slackbot] Refusing %d files stored outside Slack" (count remote)))
    {:results (mapv #(upload-file! client target %) supported-files)
     :skipped skipped
     :remote  remote}))

(defn- assistant-history-message
  "A Metabot message that can be sent directly or added to the AI history."
  [content]
  {:role    :assistant
   :content content})

(def ^:private uploads-not-configured-message
  "Uploads aren't configured yet. Ask your Metabase admin to choose an upload database in Admin > Settings > Uploads.")

(def ^:private upload-unavailable-message
  "I can't upload files to the configured database. Ask your Metabase admin to check the upload settings and your permissions.")

(defn- uploaded-files-message
  "A Metabot message describing successful uploads."
  [successes]
  (if (= 1 (count successes))
    (let [{:keys [filename model-id model-name]} (first successes)]
      (format "I uploaded %s as the Metabase model %s (ID %d). I can help you query it." filename model-name model-id))
    (format "I uploaded these files as Metabase models: %s. I can help you query them."
            (str/join ", " (map #(format "%s as %s (ID %d)"
                                         (:filename %)
                                         (:model-name %)
                                         (:model-id %))
                                successes)))))

(defn- failed-files-message
  "A Metabot message describing failed uploads."
  [failures]
  (str/join " " (map :error failures)))

(defn- skipped-files-message
  "A Metabot message describing unsupported attachments."
  [skipped]
  (format "I can only upload CSV and TSV files, so I skipped the following: %s." (str/join ", " skipped)))

(defn- remote-files-message
  "A Metabot message describing attachments stored outside Slack."
  [remote]
  (format "I can only upload files stored in Slack itself, so I skipped the following: %s."
          (str/join ", " remote)))

(defn- build-upload-history
  "Metabot messages describing what became of each attached file."
  [{:keys [results skipped remote]}]
  (let [successes (filter :model-id results)
        failures  (filter :error results)]
    (cond-> []
      (seq successes)
      (conj (assistant-history-message (uploaded-files-message successes)))

      (seq failures)
      (conj (assistant-history-message (failed-files-message failures)))

      (seq skipped)
      (conj (assistant-history-message (skipped-files-message skipped)))

      (seq remote)
      (conj (assistant-history-message (remote-files-message remote))))))

(defn handle-file-uploads!
  "Handle attached CSV and TSV files with `client`.
  Returns nil when no files are attached.
  Otherwise returns Metabot `:extra-history` and includes `:upload-result` when file processing was attempted."
  [client files]
  (when (seq files)
    (if-let [{:keys [db schema-name] :as target} (upload-target)]
      (if-not (upload/can-create-upload? db schema-name)
        {:extra-history [(assistant-history-message upload-unavailable-message)]}
        (let [result (upload-files! client target files)]
          {:upload-result result
           :extra-history (build-upload-history result)}))
      {:extra-history [(assistant-history-message uploads-not-configured-message)]})))
