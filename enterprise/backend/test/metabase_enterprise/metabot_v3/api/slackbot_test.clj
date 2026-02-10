(ns metabase-enterprise.metabot-v3.api.slackbot-test
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.api.slackbot :as slackbot]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.upload.impl :as upload.impl]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(def ^:private test-signing-secret "test-signing-secret")
(def ^:private test-encryption-key (byte-array (repeat 64 42)))

(defmacro with-slackbot-setup
  "Wrap body with all required settings for slackbot to be fully configured."
  [& body]
  `(with-redefs [slackbot/validate-bot-token! (constantly {:ok true})
                 encryption/default-secret-key test-encryption-key]
     (mt/with-premium-features #{:metabot-v3 :sso-slack}
       (mt/with-temporary-setting-values [site-url "https://localhost:3000"
                                          metabot.settings/metabot-slack-signing-secret test-signing-secret
                                          metabot.settings/metabot-slack-bot-token "xoxb-test"
                                          sso-settings/slack-connect-client-id "test-client-id"
                                          sso-settings/slack-connect-client-secret "test-secret"]
         ~@body))))

(defn- compute-slack-signature
  "Compute a valid Slack signature for testing"
  [body timestamp]
  (let [message (str "v0:" timestamp ":" body)
        signature (-> (mac/hash message {:key test-signing-secret :alg :hmac+sha256})
                      codecs/bytes->hex)]
    (str "v0=" signature)))

(defn- slack-request-options
  "Build request options with valid Slack signature headers"
  [body]
  (let [timestamp (str (quot (System/currentTimeMillis) 1000))
        body-str (json/encode body)
        signature (compute-slack-signature body-str timestamp)]
    {:request-options {:headers {"x-slack-signature" signature
                                 "x-slack-request-timestamp" timestamp}}}))

(deftest manifest-endpoint-test
  (testing "GET /api/ee/metabot-v3/slack/manifest"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "https://localhost:3000"]
        (testing "with site-url configured"
          (testing "admins can access manifest"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/metabot-v3/slack/manifest")]
              (is (map? response))
              (is (contains? response :display_information))
              (is (contains? response :features))
              (is (contains? response :oauth_config))
              (is (contains? response :settings))))
          (testing "non-admins cannot access manifest"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 "ee/metabot-v3/slack/manifest"))))))
      (mt/with-temporary-setting-values [site-url nil]
        (testing "without site-url configured"
          (testing "raises a 503 error"
            (is (= "You must configure a site-url for Slack integration to work."
                   (mt/user-http-request :crowberto :get 503 "ee/metabot-v3/slack/manifest")))))))))

(deftest events-endpoint-test
  (testing "POST /api/ee/metabot-v3/slack/events"
    (with-slackbot-setup
      (testing "handles URL verification challenge"
        (let [body {:type "url_verification"
                    :token "Jhj5dZrVaK7ZwHHjRyZWbDl"
                    :challenge "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P"}
              response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                  (slack-request-options body)
                                  body)]
          (is (= "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P" response))))

      (testing "handles 'unknown' events with ack message"
        (let [body {:type "event_callback"
                    :event {:type "team_rename"
                            :event_ts "1234567890.000001"}}
              response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                  (slack-request-options body)
                                  body)]
          (is (= "ok" response))))

      (testing "handles message.im events"
        (let [body {:type "event_callback"
                    :event {:type "message"
                            :channel "D123"
                            :user "U123"
                            :ts "1234567890.000001"
                            :event_ts "1234567890.000001"
                            :channel_type "im"
                            :text "Hello from DM"}}
              response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                  (slack-request-options body)
                                  body)]
          (is (= "ok" response))))

      (testing "rejects requests without valid signature"
        (is (= "Slack request signature is not valid."
               (mt/client :post 401 "ee/metabot-v3/slack/events"
                          {:request-options {:headers {"x-slack-signature" "v0=invalid"
                                                       "x-slack-request-timestamp" "1234567890"}}}
                          {:type "url_verification"
                           :challenge "test"})))))))

(deftest feature-flag-test
  (testing "Endpoints require metabot-v3 premium feature"
    (mt/with-premium-features #{}
      (testing "GET /api/ee/metabot-v3/slack/manifest"
        (mt/assert-has-premium-feature-error "MetaBot"
                                             (mt/user-http-request :crowberto :get 402 "ee/metabot-v3/slack/manifest")))
      (testing "POST /api/ee/metabot-v3/slack/events"
        (mt/assert-has-premium-feature-error "MetaBot"
                                             (mt/client :post 402 "ee/metabot-v3/slack/events"
                                                        {:type "url_verification"
                                                         :challenge "test"}))))))

(defn- with-slackbot-mocks
  "Helper to set up common mocks for slackbot tests.
   Options:
   - :ai-text - The text response from make-ai-request
   - :data-parts - The data-parts returned from make-ai-request (default [])
   - :user-id - The user ID returned by slack-id->user-id. If not provided, defaults to rasta.
                Pass ::no-user to simulate an unlinked Slack user (returns nil).

   Calls body-fn with a map containing tracking atoms:
   {:post-calls, :delete-calls, :image-calls, :generate-png-calls, :ephemeral-calls, :fake-png-bytes}"
  [{:keys [ai-text data-parts user-id]
    :or {data-parts []
         user-id ::default}}
   body-fn]
  (let [post-calls (atom [])
        delete-calls (atom [])
        image-calls (atom [])
        generate-png-calls (atom [])
        ephemeral-calls (atom [])
        fake-png-bytes (byte-array [0x89 0x50 0x4E 0x47])
        mock-user-id (cond
                       (= user-id ::default) (mt/user->id :rasta)
                       (= user-id ::no-user) nil
                       :else user-id)]
    (mt/with-dynamic-fn-redefs
      [slackbot/slack-id->user-id (constantly mock-user-id)
       slackbot/fetch-thread (constantly {:ok true, :messages []})
       slackbot/post-message (fn [_ msg]
                               (swap! post-calls conj msg)
                               {:ok true
                                :ts "123"
                                :channel (:channel msg)
                                :message msg})
       slackbot/post-ephemeral-message (fn [_ msg]
                                         (swap! ephemeral-calls conj msg)
                                         {:ok true, :message_ts "1234567890.123456"})
       slackbot/delete-message (fn [_ msg]
                                 (swap! delete-calls conj msg)
                                 {:ok true})
       slackbot/make-ai-request (constantly {:text ai-text :data-parts data-parts})
       slackbot/generate-card-png (fn [card-id & _opts]
                                    (swap! generate-png-calls conj card-id)
                                    fake-png-bytes)
       slackbot/post-image (fn [_client image-bytes filename channel thread-ts]
                             (swap! image-calls conj {:image-bytes image-bytes
                                                      :filename filename
                                                      :channel channel
                                                      :thread-ts thread-ts})
                             {:ok true :file_id "F123"})]
      (body-fn {:post-calls post-calls
                :delete-calls delete-calls
                :image-calls image-calls
                :generate-png-calls generate-png-calls
                :ephemeral-calls ephemeral-calls
                :fake-png-bytes fake-png-bytes}))))

(deftest user-message-triggers-response-test
  (testing "POST /events with user message triggers AI response via Slack"
    (with-slackbot-setup
      (let [mock-ai-text "Here is your answer"
            event-body {:type "event_callback"
                        :event {:type "message"
                                :text "Hello!"
                                :user "U123"
                                :channel "C123"
                                :ts "1234567890.000001"
                                :event_ts "1234567890.000001"
                                :channel_type "im"}}]
        (with-slackbot-mocks
          {:ai-text mock-ai-text}
          (fn [{:keys [post-calls delete-calls]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              (u/poll {:thunk #(>= (count @post-calls) 2)
                       :done? true?
                       :timeout-ms 5000})
              (is (= "_Thinking..._" (:text (first @post-calls))))
              (is (= mock-ai-text (:text (second @post-calls))))
              (is (= 1 (count @delete-calls)))
              (is (= "_Thinking..._" (get-in (first @delete-calls) [:message :text]))))))))))

(deftest user-message-with-visualizations-test
  (testing "POST /events with visualizations uploads multiple images to Slack"
    (with-slackbot-setup
      (let [mock-ai-text "Here are your charts"
            ;; Multiple static_viz data parts
            mock-data-parts [{:type "static_viz" :value {:entity_id 101}}
                             {:type "static_viz" :value {:entity_id 202}}
                             ;; Include a non-viz data part to verify filtering
                             {:type "other_type" :value {:foo "bar"}}]
            event-body {:type "event_callback"
                        :event {:type "message"
                                :text "Show me charts"
                                :user "U123"
                                :channel "C456"
                                :ts "1234567890.000002"
                                :event_ts "1234567890.000002"
                                :channel_type "im"
                                :thread_ts "1234567890.000000"}}]
        (with-slackbot-mocks
          {:ai-text mock-ai-text
           :data-parts mock-data-parts}
          (fn [{:keys [post-calls delete-calls image-calls generate-png-calls fake-png-bytes]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))

              ;; Wait for text messages AND image uploads
              (u/poll {:thunk #(and (>= (count @post-calls) 2)
                                    (>= (count @image-calls) 2))
                       :done? true?
                       :timeout-ms 5000})

              (testing "text message flow works"
                (is (= "_Thinking..._" (:text (first @post-calls))))
                (is (= mock-ai-text (:text (second @post-calls))))
                (is (= 1 (count @delete-calls))))

              (testing "PNG generation called for each static_viz"
                (is (= 2 (count @generate-png-calls)))
                (is (= #{101 202} (set @generate-png-calls))))

              (testing "images uploaded with correct parameters"
                (is (= 2 (count @image-calls)))
                ;; Check channel and thread
                (is (every? #(= "C456" (:channel %)) @image-calls))
                (is (every? #(= "1234567890.000000" (:thread-ts %)) @image-calls))
                ;; Check filenames
                (is (= #{"chart-101.png" "chart-202.png"}
                       (set (map :filename @image-calls))))
                ;; Check image bytes match fake PNG
                (is (every? #(= (vec fake-png-bytes) (vec (:image-bytes %)))
                            @image-calls))))))))))

(deftest user-not-linked-sends-auth-message-test
  (testing "POST /events with unlinked user sends ephemeral auth message"
    (with-slackbot-setup
      (let [event-body {:type "event_callback"
                        :event {:type "message"
                                :text "Hello!"
                                :user "U-UNKNOWN-USER"
                                :channel "C123"
                                :ts "1234567890.000001"
                                :event_ts "1234567890.000001"
                                :channel_type "im"}}]
        (with-slackbot-mocks
          {:ai-text "Should not be called"
           :user-id ::no-user} ;; Simulate no linked user
          (fn [{:keys [post-calls ephemeral-calls]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              ;; Wait for ephemeral message
              (u/poll {:thunk #(= 1 (count @ephemeral-calls))
                       :done? true?
                       :timeout-ms 5000})
              (testing "no regular messages should be posted"
                (is (= 0 (count @post-calls))))
              (testing "ephemeral auth message sent to user"
                (is (=? [{:user "U-UNKNOWN-USER"
                          :channel "C123"
                          :text #"(?i).*connect.*slack.*metabase.*"}]
                        @ephemeral-calls))))))))))

;; -------------------------------- Setup Complete Tests --------------------------------

(defn- do-with-setup-override!
  "Helper to test setup-complete? with one setting disabled.
   `override` is a map that can contain:
   - :encryption - set to nil to disable encryption
   - :site-url - set to nil to disable site-url
   - :sso-slack - set to false to disable sso-slack feature
   - :signing-secret, :bot-token, :client-id, :client-secret - set to nil to disable"
  [{:keys [encryption site-url sso-slack signing-secret bot-token client-id client-secret]
    :or {encryption test-encryption-key
         site-url "https://localhost:3000"
         sso-slack true
         signing-secret test-signing-secret
         bot-token "xoxb-test"
         client-id "test-client-id"
         client-secret "test-secret"}}
   thunk]
  (with-redefs [slackbot/validate-bot-token! (constantly {:ok true})
                encryption/default-secret-key encryption
                premium-features/enable-sso-slack? (constantly sso-slack)]
    (mt/with-premium-features #{:metabot-v3 :sso-slack}
      (mt/with-temporary-setting-values [site-url site-url
                                         metabot.settings/metabot-slack-signing-secret signing-secret
                                         metabot.settings/metabot-slack-bot-token bot-token
                                         sso-settings/slack-connect-client-id client-id
                                         sso-settings/slack-connect-client-secret client-secret]
        (thunk)))))

(deftest setup-complete-test
  (let [request-body {:type "url_verification" :challenge "test-challenge"}
        post-events  #(mt/client :post %1 "ee/metabot-v3/slack/events"
                                 (slack-request-options request-body) request-body)]
    (testing "succeeds when all settings are configured"
      (do-with-setup-override! {}
                               #(is (= "test-challenge" (post-events 200)))))

    (doseq [[desc override] [["sso-slack feature disabled"    {:sso-slack false}]
                             ["client-id missing"             {:client-id nil}]
                             ["client-secret missing"         {:client-secret nil}]
                             ["bot-token missing"             {:bot-token nil}]
                             ["encryption disabled"           {:encryption nil}]
                             ["site-url disabled"             {:site-url nil}]]]
      (testing (str "returns 503 when " desc)
        (do-with-setup-override! override
                                 #(is (= "Slack integration is not fully configured." (post-events 503))))))

    (testing "returns 503 when signing-secret is missing (can't sign request)"
      (do-with-setup-override! {:signing-secret nil}
                               #(is (= "Slack integration is not fully configured."
                                       (mt/client :post 503 "ee/metabot-v3/slack/events" request-body)))))))

;; -------------------------------- CSV Upload Tests --------------------------------

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
    :or {uploads-enabled? false
         can-create-upload? true
         upload-result {:id 123 :name "uploaded_data"}
         download-content (.getBytes "col1,col2\nval1,val2")
         db-id 1}}
   body-fn]
  (let [upload-calls (atom [])
        download-calls (atom [])]
    (mt/with-dynamic-fn-redefs
      [upload.impl/current-database (constantly (when uploads-enabled?
                                                  {:id db-id
                                                   :uploads_schema_name nil
                                                   :uploads_table_prefix nil}))
       upload.impl/can-create-upload? (constantly can-create-upload?)
       upload.impl/create-csv-upload! (fn [params]
                                        (swap! upload-calls conj params)
                                        upload-result)
       slackbot/download-slack-file (fn [url]
                                      (swap! download-calls conj url)
                                      download-content)]
      (body-fn {:upload-calls upload-calls
                :download-calls download-calls}))))

(deftest csv-upload-disabled-test
  (testing "POST /events with file upload when uploads are disabled"
    (with-slackbot-setup
      (let [event-body {:type "event_callback"
                        :event {:type "message"
                                :subtype "file_share"
                                :text "Here's my data"
                                :user "U123"
                                :channel "C123"
                                :channel_type "im"
                                :ts "1234567890.000001"
                                :event_ts "1234567890.000001"
                                :files [{:id "F123"
                                         :name "data.csv"
                                         :filetype "csv"
                                         :url_private "https://files.slack.com/files/data.csv"
                                         :size 100}]}}]
        (with-upload-mocks!
          {:uploads-enabled? false}
          (fn [{:keys [upload-calls]}]
            (with-slackbot-mocks
              {:ai-text "CSV uploads are not enabled on this Metabase instance."}
              (fn [{:keys [post-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @post-calls) 2)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "AI responds with error message"
                    (is (= "CSV uploads are not enabled on this Metabase instance."
                           (:text (second @post-calls))))))))))))))

(deftest csv-upload-success-test
  (testing "POST /events with successful CSV upload"
    (with-slackbot-setup
      (let [event-body {:type "event_callback"
                        :event {:type "message"
                                :subtype "file_share"
                                :text "Here's my data"
                                :user "U123"
                                :channel "C123"
                                :channel_type "im"
                                :ts "1234567890.000001"
                                :event_ts "1234567890.000001"
                                :files [{:id "F123"
                                         :name "sales_data.csv"
                                         :filetype "csv"
                                         :url_private "https://files.slack.com/files/sales_data.csv"
                                         :size 100}]}}]
        (with-upload-mocks!
          {:uploads-enabled? true
           :can-create-upload? true
           :upload-result {:id 456 :name "Sales Data"}}
          (fn [{:keys [upload-calls download-calls]}]
            (with-slackbot-mocks
              {:ai-text "Your CSV has been uploaded successfully as a model."}
              (fn [{:keys [post-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @post-calls) 2)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "file was downloaded from Slack"
                    (is (= 1 (count @download-calls)))
                    (is (= "https://files.slack.com/files/sales_data.csv" (first @download-calls))))
                  (testing "upload was called with correct parameters"
                    (is (= 1 (count @upload-calls)))
                    (let [call (first @upload-calls)]
                      (is (= "sales_data.csv" (:filename call)))))
                  (testing "AI responds with success message"
                    (is (= "Your CSV has been uploaded successfully as a model."
                           (:text (second @post-calls))))))))))))))

(deftest csv-upload-non-csv-skipped-test
  (testing "POST /events with non-CSV file is skipped"
    (with-slackbot-setup
      (let [event-body {:type "event_callback"
                        :event {:type "message"
                                :subtype "file_share"
                                :text "Here's my file"
                                :user "U123"
                                :channel "C123"
                                :channel_type "im"
                                :ts "1234567890.000001"
                                :event_ts "1234567890.000001"
                                :files [{:id "F123"
                                         :name "document.pdf"
                                         :filetype "pdf"
                                         :url_private "https://files.slack.com/files/document.pdf"
                                         :size 100}]}}]
        (with-upload-mocks!
          {:uploads-enabled? true}
          (fn [{:keys [upload-calls download-calls]}]
            (with-slackbot-mocks
              {:ai-text "Only CSV files can be uploaded."}
              (fn [{:keys [post-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @post-calls) 2)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "no download was attempted"
                    (is (= 0 (count @download-calls))))
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "AI responds explaining PDF not supported"
                    (is (= "Only CSV files can be uploaded."
                           (:text (second @post-calls))))))))))))))

(deftest csv-upload-non-csv-no-text-test
  (testing "POST /events with non-CSV file and no text responds directly without AI"
    (with-slackbot-setup
      (let [event-body {:type "event_callback"
                        :event {:type "message"
                                :subtype "file_share"
                                ;; No :text field - user uploaded file without typing anything
                                :user "U123"
                                :channel "C123"
                                :channel_type "im"
                                :ts "1234567890.000001"
                                :event_ts "1234567890.000001"
                                :files [{:id "F123"
                                         :name "query_result.xlsx"
                                         :filetype "xlsx"
                                         :url_private "https://files.slack.com/files/query_result.xlsx"
                                         :size 100}]}}]
        (with-upload-mocks!
          {:uploads-enabled? true}
          (fn [{:keys [upload-calls download-calls]}]
            (with-slackbot-mocks
              {:ai-text "This should not be called"}
              (fn [{:keys [post-calls delete-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
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
    (with-slackbot-setup
      (let [event-body {:type "event_callback"
                        :event {:type "message"
                                :subtype "file_share"
                                :text "Here are my files"
                                :user "U123"
                                :channel "C123"
                                :channel_type "im"
                                :ts "1234567890.000001"
                                :event_ts "1234567890.000001"
                                :files [{:id "F1"
                                         :name "data.csv"
                                         :filetype "csv"
                                         :url_private "https://files.slack.com/files/data.csv"
                                         :size 100}
                                        {:id "F2"
                                         :name "report.pdf"
                                         :filetype "pdf"
                                         :url_private "https://files.slack.com/files/report.pdf"
                                         :size 200}
                                        {:id "F3"
                                         :name "more_data.tsv"
                                         :filetype "tsv"
                                         :url_private "https://files.slack.com/files/more_data.tsv"
                                         :size 150}]}}]
        (with-upload-mocks!
          {:uploads-enabled? true
           :upload-result {:id 789 :name "Uploaded Data"}}
          (fn [{:keys [upload-calls download-calls]}]
            (with-slackbot-mocks
              {:ai-text "Uploaded 2 files, skipped 1 non-CSV file."}
              (fn [{:keys [post-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @post-calls) 2)
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
    (with-slackbot-setup
      (let [too-large-size (inc (* 1024 1024 1024)) ;; Just over 1GB
            event-body {:type "event_callback"
                        :event {:type "message"
                                :subtype "file_share"
                                :text "Here's my huge file"
                                :user "U123"
                                :channel "C123"
                                :channel_type "im"
                                :ts "1234567890.000001"
                                :event_ts "1234567890.000001"
                                :files [{:id "F123"
                                         :name "huge_data.csv"
                                         :filetype "csv"
                                         :url_private "https://files.slack.com/files/huge_data.csv"
                                         :size too-large-size}]}}]
        (with-upload-mocks!
          {:uploads-enabled? true}
          (fn [{:keys [upload-calls download-calls]}]
            (with-slackbot-mocks
              {:ai-text "The file exceeds the 1GB size limit."}
              (fn [{:keys [post-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @post-calls) 2)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "file was not downloaded due to size"
                    (is (= 0 (count @download-calls))))
                  (testing "upload was not attempted"
                    (is (= 0 (count @upload-calls)))))))))))))

(deftest csv-upload-no-permission-test
  (testing "POST /events with file upload when user lacks permission"
    (with-slackbot-setup
      (let [event-body {:type "event_callback"
                        :event {:type "message"
                                :subtype "file_share"
                                :text "Here's my data"
                                :user "U123"
                                :channel "C123"
                                :channel_type "im"
                                :ts "1234567890.000001"
                                :event_ts "1234567890.000001"
                                :files [{:id "F123"
                                         :name "data.csv"
                                         :filetype "csv"
                                         :url_private "https://files.slack.com/files/data.csv"
                                         :size 100}]}}]
        (with-upload-mocks!
          {:uploads-enabled? true
           :can-create-upload? false}
          (fn [{:keys [upload-calls]}]
            (with-slackbot-mocks
              {:ai-text "You don't have permission to upload files."}
              (fn [{:keys [post-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @post-calls) 2)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "AI responds with permission error"
                    (is (= "You don't have permission to upload files."
                           (:text (second @post-calls))))))))))))))

(deftest csv-file-detection-test
  (testing "csv-file? correctly identifies CSV/TSV files"
    (is (true? (#'slackbot/csv-file? {:filetype "csv"})))
    (is (true? (#'slackbot/csv-file? {:filetype "tsv"})))
    (is (false? (#'slackbot/csv-file? {:filetype "pdf"})))
    (is (false? (#'slackbot/csv-file? {:filetype "xlsx"})))
    (is (false? (#'slackbot/csv-file? {:filetype nil})))
    (is (false? (#'slackbot/csv-file? {})))))
