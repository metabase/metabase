(ns metabase.channel.models.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.channel.models.channel] ;; ensure known-labels are loaded
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.json :as json]
   [metabase.util.secret :as u.secret]
   [toucan2.core :as t2]))

(deftest channel-details-is-encrypted
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (encryption-test/with-secret-key "secret"
      (mt/with-model-cleanup [:model/Channel]
        (let [channel (t2/insert-returning-instance! :model/Channel notification.tu/default-can-connect-channel)]
          (is (encryption/possibly-encrypted-string? (t2/select-one-fn :details :channel (:id channel)))))))))

(deftest channel-details-json-encoding-test
  (testing "JSON-encoding a Channel includes :details only for callers who can write it"
    (mt/with-temp
      [:model/Channel channel {:name    "prod-webhook"
                               :type    :channel/http
                               :active  true
                               :details {:url         "https://example.com/hook"
                                         :auth-method "header"
                                         :auth-info   {:Authorization "Bearer token-value"}}}]
      (testing "a user who cannot write the channel gets no :details"
        (mt/with-test-user :rasta
          (let [encoded (json/encode channel)]
            (is (not (re-find #"token-value" encoded)))
            (is (nil? (:details (json/decode+kw encoded))))
            (testing "but the rest of the channel is still present"
              (is (re-find #"prod-webhook" encoded))))))
      (testing "a user who can write the channel gets :details, with the auth secret masked"
        (mt/with-test-user :crowberto
          (let [encoded (json/encode channel)]
            (is (not (re-find #"token-value" encoded)))
            (is (= {:Authorization u.secret/mask-string}
                   (get-in (json/decode+kw encoded) [:details :auth-info])))))))))

;;; ------------------------------------------------ bound secrets --------------------------------------------------

(def ^:private http-details
  {:url         "https://hooks.example.com/abc"
   :auth-method "header"
   :auth-info   {"Authorization" "Bearer token-value"}})

(deftest http-auth-info-is-a-secret-bound-to-the-url-test
  (mt/with-temp [:model/Channel {id :id} {:name "prod-webhook" :type :channel/http :details http-details}]
    (let [{:keys [details]} (t2/select-one :model/Channel id)
          token              (get-in details [:auth-info "Authorization"])]
      (is (u.secret/secret? token))
      (is (= {:url "https://hooks.example.com/abc"} (u.secret/bound-audience token)))
      (testing "it opens against the details it was saved with"
        (is (= "Bearer token-value" (u.secret/expose token details))))
      (testing "and not against a moved URL"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not bound to the requested audience"
                              (u.secret/expose token (assoc details :url "https://evil.example.com/abc"))))))))

(deftest http-auth-info-selected-without-its-row-is-unexposable-test
  (testing "a column selected on its own has no row to bind to, so the secret cannot be opened at all"
    (mt/with-temp [:model/Channel {id :id} {:name "prod-webhook" :type :channel/http :details http-details}]
      (let [details (t2/select-one-fn :details :model/Channel id)
            token   (get-in details [:auth-info "Authorization"])]
        (is (u.secret/secret? token))
        (is (nil? (u.secret/bound-audience token)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no bound audience"
                              (u.secret/expose token details)))))))

(deftest moving-the-url-while-keeping-the-stored-secret-is-refused-test
  (mt/with-temp [:model/Channel {id :id} {:name "prod-webhook" :type :channel/http :details http-details}]
    (let [stored (:details (t2/select-one :model/Channel id))]
      (testing "an update that keeps the stored secret but points it somewhere else is refused"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not bound to the requested audience"
                              (t2/update! :model/Channel id
                                          {:details (assoc stored :url "https://evil.example.com/abc")})))
        (is (= "https://hooks.example.com/abc" (get-in (t2/select-one :model/Channel id) [:details :url]))))
      (testing "an update that keeps both writes the plaintext back, never the redaction text"
        (t2/update! :model/Channel id {:details (assoc stored :auth-method "query-param")})
        (let [{:keys [details]} (t2/select-one :model/Channel id)]
          (is (= "query-param" (:auth-method details)))
          (is (= "Bearer token-value" (u.secret/expose (get-in details [:auth-info "Authorization"]) details)))))
      (testing "a fresh secret goes wherever the caller says"
        (t2/update! :model/Channel id {:details (assoc http-details
                                                       :url       "https://new.example.com/abc"
                                                       :auth-info {"Authorization" "Bearer new-token"})})
        (let [{:keys [details]} (t2/select-one :model/Channel id)]
          (is (= "https://new.example.com/abc" (:url details)))
          (is (= "Bearer new-token" (u.secret/expose (get-in details [:auth-info "Authorization"]) details)))))
      (testing "a secret bound nowhere cannot be written: a caller has to open it against the destination first"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no bound audience"
                              (t2/update! :model/Channel id
                                          {:details (assoc-in http-details [:auth-info "Authorization"]
                                                              (u.secret/secret "Bearer smuggled"))})))))))

(deftest deactivate-channel-test
  (mt/with-temp
    [:model/Channel      {id :id}       notification.tu/default-can-connect-channel
     :model/Pulse        {pulse-id :id} {:name "Test pulse"}
     :model/PulseChannel {pc-id :id}    {:pulse_id pulse-id
                                         :channel_id id
                                         :channel_type "metabase-test"
                                         :enabled true}]
    (testing "do not try to delete pulse-channel if active doesn't change"
      (is (pos? (t2/update! :model/Channel id {:name "New name"})))
      (is (zero? (t2/update! :model/Channel id {:active true})))
      (is (t2/exists? :model/PulseChannel pc-id)))
    (testing "deactivate channel"
      (t2/update! :model/Channel id {:active false})
      (testing "will delete pulse channels"
        (is (not (t2/exists? :model/PulseChannel pc-id))))
      (testing "will change the name"
        (is (= (format "DEACTIVATED_%d New name" id) (t2/select-one-fn :name :model/Channel id)))))))

(deftest channel-template-email-details-test
  (mt/with-model-cleanup [:model/ChannelTemplate]
    (let [insert! (fn [template]
                    (t2/insert-returning-instance! :model/ChannelTemplate
                                                   (merge
                                                    {:channel_type :channel/email
                                                     :name          "My Template"}
                                                    template)))]
      (testing "template is a handlebars template"
        (testing "success"
          (is (some? (insert! {:details {:type    "email/handlebars-text"
                                         :subject "Hello {{name}}"
                                         :body    "Welcome {{name}}"}}))))
        (testing "invalid template"
          (is (thrown? Exception
                       (insert! {:details {:type    "email/handlebars-text"
                                           :subject "Hello {{name}"
                                           :body    nil}})))))
      (testing "template is a resource path"
        (testing "success"
          (is (some? (insert! {:details {:type    "email/handlebars-resource"
                                         :subject "Hello {{name}}"
                                         :path    "password_reset"}}))))
        (testing "invalid path"
          (is (thrown? Exception
                       (insert! {:details {:type    "email/handlebars-resource"
                                           :subject "Hello {{name}}"
                                           :path    "/path/to/resource"}}))))
        (testing "invalid template"
          (is (thrown? Exception
                       (insert! {:details {:type    "email/handlebars-resource"
                                           :subject "Hello {{name}}"
                                           :path    nil}}))))))))

(deftest channel-template-create-prometheus-metric-test
  (testing "creating a ChannelTemplate increments the template-create prometheus counter"
    (mt/with-prometheus-system! [_ system]
      (mt/with-model-cleanup [:model/ChannelTemplate]
        (t2/insert-returning-instance! :model/ChannelTemplate
                                       {:channel_type :channel/email
                                        :name         "Test Template"
                                        :details      {:type    :email/handlebars-text
                                                       :subject "Hello {{name}}"
                                                       :body    "Welcome {{name}}"}})
        (is (= 1.0 (mt/metric-value system :metabase-notification/template-create
                                    {:channel-type :channel/email})))))))

(deftest channel-template-update-prometheus-metric-test
  (testing "updating a ChannelTemplate increments the template-update prometheus counter"
    (mt/with-prometheus-system! [_ system]
      (mt/with-temp [:model/ChannelTemplate {id :id} {:channel_type :channel/email
                                                      :name         "Test Template"
                                                      :details      {:type    :email/handlebars-text
                                                                     :subject "Hello"
                                                                     :body    "Original body"}}]
        (t2/update! :model/ChannelTemplate id {:details {:type    :email/handlebars-text
                                                         :subject "Hello"
                                                         :body    "Updated body"}})
        (is (= 1.0 (mt/metric-value system :metabase-notification/template-update
                                    {:channel-type :channel/email})))))))

(deftest channel-template-create-logging-test
  (testing "creating a user-provided template logs template metadata, without leaking the template body"
    (mt/with-log-messages-for-level [messages :info]
      (mt/with-model-cleanup [:model/ChannelTemplate]
        (t2/insert-returning-instance! :model/ChannelTemplate
                                       {:channel_type :channel/email
                                        :name         "Test Template"
                                        :details      {:type    :email/handlebars-text
                                                       :subject "Hello"
                                                       :body    "Secret {{password}}"}})
        (is (some (fn [{:keys [message]}]
                    (and (re-find #"ChannelTemplate create" message)
                         (re-find #"handlebars-text" message)))
                  (messages)))
        (testing "the template body itself is not logged"
          (is (not (some (fn [{:keys [message]}]
                           (re-find #"Secret" message))
                         (messages)))))))))

(deftest updating-with-the-mask-keeps-the-stored-secret-test
  (testing "a write that carries the mask instead of a value keeps the stored secret, with no help from the caller"
    (mt/with-temp [:model/Channel {id :id} {:name "prod-webhook" :type :channel/http :details http-details}]
      (t2/update! :model/Channel id {:details (assoc http-details
                                                     :auth-method "query-param"
                                                     :auth-info   {"Authorization" u.secret/mask-string})})
      (let [{:keys [details]} (t2/select-one :model/Channel id)]
        (is (= "query-param" (:auth-method details)))
        (is (= "Bearer token-value" (u.secret/expose (get-in details [:auth-info "Authorization"]) details))))
      (testing "and the keys may arrive keywordized, as a request body does"
        (t2/update! :model/Channel id {:details (assoc http-details
                                                       :auth-info {:Authorization u.secret/mask-string})})
        (let [{:keys [details]} (t2/select-one :model/Channel id)]
          (is (= "Bearer token-value" (u.secret/expose (get-in details [:auth-info "Authorization"]) details)))))
      (testing "so moving the URL while sending the mask is refused, the same as keeping the Secret would be"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not bound to the requested audience"
                              (t2/update! :model/Channel id
                                          {:details (assoc http-details
                                                           :url       "https://evil.example.com/abc"
                                                           :auth-info {"Authorization" u.secret/mask-string})})))
        (is (= "https://hooks.example.com/abc" (get-in (t2/select-one :model/Channel id) [:details :url]))))
      (testing "a mask with nothing stored behind it is just a value"
        (t2/update! :model/Channel id {:details (assoc http-details
                                                       :auth-info {"X-Other" u.secret/mask-string})})
        (is (= u.secret/mask-string
               (u.secret/expose (get-in (t2/select-one :model/Channel id) [:details :auth-info "X-Other"])
                                (:details (t2/select-one :model/Channel id)))))))))
