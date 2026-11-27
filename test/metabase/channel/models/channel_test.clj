(ns metabase.channel.models.channel-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.channel.models.channel :as models.channel]
   [metabase.channel.schema :as channel.schema]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
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
          (is (encryption/possibly-encrypted-string? (t2/select-one-fn :details (t2/table-name :model/Channel) :id (:id channel)))))))))

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
      (models.channel/update-channels! [{:id id :name "New name"}])
      (models.channel/update-channels! [{:id id :active true}])
      (is (t2/exists? :model/PulseChannel :id pc-id)))
    (testing "deactivate channel"
      (models.channel/update-channels! [{:id id :active false}])
      (testing "will delete pulse channels"
        (is (not (t2/exists? :model/PulseChannel :id pc-id))))
      (testing "will change the name"
        (is (= (format "DEACTIVATED_%d New name" id) (t2/select-one-fn :name :model/Channel :id id)))))))

(deftest deactivation-renames-through-plain-update-test
  (mt/with-model-cleanup [:model/Channel]
    (let [create! (fn [channel-name]
                    (first (models.channel/create-channels!
                            [(assoc notification.tu/default-can-connect-channel :name channel-name)])))
          long-name (apply str (repeat 250 "x"))]
      (testing "a plain update that deactivates stores the renamed name"
        (let [{:keys [id name]} (create! (mt/random-name))]
          (t2/update! :model/Channel :id id {:active false})
          (is (= (format "DEACTIVATED_%d %s" id name) (t2/select-one-fn :name :model/Channel :id id)))))
      (testing "the name the update gives is the one renamed, with quotes kept as they are"
        (let [{:keys [id]} (create! (mt/random-name))]
          (t2/update! :model/Channel :id id {:active false :name "O'Brien \"channel\""})
          (is (= (format "DEACTIVATED_%d O'Brien \"channel\"" id) (t2/select-one-fn :name :model/Channel :id id)))))
      (testing "the renamed name is cut to 254 characters"
        (let [{:keys [id]} (create! long-name)]
          (t2/update! :model/Channel :id id {:active false})
          (is (= (subs (format "DEACTIVATED_%d %s" id long-name) 0 254) (t2/select-one-fn :name :model/Channel :id id)))))
      (testing "an update that leaves the Channel active keeps its name"
        (let [{:keys [id name]} (create! (mt/random-name))]
          (t2/update! :model/Channel :id id {:description "changed"})
          (is (= name (t2/select-one-fn :name :model/Channel :id id)))))
      (testing "the update event carries the stored name"
        (let [{:keys [id name]} (create! (mt/random-name))
              published         (atom [])]
          (with-redefs [events/publish-event! (fn [topic event] (swap! published conj [topic event]) event)]
            (models.channel/update-channels! [{:id id :active false}]))
          (is (= [(format "DEACTIVATED_%d %s" id name)]
                 (into [] (comp (filter (comp #{:event/channel-update} first))
                                (mapcat (comp :changes second))
                                (map (comp :name :object)))
                       @published))))))))

(deftest deactivated-channels-get-their-own-names-test
  (mt/with-model-cleanup [:model/Channel]
    (let [long-name (apply str (repeat 250 "x"))
          [short-ch long-ch inactive renamed]
          (models.channel/create-channels!
           (mapv #(merge notification.tu/default-can-connect-channel %)
                 [{:name (mt/random-name)}
                  {:name long-name}
                  {:name (mt/random-name) :active false}
                  {:name (mt/random-name)}]))
          published (atom [])
          expected  {(:id short-ch) (format "DEACTIVATED_%d %s" (:id short-ch) (:name short-ch))
                     (:id long-ch)  (subs (format "DEACTIVATED_%d %s" (:id long-ch) long-name) 0 254)
                     (:id inactive) (:name inactive)
                     (:id renamed)  (format "DEACTIVATED_%d New name" (:id renamed))}]
      (with-redefs [events/publish-event! (fn [topic event] (swap! published conj [topic event]) event)]
        (models.channel/update-channels! (mapv (fn [row-id] (assoc {:active false} :id row-id)) (mapv :id [short-ch long-ch inactive])))
        (models.channel/update-channels! [{:id (:id renamed) :active false :name "New name"}]))
      (testing "each deactivated channel stores its own name, cut to 254 characters"
        (is (= expected (t2/select-pk->fn :name :model/Channel :id [:in (keys expected)]))))
      (testing "the update event shows the stored names of the channels it changes"
        (is (= (dissoc expected (:id inactive))
               (into {}
                     (comp (filter (comp #{:event/channel-update} first))
                           (mapcat (comp :changes second))
                           (map (comp (juxt :id :name) :object)))
                     @published)))))))

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

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (let [created (atom [])
        create! (fn [n]
                  (events.tu/statement-count! (fn [] (swap! created into
                                                            (map :id (models.channel/create-channels!
                                                                      (vec (repeatedly n #(assoc notification.tu/default-can-connect-channel
                                                                                                 :name (mt/random-name))))))))))]
    (try
      (testing "creating channels"
        (create! 1)
        (is (= (create! 2) (create! 6))))
      (testing "deactivating channels, some of them already inactive, each getting a name of its own"
        (let [active     @created
              inactive   (mapv :id (models.channel/create-channels!
                                    (vec (repeatedly 4 #(assoc notification.tu/default-can-connect-channel
                                                               :name (mt/random-name) :active false)))))
              _          (swap! created into inactive)
              statements (fn [ids]
                           (events.tu/statement-count! (fn [] (models.channel/update-channels! (mapv (fn [row-id] (assoc {:active false} :id row-id)) (vec ids))))))]
          (statements [(first active)])
          (is (= (statements [(nth active 1) (first inactive)]) (statements (concat (take 3 (drop 2 active)) (take 3 (rest inactive))))))))
      (testing "deleting channels"
        (let [delete! (fn [n]
                        (let [ids (mapv :id (models.channel/create-channels!
                                             (vec (repeatedly n #(assoc notification.tu/default-can-connect-channel :name (mt/random-name))))))]
                          (events.tu/statement-count! #(models.channel/delete-channels! ids))))]
          (delete! 1)
          (is (= (delete! 2) (delete! 6)))))
      (finally
        (t2/delete! :model/Channel :id [:in @created])))))

(deftest channel-template-write-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/ChannelTemplate]
    (let [rows    (fn [n] (vec (repeatedly n #(assoc notification.tu/channel-template-email-with-handlebars-body :name (mt/random-name)))))
          create! (fn [n] (events.tu/statement-count! #(models.channel/create-channel-templates! (rows n))))
          delete! (fn [n]
                    (let [ids (mapv :id (models.channel/create-channel-templates! (rows n)))]
                      (events.tu/statement-count! #(models.channel/delete-channel-templates! ids))))]
      (testing "creating channel templates"
        (create! 1)
        (is (= (create! 2) (create! 6))))
      (testing "deleting channel templates"
        (delete! 1)
        (is (= (delete! 2) (delete! 6)))))))

(deftest create-channels-keeps-defaults-of-rows-with-fewer-columns-test
  (mt/with-model-cleanup [:model/Channel]
    (let [[inactive defaulted] (models.channel/create-channels!
                                [(assoc notification.tu/default-can-connect-channel :name (mt/random-name) :active false)
                                 (-> notification.tu/default-can-connect-channel
                                     (assoc :name (mt/random-name))
                                     (dissoc :active :description))])]
      (is (false? (t2/select-one-fn :active :model/Channel :id (:id inactive))))
      (is (true? (t2/select-one-fn :active :model/Channel :id (:id defaulted)))))))
