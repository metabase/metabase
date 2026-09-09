(ns metabase.slackbot.uploads-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.encryption-test-util :as encryption-tu]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.test-util :as tu]
   [metabase.slackbot.uploads :as slackbot.uploads]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.upload.db :as upload.db]
   [metabase.upload.impl :as upload.impl]
   [metabase.util :as u])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :test-users)
  (encryption-tu/with-encrypted-app-db-fixture tu/test-encryption-key))

(defn- with-upload-mocks!
  "Run `body-fn` with configurable upload mocks and atoms that track upload and download calls."
  [{:keys [uploads-enabled? can-create-upload? upload-result upload-error download-content db-id]
    :or   {uploads-enabled?   false
           can-create-upload? true
           upload-result      {:id 123, :name "uploaded_data"}
           download-content   (.getBytes "col1,col2\nval1,val2")
           db-id              1}}
   body-fn]
  (let [upload-calls   (atom [])
        download-calls (atom [])]
    (mt/with-dynamic-fn-redefs
      [upload.db/current-database     (constantly (when uploads-enabled?
                                                    {:id                   db-id
                                                     :uploads_schema_name  nil
                                                     :uploads_table_prefix nil}))
       upload.impl/can-create-upload? (constantly can-create-upload?)
       upload.impl/create-csv-upload! (fn [params]
                                        (swap! upload-calls conj params)
                                        (if upload-error
                                          (throw upload-error)
                                          upload-result))
       slackbot.client/download-file-stream (fn [_client url]
                                              (swap! download-calls conj url)
                                              (io/input-stream download-content))]
      (body-fn {:upload-calls   upload-calls
                :download-calls download-calls}))))

(deftest ^:synchronized csv-upload-disabled-test
  (testing "POST /events with file upload when uploads are disabled"
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here's my data"
                                :files   [tu/slack-csv-file]})]
        (with-upload-mocks!
          {:uploads-enabled? false}
          (fn [{:keys [upload-calls]}]
            (tu/with-slackbot-mocks
              {:ai-text "Uploads aren't configured yet. Ask your Metabase admin to choose an upload database in Admin > Settings > Uploads."}
              (fn [{:keys [stop-stream-calls append-text-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "AI responds with error message"
                    (is (some #(= "Uploads aren't configured yet. Ask your Metabase admin to choose an upload database in Admin > Settings > Uploads." %)
                              @append-text-calls))))))))))))

(deftest ^:synchronized csv-upload-success-test
  (testing "POST /events with successful CSV upload"
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here's my data"
                                :files   [tu/slack-csv-file]})]
        (with-upload-mocks!
          {:uploads-enabled? true
           :can-create-upload? true
           :upload-result {:id 456, :name "Data"}}
          (fn [{:keys [upload-calls download-calls]}]
            (tu/with-slackbot-mocks
              {:ai-text "Your CSV has been uploaded successfully as a model."}
              (fn [{:keys [stop-stream-calls append-text-calls ai-request-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "file was downloaded from Slack"
                    (is (= 1 (count @download-calls)))
                    (is (= (:url_private tu/slack-csv-file) (first @download-calls))))
                  (testing "upload was called with correct parameters"
                    (is (= 1 (count @upload-calls)))
                    (let [call (first @upload-calls)]
                      (is (= (:name tu/slack-csv-file) (:filename call)))))
                  (testing "AI responds with success message"
                    (is (some #(= "Your CSV has been uploaded successfully as a model." %)
                              @append-text-calls)))
                  (testing "AI receives the upload details"
                    (is (some #(= {:role    :assistant
                                   :content "I uploaded data.csv as the Metabase model Data (ID 456). I can help you query it."}
                                  %)
                              (:messages (first @ai-request-calls))))))))))))))

(deftest ^:synchronized csv-upload-no-text-test
  (testing "POST /events with a CSV file and no text responds directly without AI"
    (tu/with-slackbot-setup
      (let [event-body (-> tu/base-dm-event
                           (update :event merge {:subtype "file_share", :files [tu/slack-csv-file]})
                           (update :event dissoc :text))]
        (with-upload-mocks!
          {:uploads-enabled? true
           :upload-result    {:id 456, :name "Data"}}
          (fn [_]
            (tu/with-slackbot-mocks
              {}
              (fn [{:keys [post-calls ai-request-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(= 1 (count @post-calls))
                           :done? true?
                           :timeout-ms 5000})
                  (is (empty? @ai-request-calls))
                  (is (= "I uploaded data.csv as the Metabase model Data (ID 456). I can help you query it."
                         (:text (first @post-calls)))))))))))))

(deftest ^:synchronized csv-upload-no-text-failure-test
  (testing "POST /events with a failed CSV upload and no text responds directly without exposing the backend error"
    (tu/with-slackbot-setup
      (let [event-body (-> tu/base-dm-event
                           (update :event merge {:subtype "file_share", :files [tu/slack-csv-file]})
                           (update :event dissoc :text))]
        (with-upload-mocks!
          {:uploads-enabled? true
           :upload-error     (ex-info "sensitive database details" {})}
          (fn [_]
            (tu/with-slackbot-mocks
              {}
              (fn [{:keys [post-calls ai-request-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(= 1 (count @post-calls))
                           :done? true?
                           :timeout-ms 5000})
                  (is (empty? @ai-request-calls))
                  (is (= "I couldn't upload data.csv because something went wrong. Please try again."
                         (:text (first @post-calls)))))))))))))

(deftest ^:synchronized unsupported-file-skipped-test
  (testing "POST /events skips an unsupported file"
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here's my file"
                                :files   [{:id          "F123"
                                           :name        "document.pdf"
                                           :filetype    "pdf"
                                           :url_private "https://files.slack.com/files/document.pdf"
                                           :size        100}]})]
        (with-upload-mocks!
          {:uploads-enabled? true}
          (fn [{:keys [upload-calls download-calls]}]
            (tu/with-slackbot-mocks
              {:ai-text "I can only upload CSV and TSV files, so I skipped document.pdf."}
              (fn [{:keys [stop-stream-calls append-text-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "no download was attempted"
                    (is (= 0 (count @download-calls))))
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "AI responds explaining PDF not supported"
                    (is (some #(= "I can only upload CSV and TSV files, so I skipped document.pdf." %)
                              @append-text-calls))))))))))))

(deftest ^:synchronized unsupported-file-no-text-test
  (testing "POST /events with an unsupported file and no text responds directly without AI"
    (tu/with-slackbot-setup
      ;; No `:text` field because the user uploaded a file without typing anything.
      (let [event-body (-> tu/base-dm-event
                           (update :event merge
                                   {:subtype "file_share"
                                    :files   [{:id          "F123"
                                               :name        "query_result.xlsx"
                                               :filetype    "xlsx"
                                               :url_private "https://files.slack.com/files/query_result.xlsx"
                                               :size        100}]})
                           (update :event dissoc :text))]
        (with-upload-mocks!
          {:uploads-enabled? true}
          (fn [{:keys [upload-calls download-calls]}]
            (tu/with-slackbot-mocks
              {:ai-text "This should not be called"}
              (fn [{:keys [post-calls ai-request-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @post-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "AI was not called"
                    (is (empty? @ai-request-calls)))
                  (testing "no download was attempted"
                    (is (= 0 (count @download-calls))))
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "responds directly with skip message"
                    (is (= "I can only upload CSV and TSV files, so I skipped the following: query_result.xlsx."
                           (:text (first @post-calls))))))))))))))

(deftest ^:synchronized mixed-file-upload-test
  (testing "POST /events with supported and unsupported files"
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here are my files"
                                :files   [(assoc tu/slack-csv-file :id "F1")
                                          {:id          "F2"
                                           :name        "report.pdf"
                                           :filetype    "pdf"
                                           :url_private "https://files.slack.com/files/report.pdf"
                                           :size        200}
                                          {:id          "F3"
                                           :name        "more_data.tsv"
                                           :filetype    "tsv"
                                           :url_private "https://files.slack.com/files/more_data.tsv"
                                           :size        150}]})]
        (with-upload-mocks!
          {:uploads-enabled? true
           :upload-result {:id 789, :name "Uploaded Data"}}
          (fn [{:keys [upload-calls download-calls]}]
            (tu/with-slackbot-mocks
              {:ai-text "I uploaded data.csv and more_data.tsv, and skipped report.pdf because I can only upload CSV and TSV files."}
              (fn [{:keys [stop-stream-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "only CSV/TSV files were downloaded"
                    (is (= 2 (count @download-calls)))
                    (is (= #{"https://files.slack.com/files/data.csv"
                             "https://files.slack.com/files/more_data.tsv"}
                           (set @download-calls))))
                  (testing "only CSV/TSV files were uploaded"
                    (is (= 2 (count @upload-calls)))))))))))))

(deftest ^:synchronized csv-upload-file-too-large-test
  (testing "POST /events with file exceeding size limit"
    (tu/with-slackbot-setup
      (let [too-large-size (inc (* 200 1024 1024)) ;; Just over 200 MB.
            event-body    (update tu/base-dm-event :event merge
                                  {:subtype "file_share"
                                   :text    "Here's my huge file"
                                   :files   [(assoc tu/slack-csv-file
                                                    :name        "huge_data.csv"
                                                    :url_private "https://files.slack.com/files/huge_data.csv"
                                                    :size        too-large-size)]})]
        (with-upload-mocks!
          {:uploads-enabled? true}
          (fn [{:keys [upload-calls download-calls]}]
            (tu/with-slackbot-mocks
              {:ai-text "I couldn't upload huge_data.csv because it is larger than the 200 MB limit."}
              (fn [{:keys [stop-stream-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "file was not downloaded due to size"
                    (is (= 0 (count @download-calls))))
                  (testing "upload was not attempted"
                    (is (= 0 (count @upload-calls)))))))))))))

(deftest ^:synchronized csv-upload-no-permission-test
  (testing "POST /events with file upload when user lacks permission"
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here's my data"
                                :files   [tu/slack-csv-file]})]
        (with-upload-mocks!
          {:uploads-enabled? true
           :can-create-upload? false}
          (fn [{:keys [upload-calls]}]
            (tu/with-slackbot-mocks
              {:ai-text "I can't upload files to the configured database. Ask your Metabase admin to check the upload settings and your permissions."}
              (fn [{:keys [stop-stream-calls append-text-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "AI responds with permission error"
                    (is (some #(= "I can't upload files to the configured database. Ask your Metabase admin to check the upload settings and your permissions." %)
                              @append-text-calls))))))))))))

(def ^:private test-client {:token "xoxb-fake"})

(def ^:private test-target
  {:db {:id 1}, :schema-name nil, :table-prefix nil})

(deftest upload-file-streams-to-temp-file-test
  (testing "upload-file! closes the download before uploading and removes the temporary file"
    (let [csv-content   "col1,col2\nfoo,bar\nbaz,qux"
          uploaded-file (atom nil)
          temp-file     (atom nil)
          stream-closed (atom false)]
      (mt/with-dynamic-fn-redefs
        [slackbot.client/download-file-stream (fn [client _url]
                                                (is (= test-client client))
                                                (proxy [ByteArrayInputStream] [(.getBytes csv-content)]
                                                  (close []
                                                    (reset! stream-closed true))))
         upload.impl/create-csv-upload!       (fn [{:keys [file] :as _params}]
                                                (is @stream-closed)
                                                (reset! temp-file file)
                                                (reset! uploaded-file (slurp file))
                                                {:id 1, :name "test"})]
        (is (=? {:filename   "test.csv"
                 :model-id   1
                 :model-name "test"}
                (#'slackbot.uploads/upload-file!
                 test-client
                 test-target
                 {:name "test.csv", :filetype "csv", :url_private "https://example.com/test.csv", :size 100})))
        (testing "file content was streamed correctly through temp file"
          (is (= csv-content @uploaded-file)))
        (testing "the validated file type is used as the suffix"
          (is (str/ends-with? (.getName ^java.io.File @temp-file) ".csv")))
        (testing "the temp file is cleaned up"
          (is (false? (.exists ^java.io.File @temp-file))))))))

(deftest upload-file-temp-file-failure-test
  (testing "a file that cannot be staged on disk is reported as a failed file, not thrown"
    (mt/with-dynamic-fn-redefs
      [slackbot.uploads/create-temp-file!      (fn [_filetype]
                                                 (throw (ex-info "sensitive filesystem details" {})))
       slackbot.client/download-file-stream    (fn [_client _url]
                                                 (throw (ex-info "download should not start" {})))]
      (is (= {:filename "data.csv"
              :error    "I couldn't upload data.csv because something went wrong. Please try again."}
             (#'slackbot.uploads/upload-file!
              test-client
              test-target
              {:name "data.csv", :filetype "csv", :url_private "https://example.com/x.csv", :size 100}))))))

(deftest upload-file-cleans-up-after-upload-failure-test
  (testing "the temporary file is removed and the backend error is not returned"
    (let [temp-file (atom nil)]
      (mt/with-dynamic-fn-redefs
        [slackbot.client/download-file-stream (fn [_client _url]
                                                (io/input-stream (.getBytes "col1,col2\nval1,val2")))
         upload.impl/create-csv-upload!       (fn [{:keys [file]}]
                                                (reset! temp-file file)
                                                (throw (ex-info "sensitive database details" {})))]
        (is (= {:filename "data.csv"
                :error    "I couldn't upload data.csv because something went wrong. Please try again."}
               (#'slackbot.uploads/upload-file!
                test-client
                test-target
                {:name "data.csv", :filetype "csv", :url_private "https://example.com/x.csv", :size 100})))
        (is (false? (.exists ^java.io.File @temp-file)))))))

(deftest build-upload-history-test
  (is (= [{:role    :assistant
           :content "I uploaded these files as Metabase models: data.csv as Data (ID 1), data.tsv as More Data (ID 2). I can help you query them."}
          {:role    :assistant
           :content "I couldn't upload broken.csv because something went wrong. Please try again."}
          {:role    :assistant
           :content "I can only upload CSV and TSV files, so I skipped the following: notes.txt."}]
         (#'slackbot.uploads/build-upload-history
          {:results [{:filename "data.csv", :model-id 1, :model-name "Data"}
                     {:filename "data.tsv", :model-id 2, :model-name "More Data"}
                     {:filename "broken.csv", :error "I couldn't upload broken.csv because something went wrong. Please try again."}]
           :skipped ["notes.txt"]}))))

(deftest handle-file-uploads!-nothing-attempted-test
  (testing "no files at all"
    (is (nil? (slackbot.uploads/handle-file-uploads! test-client []))))
  (testing "no database is configured for uploads"
    (mt/with-dynamic-fn-redefs [upload.db/current-database (constantly nil)]
      (is (= {:extra-history [{:role    :assistant
                               :content "Uploads aren't configured yet. Ask your Metabase admin to choose an upload database in Admin > Settings > Uploads."}]}
             (slackbot.uploads/handle-file-uploads! test-client [tu/slack-csv-file])))))
  (testing "the configured upload target is unavailable"
    (mt/with-dynamic-fn-redefs [upload.db/current-database     (constantly {:id 1})
                                upload.impl/can-create-upload? (constantly false)]
      (is (= {:extra-history [{:role    :assistant
                               :content "I can't upload files to the configured database. Ask your Metabase admin to check the upload settings and your permissions."}]}
             (slackbot.uploads/handle-file-uploads! test-client [tu/slack-csv-file]))))))

(deftest ^:parallel supported-file?-test
  (testing "only CSV and TSV files are supported"
    (is (true? (#'slackbot.uploads/supported-file? {:filetype "csv"})))
    (is (true? (#'slackbot.uploads/supported-file? {:filetype "tsv"})))
    (is (false? (#'slackbot.uploads/supported-file? {:filetype "pdf"})))
    (is (false? (#'slackbot.uploads/supported-file? {:filetype "xlsx"})))
    (is (false? (#'slackbot.uploads/supported-file? {:filetype "txt"})))
    (is (false? (#'slackbot.uploads/supported-file? {:filetype nil})))
    (is (false? (#'slackbot.uploads/supported-file? {})))))

(deftest ^:parallel remote-file?-test
  (testing "a file stored outside Slack is refused whatever filetype it claims, ordinary upload modes are kept"
    (is (true? (#'slackbot.uploads/remote-file? {:filetype "csv" :mode "external"})))
    (is (false? (#'slackbot.uploads/remote-file? {:filetype "csv" :mode "snippet"})))
    (is (false? (#'slackbot.uploads/remote-file? {:filetype "csv" :mode "hosted"})))
    (is (false? (#'slackbot.uploads/remote-file? {:filetype "csv"})))))

(deftest ^:parallel remote-files-are-reported-separately-test
  (testing "a remote CSV is refused for being remote, not reported as an unsupported filetype"
    (is (=? {:remote  ["evil.csv"]
             :skipped ["notes.pdf"]
             :results empty?}
            (#'slackbot.uploads/upload-files!
             nil
             {:db {:id 1}}
             [{:name "evil.csv", :filetype "csv", :mode "external", :url_private "https://evil.test/x.csv", :size 0}
              {:name "notes.pdf", :filetype "pdf", :mode "hosted", :url_private "https://files.slack.com/notes.pdf", :size 10}])))))

(deftest copy-to-file!-enforces-the-size-limit-test
  (testing "a stream longer than the limit is refused, since the event only carries the size the sender declared"
    (let [file (java.io.File/createTempFile "slackbot-cap-" ".csv")]
      (try
        (with-redefs-fn {#'slackbot.uploads/max-slack-upload-size-bytes 8}
          (fn []
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"larger than"
                                  (#'slackbot.uploads/copy-to-file!
                                   (io/input-stream (.getBytes "0123456789abcdefghij"))
                                   file
                                   "big.csv")))))
        (finally (io/delete-file file true))))))
