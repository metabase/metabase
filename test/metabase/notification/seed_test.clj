(ns metabase.notification.seed-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.channel.template.handlebars :as handlebars]
   [metabase.notification.models :as models.notification]
   [metabase.notification.seed :as notification.seed]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- nullify-timestamp
  [data]
  (walk/postwalk
   (fn [x]
     (if (map? x)
       ;; do not nullify id because it's supposed to be the same as well
       (-> x
           (m/update-existing :created_at (constantly nil))
           (m/update-existing :updated_at (constantly nil)))
       x))
   data))

(deftest seed-notification!-is-idempotent
  (mt/with-empty-h2-app-db!
    (let [get-notifications-data #(-> (t2/select :model/Notification)
                                      models.notification/hydrate-notification
                                      nullify-timestamp)
          default-notifications-cnt (count @@#'notification.seed/default-notifications)]
      (testing "seed the first time will insert all default notifications"
        (is (= {:create default-notifications-cnt}
               (notification.seed/seed-notification!))))
      (let [before (get-notifications-data)]
        (testing "skip all since none of the notifications were changed"
          (is (= {:skip (count @@#'notification.seed/default-notifications)}
                 (notification.seed/seed-notification!))))
        (testing "it equals to the data before "
          (is (= before (get-notifications-data))))))))

(deftest seeded-template-paths-resolve-test
  (testing "every seeded handlebars-resource :path resolves through the template loader"
    (let [loader (handlebars/default-loader)
          paths  (for [notification @@#'notification.seed/default-notifications
                       handler      (:handlers notification)
                       :let         [details (get-in handler [:template :details])]
                       :when        (= "email/handlebars-resource" (:type details))]
                   (:path details))]
      (is (seq paths) "seed must contain handlebars-resource templates, else this test proves nothing")
      (doseq [path paths]
        (testing path
          (is (some? (.sourceAt loader path))))))))

(deftest reseed-replaces-legacy-template-paths-test
  (testing "re-seeding over rows whose template :path predates the current schema replaces them instead of throwing"
    ;; before the handlebars 4.5.3 bump (#77134) seeded templates stored full classpath paths like
    ;; `metabase/channel/email/new_user_invite.hbs`; the current schema only accepts bare names like
    ;; `new_user_invite`. The seed must be able to read such pre-upgrade rows in order to replace them.
    (mt/with-empty-h2-app-db!
      (notification.seed/seed-notification!)
      (let [template-id (t2/select-one-pk :model/ChannelTemplate :name "User joined Email template")
            details     (t2/select-one-fn :details :model/ChannelTemplate :id template-id)
            legacy-path "metabase/channel/email/new_user_invite.hbs"]
        ;; plant the legacy path with a raw update: rows written by a pre-upgrade version never went
        ;; through the current before-update validation, so neither should this
        (t2/query {:update [:channel_template]
                   :set    {:details (json/encode (assoc details :path legacy-path))}
                   :where  [:= :id template-id]})
        (is (= legacy-path (t2/select-one-fn (comp :path :details) :model/ChannelTemplate :id template-id)))
        (testing "seed replaces the stale notification without throwing"
          (is (= 1 (:replace (notification.seed/seed-notification!)))))
        (testing "the recreated template has the current path"
          (is (= "new_user_invite"
                 (t2/select-one-fn (comp :path :details) :model/ChannelTemplate
                                   :name "User joined Email template"))))))))

(deftest sync-notification!-test
  (let [internal-id       (mt/random-name)
        template-name     (mt/random-name)
        test-notification {:internal_id   internal-id
                           :active        true
                           :payload_type  :notification/system-event
                           :subscriptions [{:type       :notification-subscription/system-event
                                            :event_name :event/user-invited}]
                           :handlers      [{:active       true
                                            :channel_type :channel/metabase-test
                                            :channel_id   nil
                                            :template     {:name         template-name
                                                           :channel_type :channel/metabase-test}
                                            :recipients   []}]}]
    (mt/with-model-cleanup [:model/Notification]
      (is (= :create (#'notification.seed/sync-notification! test-notification)))
      (testing "skip if the notification is unchanged"
        (is (= :skip (#'notification.seed/sync-notification! test-notification))))
      (let [notification-id (t2/select-one-pk :model/Notification :internal_id internal-id)
            template-id     (t2/select-one-pk :model/ChannelTemplate :name template-name)]
        (testing "If the notification is changed, delete the old one and replace it with a new one"
          (is (= :replace (#'notification.seed/sync-notification! (assoc test-notification :active false))))
          (testing "both notification and template are deleted"
            (is (false? (t2/exists? :model/Notification :id notification-id)))
            (is (false? (t2/exists? :model/ChannelTemplate :id template-id)))))))))

(def ^:private test-notification
  {:internal_id   "metabase-testing"
   :active        true
   :payload_type  :notification/system-event
   :subscriptions [{:type       :notification-subscription/system-event
                    :event_name :event/user-invited}]
   :handlers      [{:active       true
                    :channel_type :channel/email
                    :channel_id   nil
                    :template     {:name         "Template name"
                                   :channel_type :channel/metabase-test}
                    :recipients   [{:type    :notification-recipient/user
                                    :user_id 1}]}]})

(deftest action-test
  (let [check-change (fn [new-notification]
                       (#'notification.seed/action test-notification new-notification))]
    (testing ":skip if nothing changed"
      (is (= :skip (check-change test-notification))))
    (testing ":replace if notification.active changes"
      (is (= :replace (check-change (update test-notification :active not)))))
    (testing ":replace if notification.subscriptions changes"
      (is (= :replace (check-change (assoc-in test-notification [:subscriptions 0 :event_name] :event/user-uninvited)))))
    (testing ":replace if template changed"
      (is (= :replace (check-change (assoc-in test-notification [:handlers 0 :template :name] "new name")))))
    (testing ":replace if template :details :path changes"
      (is (= :replace (check-change (assoc-in test-notification [:handlers 0 :template :details :path] "renamed_template")))))
    (testing ":replace if handlers.active changed"
      (is (= :replace (check-change (assoc-in test-notification [:handlers 0 :active] not)))))
    (testing ":replace if recipients changed"
      (is (= :replace (check-change (update-in test-notification [:handlers 0 :recipients] conj {:type :notification-recipient/user :user_id 2})))))))
