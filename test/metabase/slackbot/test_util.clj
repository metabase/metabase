(ns metabase.slackbot.test-util
  "Shared test infrastructure for slackbot tests."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [metabase.channel.slack :as channel.slack]
   [metabase.metabot.agent.core :as agent]
   [metabase.slackbot.api :as slackbot]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.config :as slackbot.config]
   [metabase.slackbot.query :as slackbot.query]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def test-signing-secret "test-signing-secret")
(def test-encryption-key (byte-array (repeat 64 42)))

(def base-dm-event
  {:type  "event_callback"
   :event {:type         "message"
           :text         "Hello!"
           :user         "U123"
           :channel      "C123"
           :ts           "1234567890.000001"
           :event_ts     "1234567890.000001"
           :channel_type "im"}})

(def base-mention-event
  {:type  "event_callback"
   :event {:type     "app_mention"
           :text     "<@UBOT123> Hello!"
           :user     "U123"
           :channel  "C123"
           :ts       "1234567890.000001"
           :event_ts "1234567890.000001"}})

(def slack-csv-file
  "A Slack CSV file upload for testing. Tests can use merge/assoc to customize."
  {:id          "F123"
   :name        "data.csv"
   :filetype    "csv"
   :url_private "https://files.slack.com/files/data.csv"
   :size        100})

(defmacro with-ensure-encryption
  "Use the existing encryption key if one is configured, otherwise set a test key.
   Avoids conflicts with encrypted settings in the DB that were written with the real key."
  [& body]
  `(if (encryption/default-encryption-enabled?)
     (do ~@body)
     (with-redefs [encryption/default-secret-key test-encryption-key]
       ~@body)))

(defmacro with-slackbot-setup
  "Wrap body with all required settings for slackbot to be fully configured.
   Uses `with-temporary-raw-setting-values` to avoid settings with masking getters
   saving/restoring the obfuscated value instead of the original."
  [& body]
  `(with-redefs [slackbot.config/validate-bot-token! (constantly {:ok true})
                 slackbot.client/get-bot-user-id     (constantly "UBOT123")]
     (with-ensure-encryption
       (mt/with-temporary-raw-setting-values [site-url "https://localhost:3000"
                                              slack-connect-client-id "test-client-id"
                                              slack-connect-enabled "true"
                                              metabot-slack-signing-secret test-signing-secret
                                              slack-app-token "xoxb-test"
                                              slack-connect-client-secret "test-secret"]
         ~@body))))

(defn compute-slack-signature
  "Compute a valid Slack signature for testing"
  [body timestamp]
  (let [message (str "v0:" timestamp ":" body)
        signature (-> (mac/hash message {:key test-signing-secret :alg :hmac+sha256})
                      codecs/bytes->hex)]
    (str "v0=" signature)))

(defn slack-request-options
  "Build request options with valid Slack signature headers"
  [body]
  (let [timestamp (str (quot (System/currentTimeMillis) 1000))
        body-str (json/encode body)
        signature (compute-slack-signature body-str timestamp)]
    {:request-options {:headers {"x-slack-signature" signature
                                 "x-slack-request-timestamp" timestamp}}}))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn with-slackbot-mocks
  "Helper to set up common mocks for slackbot tests.
   Options:
   - :ai-text - The text response from make-ai-request
   - :data-parts - The data-parts returned from make-ai-request (default [])
   - :user-id - The user ID returned by slack-id->user-id. If not provided, defaults to rasta.
                Pass ::no-user to simulate an unlinked Slack user (returns nil).

   Calls body-fn with a map containing tracking atoms:
   {:post-calls, :delete-calls, :update-calls, :image-calls, :generate-card-output-calls,
    :generate-adhoc-output-calls, :ephemeral-calls, :ai-request-calls, :fake-png-bytes,
    :stream-calls, :append-text-calls, :stop-stream-calls,
    :add-reaction-calls, :remove-reaction-calls, :set-status-calls}"
  [{:keys [ai-text data-parts user-id]
    :or   {data-parts []
           user-id    ::default}}
   body-fn]
  (let [post-calls                  (atom [])
        delete-calls                (atom [])
        update-calls                (atom [])
        image-calls                 (atom [])
        generate-card-output-calls  (atom [])
        generate-adhoc-output-calls (atom [])
        ephemeral-calls             (atom [])
        ai-request-calls            (atom [])
        stream-calls                (atom [])
        append-text-calls           (atom [])
        stop-stream-calls           (atom [])
        add-reaction-calls          (atom [])
        remove-reaction-calls       (atom [])
        set-status-calls            (atom [])
        fake-png-bytes              (byte-array [0x89 0x50 0x4E 0x47])
        file-counter                (atom 0)
        placeholder-counter         (atom 0)
        mock-user-id                (cond
                                      (= user-id ::default) (mt/user->id :rasta)
                                      (= user-id ::no-user) nil
                                      :else user-id)]
    (mt/with-dynamic-fn-redefs
      [slackbot/slack-id->user-id (constantly mock-user-id)
       slackbot.client/get-bot-user-id (constantly "UBOT123")
       slackbot.client/auth-test (constantly {:ok true :user_id "UBOT123" :team_id "T123"})
       slackbot.client/fetch-thread (constantly {:ok true, :messages []})
       ;; Mock Slack streaming APIs
       slackbot.client/start-stream (fn [_ opts]
                                      (swap! stream-calls conj opts)
                                      {:stream_ts "stream123" :channel (:channel opts) :thread_ts (:thread_ts opts)})
       slackbot.client/append-stream (constantly {:ok true})
       slackbot.client/append-markdown-text (fn [_ _channel _stream-ts text]
                                              (swap! append-text-calls conj text)
                                              {:ok true})
       slackbot.client/stop-stream (fn [_ channel stream-ts & [blocks]]
                                     (swap! stop-stream-calls conj {:channel channel :stream_ts stream-ts :blocks blocks})
                                     {:ok true})
       slackbot.client/post-message (fn [_ msg]
                                      (swap! post-calls conj msg)
                                      {:ok      true
                                       :ts      (str "placeholder-" (swap! placeholder-counter inc))
                                       :channel (:channel msg)
                                       :message msg})
       slackbot.client/post-ephemeral-message (fn [_ msg]
                                                (swap! ephemeral-calls conj msg)
                                                {:ok true, :message_ts "1234567890.123456"})
       slackbot.client/delete-message (fn [_ msg]
                                        (swap! delete-calls conj msg)
                                        {:ok true})
       slackbot.client/update-message (fn [_ msg]
                                        (swap! update-calls conj msg)
                                        {:ok true})
       slackbot.client/add-reaction (fn [_ msg]
                                      (swap! add-reaction-calls conj msg)
                                      {:ok true})
       slackbot.client/remove-reaction (fn [_ msg]
                                         (swap! remove-reaction-calls conj msg)
                                         {:ok true})
       slackbot.client/set-status (fn [_ opts]
                                    (swap! set-status-calls conj opts)
                                    {:ok true})
       channel.slack/upload-file! (fn [image-bytes filename]
                                    (let [file-id (format "FIMG-%d" (swap! file-counter inc))]
                                      (swap! image-calls conj {:image-bytes image-bytes
                                                               :filename    filename
                                                               :file-id     file-id})
                                      {:url (str "https://files.slack.com/files/" filename)
                                       :id  file-id}))
       ;; Mock the agent loop - returns a reducible of parts
       agent/run-agent-loop
       (fn [opts]
         (swap! ai-request-calls conj opts)
         ;; Return a reducible that emits parts matching the agent loop output format
         (reify clojure.lang.IReduceInit
           (reduce [_ rf init]
             (cond-> init
               ai-text
               (rf {:type :text :text ai-text})

               (seq data-parts)
               (as-> r (reduce (fn [acc dp]
                                 (rf acc {:type      :data
                                          :data-type (:type dp)
                                          :data      (:value dp dp)}))
                               r data-parts))))))
       slackbot.query/generate-card-output (fn [card-id]
                                             (swap! generate-card-output-calls conj {:card-id card-id})
                                             {:type :image :content fake-png-bytes :card-name (str "Card " card-id)})
       slackbot.query/generate-adhoc-output (fn [query & {:keys [display]}]
                                              (swap! generate-adhoc-output-calls conj {:query query :display display})
                                              (if (#{:bar :line :pie :area :row :scatter :funnel :waterfall :combo :progress :gauge :map}
                                                   display)
                                                {:type :image :content fake-png-bytes}
                                                {:type :table :content [{:type "table" :rows [] :column_settings []}]}))]
      (body-fn {:post-calls                  post-calls
                :delete-calls                delete-calls
                :update-calls                update-calls
                :image-calls                 image-calls
                :generate-card-output-calls  generate-card-output-calls
                :generate-adhoc-output-calls generate-adhoc-output-calls
                :ephemeral-calls             ephemeral-calls
                :ai-request-calls            ai-request-calls
                :stream-calls                stream-calls
                :append-text-calls           append-text-calls
                :stop-stream-calls           stop-stream-calls
                :add-reaction-calls          add-reaction-calls
                :remove-reaction-calls       remove-reaction-calls
                :set-status-calls            set-status-calls
                :fake-png-bytes              fake-png-bytes}))))
