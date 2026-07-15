(ns metabase.metabot.task.conversation-title-backfill-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.conversation-title :as conversation-title]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.task.conversation-title-backfill :as title-backfill]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CompletableFuture)
   (org.quartz Trigger)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(def ^:private run-backfill-page! @#'title-backfill/run-backfill-page!)
(def ^:private build-trigger @#'title-backfill/build-trigger)
(def ^:private handle-setting-update! @#'title-backfill/handle-setting-update!)
(def ^:private id-prefix "zzzzzzzz-zzzz-zzzz-zzzz")

(defn- conversation-id
  [n]
  (format "%s-%012d" id-prefix n))

(defn- pending-result
  [title]
  {:status :pending
   :future (CompletableFuture/completedFuture title)})

(defn- insert-conversation!
  [n & {:keys [title prompt profile-id error finished]
        :or   {prompt "question" profile-id "internal" finished true}}]
  (let [id (conversation-id n)]
    (t2/insert! :model/MetabotConversation {:id id :user_id (mt/user->id :rasta) :title title})
    (t2/insert! :model/MetabotMessage
                {:conversation_id id
                 :role            :user
                 :profile_id      profile-id
                 :data_version    2
                 :data            [{:type "text" :text prompt}]
                 :total_tokens    0})
    (t2/insert! :model/MetabotMessage
                (cond-> {:conversation_id id
                         :role            :assistant
                         :profile_id      profile-id
                         :data_version    2
                         :data            []
                         :total_tokens    0
                         :finished        finished}
                  error (assoc :error error)))
    id))

(defmacro ^:private with-backfill-ready
  [& body]
  `(mt/with-dynamic-fn-redefs [metabot.config/any-metabot-enabled?              (constantly true)
                               metabot.settings/llm-metabot-configured?         (constantly true)
                               metabot.usage/managed-free-limit-reached?        (constantly false)
                               metabot.usage/valid-usage-profile-id             #(when (= % "internal") %)]
     ~@body))

(deftest backfill-page-generation-limit-test
  (testing "a run generates serially for at most ten titleless conversations and preserves existing titles"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [titleless-ids (mapv insert-conversation! (range 1 13))
            titled-id     (insert-conversation! 13 :title "Existing title")
            calls         (atom [])]
        (with-backfill-ready
          (mt/with-dynamic-fn-redefs [conversation-title/ensure-title!
                                      (fn [id profile-id prompt]
                                        (swap! calls conj [id profile-id prompt])
                                        (pending-result "Generated title"))]
            (let [result (run-backfill-page! (conversation-id 0))]
              (is (= {:status :more
                      :cursor (conversation-id 10)
                      :attempted 10
                      :generated 10
                      :failed 0
                      :skipped 0}
                     result))
              (is (= (take 10 titleless-ids) (map first @calls)))
              (is (every? #(= ["internal" "question"] (subvec (vec %) 1)) @calls))
              (is (not-any? #(= titled-id (first %)) @calls)))))))))

(deftest backfill-page-skips-invalid-and-isolates-failures-test
  (testing "invalid conversations advance the cursor and one failed generation does not stop later work"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [errored-id (insert-conversation! 101 :prompt "ignore" :error "boom")
            failed-id  (insert-conversation! 102 :prompt "fails")
            good-id    (insert-conversation! 103 :prompt "works")
            calls      (atom [])]
        (with-backfill-ready
          (mt/with-dynamic-fn-redefs [conversation-title/ensure-title!
                                      (fn [id _profile-id _prompt]
                                        (swap! calls conj id)
                                        (pending-result (when (= id good-id) "Generated title")))]
            (is (= {:status :complete
                    :cursor good-id
                    :attempted 2
                    :generated 1
                    :failed 1
                    :skipped 1}
                   (run-backfill-page! (conversation-id 0))))
            (is (= [failed-id good-id] @calls))
            (is (not-any? #{errored-id} @calls))))))))

(deftest backfill-page-drops-stale-usage-profile-test
  (testing "a stale historical profile does not make enterprise usage logging reject title generation"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [stale-conversation-id (insert-conversation! 150 :profile-id "metabot-1")
            calls                 (atom [])]
        (with-backfill-ready
          (mt/with-dynamic-fn-redefs [conversation-title/ensure-title!
                                      (fn [id profile-id _prompt]
                                        (swap! calls conj [id profile-id])
                                        (pending-result "Generated title"))]
            (is (= :complete (:status (run-backfill-page! (conversation-id 0)))))
            (is (= [[stale-conversation-id nil]] @calls))))))))

(deftest backfill-page-provider-readiness-test
  (testing "an unconfigured provider pauses before scanning the database"
    (mt/with-dynamic-fn-redefs [metabot.config/any-metabot-enabled?      (constantly true)
                                metabot.settings/llm-metabot-configured? (constantly false)
                                t2/select-fn-vec                         (fn [& _]
                                                                           (throw (ex-info "must not scan" {})))]
      (is (= {:status :paused :cursor "before" :attempted 0 :generated 0 :failed 0 :skipped 0}
             (run-backfill-page! "before")))))
  (testing "the managed AI limit also pauses before scanning the database"
    (mt/with-dynamic-fn-redefs [metabot.config/any-metabot-enabled?        (constantly true)
                                metabot.settings/llm-metabot-configured?   (constantly true)
                                metabot.usage/managed-free-limit-reached? (constantly true)
                                t2/select-fn-vec                           (fn [& _]
                                                                             (throw (ex-info "must not scan" {})))]
      (is (= {:status :paused :cursor "before" :attempted 0 :generated 0 :failed 0 :skipped 0}
             (run-backfill-page! "before")))))
  (testing "configuration removed during a page stops before advancing past the unprocessed conversation"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [first-id          (insert-conversation! 201)
            readiness-checks (atom 0)
            calls            (atom [])]
        (insert-conversation! 202)
        (mt/with-dynamic-fn-redefs [metabot.config/any-metabot-enabled?       (constantly true)
                                    metabot.settings/llm-metabot-configured? (fn []
                                                                               (< (swap! readiness-checks inc) 3))
                                    metabot.usage/managed-free-limit-reached? (constantly false)
                                    conversation-title/ensure-title!          (fn [id _profile-id _prompt]
                                                                                (swap! calls conj id)
                                                                                (pending-result "Generated title"))]
          (is (= {:status :paused
                  :cursor first-id
                  :attempted 1
                  :generated 1
                  :failed 0
                  :skipped 0}
                 (run-backfill-page! (conversation-id 0))))
          (is (= [first-id] @calls)))))))

(deftest backfill-trigger-carries-cursor-test
  (let [cursor  (conversation-id 301)
        trigger ^Trigger (build-trigger cursor 60)]
    (is (= cursor (.getString (.getJobDataMap trigger) "after-id")))))

(deftest provider-setting-update-scheduling-test
  (let [scheduled  (atom [])
        configured (atom true)]
    (mt/with-dynamic-fn-redefs [metabot.config/any-metabot-enabled?       (constantly true)
                                metabot.settings/llm-metabot-configured? (fn [] @configured)
                                metabot.usage/managed-free-limit-reached? (constantly false)
                                task/scheduler                            (constantly ::scheduler)
                                task/schedule-task!                       (fn [& args] (swap! scheduled conj args))]
      (testing "relevant repeated updates use the same trigger identity"
        (doseq [setting-key [:llm-openai-api-key
                             :llm-proxy-base-url
                             :llm-azure-api-base-url
                             :llm-bedrock-secret-access-key
                             :llm-openai-api-key]]
          (handle-setting-update! {:details {:key setting-key}}))
        (is (= 5 (count @scheduled)))
        (is (apply = (map (fn [[_scheduler _job ^Trigger trigger]] (.getKey trigger)) @scheduled))))
      (testing "irrelevant updates do not schedule a sweep"
        (handle-setting-update! {:details {:key :site-name}})
        (is (= 5 (count @scheduled))))
      (testing "relevant updates wait until provider configuration is complete"
        (reset! configured false)
        (handle-setting-update! {:details {:key :llm-azure-api-key}})
        (is (= 5 (count @scheduled)))))))
