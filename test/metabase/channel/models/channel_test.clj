(ns metabase.channel.models.channel-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.channel.models.channel] ;; ensure known-labels are loaded
   [metabase.channel.schema :as channel.schema]
   [metabase.models.interface :as mi]
   [metabase.notification.test-util :as notification.tu]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(deftest channel-details-is-encrypted
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (encryption-test/with-secret-key "secret"
      (mt/with-model-cleanup [:model/Channel]
        (let [channel (t2/insert-returning-instance! :model/Channel notification.tu/default-can-connect-channel)]
          (is (encryption/possibly-encrypted-string? (t2/select-one-fn :details :channel :id (:id channel)))))))))

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
      (testing "a user who can write the channel still gets :details"
        (mt/with-test-user :crowberto
          (is (re-find #"token-value" (json/encode channel))))))))

(deftest deactivate-channel-test
  (mt/with-temp
    [:model/Channel      {id :id}       notification.tu/default-can-connect-channel
     :model/Pulse        {pulse-id :id} {:name "Test pulse"}
     :model/PulseChannel {pc-id :id}    {:pulse_id pulse-id
                                         :channel_id id
                                         :channel_type "http"
                                         :enabled true}]
    (testing "do not try to delete pulse-channel if active doesn't change"
      (is (pos? (t2/update! :model/Channel :id id {:name "New name"})))
      (is (zero? (t2/update! :model/Channel :id id {:active true})))
      (is (t2/exists? :model/PulseChannel :id pc-id)))
    (testing "deactivate channel"
      (t2/update! :model/Channel :id id {:active false})
      (testing "will delete pulse channels"
        (is (not (t2/exists? :model/PulseChannel :id pc-id))))
      (testing "will change the name"
        (is (= (format "DEACTIVATED_%d New name" id) (t2/select-one-fn :name :model/Channel :id id)))))))

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
        (t2/update! :model/ChannelTemplate :id id {:details {:type    :email/handlebars-text
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

(def ^:private http-channel
  {:name    "Webhook"
   :type    :channel/http
   :details {:url "https://example.com/hook" :auth-method "none"}})

(deftest channel-schema-checks-type-and-details-test
  (let [row (assoc http-channel :id 1 :created_at (t/offset-date-time) :updated_at (t/offset-date-time))]
    (testing "registered type with details of its shape is valid"
      (is (mr/validate ::channel.schema/channel row)))
    (testing "unregistered type is invalid"
      (is (not (mr/validate ::channel.schema/channel (assoc row :type :channel/nonexistent)))))
    (testing "details of another type's shape are invalid"
      (is (not (mr/validate ::channel.schema/channel (assoc row :details {:channel "#general"})))))
    (testing "HTTP channel without details is invalid"
      (is (not (mr/validate ::channel.schema/channel (dissoc row :details)))))
    (testing "email channel needs no details"
      (is (mr/validate ::channel.schema/channel (-> row (assoc :type :channel/email) (dissoc :details)))))))

(deftest channel-type-and-details-are-checked-on-update-test
  (mt/with-temp [:model/Channel {id :id} http-channel]
    (testing "changing details to the wrong shape is a 400"
      (is (=? {:status-code 400}
              (try (t2/update! :model/Channel :id id {:details {:channel "#general"}})
                   (catch clojure.lang.ExceptionInfo e (ex-data e))))))
    (testing "changing the type while keeping details of another shape is a 400"
      (is (=? {:status-code 400}
              (try (t2/update! :model/Channel :id id {:type :channel/slack})
                   (catch clojure.lang.ExceptionInfo e (ex-data e))))))
    (testing "changing the type to an unregistered one is a 400"
      (is (=? {:status-code 400}
              (try (t2/update! :model/Channel :id id {:type :channel/nonexistent})
                   (catch clojure.lang.ExceptionInfo e (ex-data e))))))
    (testing "changing the type together with matching details is accepted"
      (is (pos? (t2/update! :model/Channel :id id {:type :channel/slack :details {:channel "#general"}}))))
    (testing "changing only the name does not recheck the details"
      (is (pos? (t2/update! :model/Channel :id id {:name "Renamed"}))))))

(deftest channel-template-channel-type-is-frozen-test
  (mt/with-temp [:model/ChannelTemplate {id :id} {:channel_type :channel/email
                                                  :name         "Template"
                                                  :details      {:type    :email/handlebars-text
                                                                 :subject "Hello"
                                                                 :body    "Body"}}]
    (is (=? {:status-code 400}
            (try (t2/update! :model/ChannelTemplate :id id {:channel_type :channel/slack})
                 (catch clojure.lang.ExceptionInfo e (ex-data e)))))
    (is (pos? (t2/update! :model/ChannelTemplate :id id {:name "Renamed"})))))

(deftest channel-permissions-test
  (mt/with-temp [:model/Channel channel http-channel
                 :model/ChannelTemplate template {:channel_type :channel/email
                                                  :name         "Template"
                                                  :details      {:type    :email/handlebars-text
                                                                 :subject "Hello"
                                                                 :body    "Body"}}]
    (let [allowed? (fn [user-kw]
                     (mt/with-test-user user-kw
                       [(mi/can-read? (t2/hydrate channel :can_read))
                        (mi/can-write? (t2/hydrate channel :can_write))
                        (mi/can-write? (t2/hydrate template :can_write))
                        (mi/can-create? :model/Channel {})
                        (mi/can-create? :model/ChannelTemplate {})
                        (boolean (seq (mi/readable [channel])))]))]
      (testing "an admin can do everything"
        (is (= [true true true true true true] (allowed? :crowberto))))
      (testing "a plain user can do nothing"
        (is (= [false false false false false false] (allowed? :rasta))))
      (mt/when-ee-evailable
       (testing "a user with the setting application permission can do everything"
         (mt/with-premium-features #{:advanced-permissions}
           (mt/with-user-in-groups [group {:name "channel managers"}
                                    user  [group]]
             (perms/grant-application-permissions! group :setting)
             (mt/with-current-user (:id user)
               (is (= [true true true true true true]
                      [(mi/can-read? (t2/hydrate channel :can_read))
                       (mi/can-write? (t2/hydrate channel :can_write))
                       (mi/can-write? (t2/hydrate template :can_write))
                       (mi/can-create? :model/Channel {})
                       (mi/can-create? :model/ChannelTemplate {})
                       (boolean (seq (mi/readable [channel])))]))))))))
    (testing "api checks throw 403 for a plain user and pass for an admin"
      (mt/with-test-user :rasta
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions" (api/create-check :model/Channel {})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions" (api/write-check channel)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions" (api/read-check channel))))
      (mt/with-test-user :crowberto
        (is (true? (api/create-check :model/Channel {})))
        (is (= (:id channel) (:id (api/write-check channel))))))))
