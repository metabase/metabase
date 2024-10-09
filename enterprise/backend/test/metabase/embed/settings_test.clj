(ns metabase.embed.settings-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.embed.settings :as embed.settings]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- embedding-event?
  "Used to make sure we only test against embedding-events in `snowplow-test/pop-event-data-and-user-id!`."
  [event]
  (-> event :data (get "event") ((fn [s] (boolean (re-matches #".*embedding.*" s))))))

(deftest enable-embedding-test
  (testing "A snowplow event is sent whenever embedding is toggled"
    (mt/with-test-user :crowberto
      (mt/with-premium-features #{:embedding}
        (mt/with-temporary-setting-values [embedding-app-origins-interactive "https://example.com"
                                           enable-embedding-interactive false]
          (let [embedded-dash-count (t2/count :model/Dashboard :enable_embedding true)
                embedded-card-count (t2/count :model/Card :enable_embedding true)
                expected-payload    {"embedding_app_origin_set"   true
                                     "number_embedded_questions"  embedded-card-count
                                     "number_embedded_dashboards" embedded-dash-count}]
            (snowplow-test/with-fake-snowplow-collector
              (embed.settings/enable-embedding-interactive! true)
              (is (= [{:data (merge expected-payload {"event" "interactive_embedding_enabled"})
                       :user-id (str (mt/user->id :crowberto))}]
                     (filter embedding-event? (snowplow-test/pop-event-data-and-user-id!))))

              (mt/with-temporary-setting-values [enable-embedding-interactive false]
                (is (= [{:data
                         (merge expected-payload {"event" "interactive_embedding_disabled"})
                         :user-id (str (mt/user->id :crowberto))}]
                       (filter embedding-event? (snowplow-test/pop-event-data-and-user-id!))))))))))))

(def ^:private other-ip "1.2.3.4:5555")

(deftest enable-embedding-SDK-true-ignores-localhosts
  (mt/with-premium-features #{:embedding :embedding-sdk}
    (mt/with-temporary-setting-values [enable-embedding-sdk true]
      (let [origin-value "localhost:*"]
        (embed.settings/embedding-app-origins-sdk! origin-value)
        (testing "All localhosty origins should be ignored, so the result should be \"localhost:*\""
          (embed.settings/embedding-app-origins-sdk! (str origin-value " localhost:8080"))
          (is (= "localhost:*" (embed.settings/embedding-app-origins-sdk))))
        (testing "Normal ips are added to the list"
          (embed.settings/embedding-app-origins-sdk! (str origin-value " " other-ip))
          (is (= (str "localhost:* " other-ip) (embed.settings/embedding-app-origins-sdk))))))))

(deftest enable-embedding-SDK-false-returns-nothing
  (mt/with-premium-features #{:embedding :embedding-sdk}
    (mt/with-temporary-setting-values [enable-embedding-sdk false]
      (embed.settings/embedding-app-origins-sdk! "")
      (let [origin-value (str "localhost:* " other-ip " "
                              (str/join " " (map #(str "localhost:" %) (range 1000 2000))))]
        (embed.settings/embedding-app-origins-sdk! origin-value)
        (is (not (and (embed.settings/enable-embedding-sdk)
                      (embed.settings/embedding-app-origins-sdk))))))))

(defn- depricated-setting-throws [f env & [reason]]
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #".* deprecated.*env vars are set.*"
       (f env)) reason))

(deftest deprecated-enabled-embedding-settings-test
  ;; OK:
  (is (nil? (#'embed.settings/check-enable-settings! {})))
  (is (nil? (#'embed.settings/check-enable-settings! {:mb-enable-embedding-static true})))
  (is (nil? (#'embed.settings/check-enable-settings! {:mb-enable-embedding-static false :mb-enable-embedding-sdk true})))
  (is (nil? (#'embed.settings/check-enable-settings! {:mb-enable-embedding-sdk true})))
  (is (nil? (#'embed.settings/check-enable-settings! {:mb-enable-embedding-interactive true})))
  (is (nil? (#'embed.settings/check-enable-settings! {:mb-enable-embedding-interactive true :mb-enable-embedding-static false})))
  (is (nil? (#'embed.settings/check-enable-settings! {:mb-enable-embedding-interactive false :mb-enable-embedding-sdk true})))
  (is (nil? (#'embed.settings/check-enable-settings! {:mb-enable-embedding-interactive false :mb-enable-embedding-sdk true :mb-enable-embedding-static true})))
  (is (nil? (#'embed.settings/check-enable-settings! {:mb-enable-embedding true})))
  ;; ;; Not OK:
  (depricated-setting-throws #'embed.settings/check-enable-settings! {:mb-enable-embedding true :mb-enable-embedding-static false})
  (depricated-setting-throws #'embed.settings/check-enable-settings! {:mb-enable-embedding true :mb-enable-embedding-sdk false})
  (depricated-setting-throws #'embed.settings/check-enable-settings! {:mb-enable-embedding true :mb-enable-embedding-sdk false :mb-enable-embedding-static true})
  (depricated-setting-throws #'embed.settings/check-enable-settings! {:mb-enable-embedding true :mb-enable-embedding-interactive true :mb-enable-embedding-sdk false})
  (depricated-setting-throws #'embed.settings/check-enable-settings! {:mb-enable-embedding true :mb-enable-embedding-interactive false})
  (depricated-setting-throws #'embed.settings/check-enable-settings! {:mb-enable-embedding true :mb-enable-embedding-interactive false :mb-enable-embedding-static true})
  (depricated-setting-throws #'embed.settings/check-enable-settings! {:mb-enable-embedding true :mb-enable-embedding-interactive false :mb-enable-embedding-sdk true :mb-enable-embedding-static true}))

(deftest deprecated-origin-embedding-settings-test
  ;; OK:
  (is (nil? (#'embed.settings/check-origins-settings! {})))
  (is (nil? (#'embed.settings/check-origins-settings! {:mb-embedding-app-origin true})))
  (is (nil? (#'embed.settings/check-origins-settings! {:mb-embedding-app-origin false}))
      "shouldn't matter if a setting is true or false, only that it is set (not nil).")
  (is (nil? (#'embed.settings/check-origins-settings! {:mb-embedding-app-origin nil}))
      "shouldn't matter if a setting is true or false, only that it is set (not nil).")
  (is (nil? (#'embed.settings/check-origins-settings! {:mb-embedding-app-origins-sdk true})))
  (is (nil? (#'embed.settings/check-origins-settings! {:mb-embedding-app-origins-interactive true})))
  (is (nil? (#'embed.settings/check-origins-settings! {:mb-embedding-app-origins-interactive false :mb-embedding-app-origins-sdk true})))
  (is (nil? (#'embed.settings/check-origins-settings! {:mb-embedding-app-origin nil :mb-embedding-app-origins-interactive nil :mb-embedding-app-origins-sdk nil})))
  ;; Not OK:
  (depricated-setting-throws #'embed.settings/check-origins-settings! {:mb-embedding-app-origin true :mb-embedding-app-origins-sdk false})
  (depricated-setting-throws #'embed.settings/check-origins-settings! {:mb-embedding-app-origin true :mb-embedding-app-origins-interactive false})
  (depricated-setting-throws #'embed.settings/check-origins-settings! {:mb-embedding-app-origin true :mb-embedding-app-origins-interactive true :mb-embedding-app-origins-sdk false}))

(defn test-enabled-sync! [env expected-behavior]
  (let [unsyncd-settings {:enable-embedding             #_:clj-kondo/ignore (embed.settings/enable-embedding)
                          :enable-embedding-interactive (embed.settings/enable-embedding-interactive)
                          :enable-embedding-sdk         (embed.settings/enable-embedding-sdk)
                          :enable-embedding-static      (embed.settings/enable-embedding-static)}]
    ;; called for side effects:
    (#'embed.settings/sync-enable-settings! env)
    (cond
      (= expected-behavior :no-op)
      (do (is (= [:no-op (:enable-embedding-interactive unsyncd-settings)] [:no-op (embed.settings/enable-embedding-interactive)]))
          (is (= [:no-op (:enable-embedding-sdk unsyncd-settings)]         [:no-op (embed.settings/enable-embedding-sdk)]))
          (is (= [:no-op (:enable-embedding-static unsyncd-settings)]      [:no-op (embed.settings/enable-embedding-static)])))

      (= expected-behavior :sets-all-true)
      (do (is (= [expected-behavior true] [:sets-all-true (embed.settings/enable-embedding-interactive)]))
          (is (= [expected-behavior true] [:sets-all-true (embed.settings/enable-embedding-sdk)]))
          (is (= [expected-behavior true] [:sets-all-true (embed.settings/enable-embedding-static)])))

      (= expected-behavior :sets-all-false)
      (do (is (= [expected-behavior false] [:sets-all-false (embed.settings/enable-embedding-interactive)]))
          (is (= [expected-behavior false] [:sets-all-false (embed.settings/enable-embedding-sdk)]))
          (is (= [expected-behavior false] [:sets-all-false (embed.settings/enable-embedding-static)])))

      :else (throw (ex-info "Invalid expected-behavior in test-enabled-sync." {:expected-behavior expected-behavior})))))

(deftest sync-enabled-test
  (mt/with-premium-features #{:embedding :embedding-sdk}
    ;; n.b. illegal combinations will be disallowed by [[embed.settings/check-and-sync-settings-on-startup!]], so we don't test syncing for them.
    (test-enabled-sync! {} :no-op)
    (test-enabled-sync! {:mb-enable-embedding-static true} :no-op)
    (test-enabled-sync! {:mb-enable-embedding-static false} :no-op)
    (test-enabled-sync! {:mb-enable-embedding-interactive true} :no-op)
    (test-enabled-sync! {:mb-enable-embedding-interactive false} :no-op)
    (test-enabled-sync! {:mb-enable-embedding-interactive true :mb-enable-embedding-static true} :no-op)
    (test-enabled-sync! {:mb-enable-embedding-interactive false :mb-enable-embedding-static true} :no-op)

    (test-enabled-sync! {:mb-enable-embedding true} :sets-all-true)

    (test-enabled-sync! {:mb-enable-embedding false} :sets-all-false)))

(defn test-origin-sync! [env expected-behavior]
  (testing (str "origin sync with expected-behavior: " expected-behavior)
    (let [unsyncd-setting {:embedding-app-origin              #_:clj-kondo/ignore (embed.settings/embedding-app-origin)
                           :embedding-app-origins-interactive (embed.settings/embedding-app-origins-interactive)
                           :embedding-app-origins-sdk         (embed.settings/embedding-app-origins-sdk)}]
      ;; called for side effects
      (#'embed.settings/sync-origins-settings! env)
      (cond
        (= expected-behavior :no-op)
        (do (is (= (:embedding-app-origins-interactive unsyncd-setting)
                   (embed.settings/embedding-app-origins-interactive)))
            (is (= (#'embed.settings/add-localhost (:embedding-app-origins-sdk unsyncd-setting))
                   (embed.settings/embedding-app-origins-sdk))))

        (= expected-behavior :sets-both)
        (do (is (= (:mb-embedding-app-origin env)
                   (embed.settings/embedding-app-origins-interactive)))
            (is (= (#'embed.settings/add-localhost (:mb-embedding-app-origin env))
                   (embed.settings/embedding-app-origins-sdk))))

        :else (throw (ex-info "Invalid expected-behavior in test-origin-sync." {:expected-behavior expected-behavior}))))))

(deftest sync-origins-test
  ;; n.b. illegal combinations will be disallowed by [[embed.settings/check-and-sync-settings-on-startup!]], so we don't test syncing for them.
  (mt/with-premium-features #{:embedding :embedding-sdk}
    (mt/with-temporary-setting-values [enable-embedding true
                                       enable-embedding-sdk true
                                       enable-embedding-interactive true
                                       enable-embedding-static true
                                       embedding-app-origin nil
                                       embedding-app-origins-interactive nil
                                       embedding-app-origins-sdk nil]
      (test-origin-sync! {} :no-op)

      (test-origin-sync! {:mb-embedding-app-origins-sdk other-ip} :no-op)
      (test-origin-sync! {:mb-embedding-app-origins-sdk nil} :no-op)

      (test-origin-sync! {:mb-embedding-app-origins-interactive other-ip} :no-op)
      (test-origin-sync! {:mb-embedding-app-origins-interactive nil} :no-op)

      (test-origin-sync! {:mb-embedding-app-origin other-ip} :sets-both))))
