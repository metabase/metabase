(ns metabase.embed.settings-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.embed.settings :as embed.settings]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]
   [toucan2.core :as t2]))

(deftest enable-embedding-test
  (testing "A snowplow event is sent whenever embedding is toggled"
    (mt/with-test-user :crowberto
      (mt/with-premium-features #{:embedding}
        (mt/with-temporary-setting-values [embedding-app-origin "https://example.com"
                                           enable-embedding false]
          (let [embedded-dash-count (t2/count :model/Dashboard :enable_embedding true)
                embedded-card-count (t2/count :model/Card :enable_embedding true)
                expected-payload    {"embedding_app_origin_set"   true
                                     "number_embedded_questions"  embedded-card-count
                                     "number_embedded_dashboards" embedded-dash-count}]
            (snowplow-test/with-fake-snowplow-collector
              (embed.settings/enable-embedding! true)
              (is (= [{:data (merge expected-payload {"event" "embedding_enabled"})
                       :user-id (str (mt/user->id :crowberto))}]
                     (snowplow-test/pop-event-data-and-user-id!)))

              (mt/with-temporary-setting-values [enable-embedding false]
                (is (= [{:data
                         (merge expected-payload {"event" "embedding_disabled"})
                         :user-id (str (mt/user->id :crowberto))}]
                       (snowplow-test/pop-event-data-and-user-id!)))))))))))

(deftest deprecation-warning-for-enable-embedding-test
  (mt/with-temporary-setting-values [enable-embedding "false"]
    (log.capture/with-log-messages-for-level [warnings :warn]
      (embed.settings/enable-embedding! true)
      (is (re-find
           #"Setting enable-embedding is deprecated as of Metabase 0.51.0 and may be removed in a future version."
           (str/join " " (map :message (warnings))))))))

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

(defn test-depricated-setting [f env expected-ok? & [reason]]
  (if expected-ok?
    (is (nil? (f env)) reason)
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Both deprecated and new enable-embedding env vars are set, please remove MB_ENABLE_EMBEDDING."
         (f env)) reason)))

(deftest deprecated-enabled-embedding-settings-test
  ;; OK:
  (test-depricated-setting #'embed.settings/check-enable-settings {} true)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding-static true} true)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding-static false :enable-embedding-sdk true} true)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding-sdk true} true)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding-interactive true} true)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding-interactive true :enable-embedding-static false} true)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding-interactive false :enable-embedding-sdk true} true)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding-interactive false :enable-embedding-sdk true :enable-embedding-static true} true)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding true} true)
  ;; Not OK:
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding true :enable-embedding-static false} false)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding true :enable-embedding-sdk false} false)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding true :enable-embedding-sdk false :enable-embedding-static true} false)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding true :enable-embedding-interactive true :enable-embedding-sdk false} false)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding true :enable-embedding-interactive false} false)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding true :enable-embedding-interactive false :enable-embedding-static true} false)
  (test-depricated-setting #'embed.settings/check-enable-settings {:enable-embedding true :enable-embedding-interactive false :enable-embedding-sdk true :enable-embedding-static true} false))

(deftest deprecated-origin-embedding-settings-test
  ;; OK:
  (test-depricated-setting #'embed.settings/check-origins-settings {} true)
  (test-depricated-setting #'embed.settings/check-origins-settings {:embedding-app-origin true} true)
  (test-depricated-setting #'embed.settings/check-origins-settings {:embedding-app-origin false} true
                           "shouldn't matter if a setting is true or false, only that it is set (not nil).")
  (test-depricated-setting #'embed.settings/check-origins-settings {:embedding-app-origin nil} true
                           "shouldn't matter if a setting is true or false, only that it is set (not nil).")
  (test-depricated-setting #'embed.settings/check-origins-settings {:embedding-app-origins-sdk true} true)
  (test-depricated-setting #'embed.settings/check-origins-settings {:embedding-app-origins-interactive true} true)
  (test-depricated-setting #'embed.settings/check-origins-settings {:embedding-app-origins-interactive false :embedding-app-origins-sdk true} true)
  (test-depricated-setting #'embed.settings/check-origins-settings {:embedding-app-origin nil :embedding-app-origins-interactive nil :embedding-app-origins-sdk nil} true)
  ;; Not OK:
  (test-depricated-setting #'embed.settings/check-origins-settings {:embedding-app-origin true :embedding-app-origins-sdk false} false)
  (test-depricated-setting #'embed.settings/check-origins-settings {:embedding-app-origin true :embedding-app-origins-interactive false} false)
  (test-depricated-setting #'embed.settings/check-origins-settings {:embedding-app-origin true :embedding-app-origins-interactive true :embedding-app-origins-sdk false} false))

(defn test-enabled-sync [env expected-behavior]
  (let [original {:enable-embedding             #_:clj-kondo/ignore (embed.settings/enable-embedding)
                  :enable-embedding-interactive (embed.settings/enable-embedding-interactive)
                  :enable-embedding-sdk         (embed.settings/enable-embedding-sdk)
                  :enable-embedding-static      (embed.settings/enable-embedding-static)}]
    ;; called for side effects:
    (#'embed.settings/sync-enable-settings env)
    (cond
      (= expected-behavior :no-op)
      (do (is (= [:no-op (:enable-embedding-interactive original)] [:no-op (embed.settings/enable-embedding-interactive)]))
          (is (= [:no-op (:enable-embedding-sdk original)]         [:no-op (embed.settings/enable-embedding-sdk)]))
          (is (= [:no-op (:enable-embedding-static original)]      [:no-op (embed.settings/enable-embedding-static)])))

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
  ;; n.b. illegal combinations will be disallowed by [[embed.settings/check-and-sync-settings-on-startup!]], so we don't test syncing for them.
  (test-enabled-sync {} :no-op)
  (test-enabled-sync {:enable-embedding-static true} :no-op)
  (test-enabled-sync {:enable-embedding-static false} :no-op)
  (test-enabled-sync {:enable-embedding-interactive true} :no-op)
  (test-enabled-sync {:enable-embedding-interactive false} :no-op)
  (test-enabled-sync {:enable-embedding-interactive true :enable-embedding-static true} :no-op)
  (test-enabled-sync {:enable-embedding-interactive false :enable-embedding-static true} :no-op)

  (test-enabled-sync {:enable-embedding true} :sets-all-true)

  (test-enabled-sync {:enable-embedding false} :sets-all-false))

(defn test-origin-sync [env expected-behavior]
  (testing (str "origin sync with expected-behavior: " expected-behavior)
    (let [original {:embedding-app-origin              #_:clj-kondo/ignore (embed.settings/embedding-app-origin)
                    :embedding-app-origins-interactive (embed.settings/embedding-app-origins-interactive)
                    :embedding-app-origins-sdk         (embed.settings/embedding-app-origins-sdk)}]
      ;; called for side effects
      (#'embed.settings/sync-origins-settings env)
      (cond
        (= expected-behavior :no-op)
        (do (is (= (:embedding-app-orogin original)
                   (embed.settings/embedding-app-origins-interactive)))
            (is (= (#'embed.settings/add-localhost (:embedding-app-origin original))
                   (embed.settings/embedding-app-origins-sdk))))

        (= expected-behavior :sets-both)
        (do (is (= [expected-behavior other-ip] [:sets-both (embed.settings/embedding-app-origins-interactive)]))
            (is (= [expected-behavior (#'embed.settings/add-localhost other-ip)] [:sets-both (embed.settings/embedding-app-origins-sdk)])))

        :else (throw (ex-info "Invalid expected-behavior in test-sync-setting." {:expected-behavior expected-behavior}))))))

(deftest sync-origins-test
  ;; n.b. illegal combinations will be disallowed by [[embed.settings/check-and-sync-settings-on-startup!]], so we don't test syncing for them.
  (mt/with-temporary-setting-values [enable-embedding-sdk true
                                     enable-embedding-interactive true
                                     embedding-app-origins-interactive ""
                                     embedding-app-origins-sdk (#'embed.settings/add-localhost "")]
    (test-origin-sync {} :no-op)
    (test-origin-sync {:embedding-app-origins-sdk true} :no-op)
    (test-origin-sync {:embedding-app-origins-sdk false} :no-op)
    (test-origin-sync {:embedding-app-origins-interactive true} :no-op)
    (test-origin-sync {:embedding-app-origins-interactive false} :no-op)

    (test-origin-sync {:embedding-app-origin other-ip} :sets-both)))

(comment
  ;; utility to generate combinations of settings to test:

  (require '[clojure.math.combinatorics :as math.combo])
  (defn- all-combos [coll]
    (mapcat #(math.combo/combinations coll %) (range (inc (count coll)))))

  (defn- gen-combos [settings]
    (let [setting-combos (all-combos (for [setting settings]
                                       setting))]
      (map (fn [settings-to-test]
             (zipmap settings-to-test
                     (repeatedly #(rand-nth [true false])))) setting-combos)))

  ;; enabled:
  (gen-combos [:enable-embedding :enable-embedding-sdk :enable-embedding-interactive :enable-embedding-static])
  ;; origins:
  (gen-combos [:embedding-app-origin :embedding-app-origins-sdk :embedding-app-origins-interactive]))
