(ns metabase.slackbot.uploads-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.settings :as channel.settings]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.test-util :as tu]
   [metabase.slackbot.uploads :as slackbot.uploads]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.upload.db :as upload.db]
   [metabase.upload.impl :as upload.impl]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- with-upload-mocks!
  "Helper to set up common mocks for CSV upload tests.
   Options:
   - :uploads-enabled? - Whether uploads are enabled (default false)
   - :can-create-upload? - Whether user can create uploads (default true)
   - :upload-result - Result from create-csv-upload! (default success with id 123)
   - :download-content - Content returned by download-slack-file (default valid CSV)

   Calls body-fn with a map containing tracking atoms:
   {:upload-calls, :download-calls}"
  [{:keys [uploads-enabled? can-create-upload? upload-result download-content db-id]
    :or   {uploads-enabled?   false
           can-create-upload? true
           upload-result      {:id 123 :name "uploaded_data"}
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
                                        upload-result)
       slackbot.client/download-file-stream  (fn [_client url]
                                               (swap! download-calls conj url)
                                               (io/input-stream download-content))]
      (body-fn {:upload-calls   upload-calls
                :download-calls download-calls}))))

(deftest csv-upload-disabled-test
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
              {:ai-text "CSV uploads are not enabled on this Metabase instance."}
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
                    (is (some #(= "CSV uploads are not enabled on this Metabase instance." %)
                              @append-text-calls))))))))))))

(deftest csv-upload-success-test
  (testing "POST /events with successful CSV upload"
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here's my data"
                                :files   [tu/slack-csv-file]})]
        (with-upload-mocks!
          {:uploads-enabled? true
           :can-create-upload? true
           :upload-result {:id 456 :name "Data"}}
          (fn [{:keys [upload-calls download-calls]}]
            (tu/with-slackbot-mocks
              {:ai-text "Your CSV has been uploaded successfully as a model."}
              (fn [{:keys [stop-stream-calls append-text-calls]}]
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
                              @append-text-calls))))))))))))

(deftest csv-upload-non-csv-skipped-test
  (testing "POST /events with non-CSV file is skipped"
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
              {:ai-text "Only CSV files can be uploaded."}
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
                    (is (some #(= "Only CSV files can be uploaded." %)
                              @append-text-calls))))))))))))

(deftest csv-upload-non-csv-no-text-test
  (testing "POST /events with non-CSV file and no text responds directly without AI"
    (tu/with-slackbot-setup
      ;; No :text field - user uploaded file without typing anything
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
              (fn [{:keys [post-calls delete-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @post-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  ;; When AI is called, there are 2 posts (Thinking... then response) and 1 delete.
                  ;; When AI is skipped, there is just 1 post and no deletes.
                  (testing "AI was not called (only 1 post, no deletes)"
                    (is (= 1 (count @post-calls)))
                    (is (= 0 (count @delete-calls))))
                  (testing "no download was attempted"
                    (is (= 0 (count @download-calls))))
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "responds directly with skip message"
                    #_{:clj-kondo/ignore [:unresolved-namespace]}
                    (let [message-text (:text (first @post-calls))]
                      (is (str/includes? message-text "can only process CSV and TSV"))
                      (is (str/includes? message-text "query_result.xlsx")))))))))))))

(deftest csv-upload-mixed-files-test
  (testing "POST /events with mix of CSV and non-CSV files"
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
           :upload-result {:id 789 :name "Uploaded Data"}}
          (fn [{:keys [upload-calls download-calls]}]
            (tu/with-slackbot-mocks
              {:ai-text "Uploaded 2 files, skipped 1 non-CSV file."}
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

(deftest csv-upload-file-too-large-test
  (testing "POST /events with file exceeding size limit"
    (tu/with-slackbot-setup
      (let [too-large-size (inc (* 200 1024 1024)) ;; Just over 200MB
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
              {:ai-text "The file exceeds the 200MB size limit."}
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

(deftest csv-upload-no-permission-test
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
              {:ai-text "You don't have permission to upload files."}
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
                    (is (some #(= "You don't have permission to upload files." %)
                              @append-text-calls))))))))))))

(deftest process-csv-file-streams-to-temp-file-test
  (testing "process-csv-file streams download content through a temp file to the upload fn"
    (let [csv-content   "col1,col2\nfoo,bar\nbaz,qux"
          uploaded-file (atom nil)]
      (mt/with-dynamic-fn-redefs
        [slackbot.client/download-file-stream (fn [_client _url]
                                                (io/input-stream (.getBytes csv-content)))
         upload.impl/create-csv-upload!       (fn [{:keys [file] :as _params}]
                                                (reset! uploaded-file (slurp file))
                                                {:id 1 :name "test"})
         ;; stub out the token lookup
         channel.settings/unobfuscated-slack-app-token (constantly "xoxb-fake")]
        (let [result (#'slackbot.uploads/process-csv-file
                      {:db_id 1 :schema_name nil :table_prefix nil}
                      {:name "test.csv" :url_private "https://example.com/test.csv" :size 100})]
          (is (= 1 (:model-id result)))
          (testing "file content was streamed correctly through temp file"
            (is (= csv-content @uploaded-file))))))))

(deftest ^:parallel csv-file-detection-test
  (testing "csv-file? correctly identifies CSV/TSV files"
    (is (true? (#'slackbot.uploads/csv-file? {:filetype "csv"})))
    (is (true? (#'slackbot.uploads/csv-file? {:filetype "tsv"})))
    (is (false? (#'slackbot.uploads/csv-file? {:filetype "pdf"})))
    (is (false? (#'slackbot.uploads/csv-file? {:filetype "xlsx"})))
    (is (false? (#'slackbot.uploads/csv-file? {:filetype nil})))
    (is (false? (#'slackbot.uploads/csv-file? {})))))
