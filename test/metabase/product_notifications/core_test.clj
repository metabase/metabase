(ns metabase.product-notifications.core-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.product-notifications.core :as product-notifications]))

(set! *warn-on-reflection* true)

(defn- feed-notification
  [id & [overrides]]
  (merge {:id             id
          :schema_version 1
          :title          "A useful update"
          :content        "Read all about it."
          :conditions     {:audience   "all_users"
                           :deployment "any"
                           :edition    "any"
                           :starts_at  "2026-01-01T00:00:00Z"
                           :ends_at    "2027-01-01T00:00:00Z"}}
         overrides))

(deftest ^:parallel normalized-feed-test
  (testing "normalizes supported notifications and preserves their complete-feed positions"
    (let [feed (product-notifications/normalized-feed
                {:notifications [(feed-notification "first")
                                 (feed-notification "future" {:schema_version 2})
                                 (feed-notification "third"
                                                    {:icon "star"
                                                     :conditions
                                                     {:audience    "admins"
                                                      :deployment  "self_hosted"
                                                      :edition     "oss"
                                                      :starts_at   "2026-02-01T00:00:00Z"
                                                      :ends_at     "2026-03-01T00:00:00Z"
                                                      :min_version "64.1"
                                                      :max_version "65.0"}})]})]
      (is (= ["first" "third"] (mapv :notification_id (:notifications feed))))
      (is (= [0 2] (mapv :position (:notifications feed))))
      (is (= ["all_users" "admins"]
             (mapv #(get-in % [:conditions :audience]) (:notifications feed))))
      (is (= "star" (get-in feed [:notifications 1 :icon])))
      (is (= "2026-02-01T00:00:00Z"
             (get-in feed [:notifications 1 :conditions :starts_at])))
      (is (= [{:notification-id "future"
               :phase           :unsupported-schema}]
             (mapv #(dissoc % :exception) (:errors feed)))))))

(deftest ^:parallel feed-envelope-forward-compatibility-test
  (testing "ignores unknown feed metadata"
    (is (= ["first"]
           (->> (product-notifications/normalized-feed
                 {:generated_at  "2026-07-28T00:00:00Z"
                  :notifications [(feed-notification "first")]})
                :notifications
                (mapv :notification_id))))))

(deftest ^:parallel invalid-notifications-do-not-block-valid-notifications-test
  (let [feed (product-notifications/normalized-feed
              {:notifications [(feed-notification "same")
                               (feed-notification "same" {:schema_version 2})
                               (feed-notification "blank" {:title ""})
                               (feed-notification "condition"
                                                  {:conditions
                                                   (assoc (:conditions (feed-notification "x"))
                                                          :unknown "broadens-audience")})
                               (feed-notification "window"
                                                  {:conditions
                                                   (assoc (:conditions (feed-notification "x"))
                                                          :ends_at "2025-01-01T00:00:00Z")})
                               (feed-notification "not-utc"
                                                  {:conditions
                                                   (assoc (:conditions (feed-notification "x"))
                                                          :starts_at "2026-01-01T07:00:00+07:00")})
                               (feed-notification "versions"
                                                  {:conditions
                                                   (assoc (:conditions (feed-notification "x"))
                                                          :min_version "65.0"
                                                          :max_version "64.0")})
                               "not-a-notification"
                               (feed-notification "good")]})]
    (is (= ["good"] (mapv :notification_id (:notifications feed))))
    (is (= #{"same" "blank" "condition" "window" "not-utc" "versions"}
           (set (keep :notification-id (:errors feed)))))
    (is (= #{:duplicate-id :validation}
           (set (map :phase (:errors feed)))))
    (is (some #(nil? (:notification-id %)) (:errors feed)))))

(deftest ^:parallel eligibility-test
  (let [base    {:schema_version 1
                 :active         true
                 :conditions
                 {:audience   "all_users"
                  :deployment "any"
                  :edition    "any"
                  :starts_at  "2026-01-01T00:00:00Z"
                  :ends_at    "2027-01-01T00:00:00Z"}}
        context {:now          (t/offset-date-time "2026-07-01T00:00:00Z")
                 :superuser?   false
                 :hosted?      false
                 :enterprise?  false
                 :version      "v0.64.2"}]
    (testing "matches inclusive start and exclusive end"
      (is (product-notifications/eligible?
           base
           (assoc context :now (t/offset-date-time "2026-01-01T00:00:00Z"))))
      (is (not (product-notifications/eligible?
                base
                (assoc context :now (t/offset-date-time "2027-01-01T00:00:00Z"))))))
    (testing "matches explicit audience, deployment, and edition"
      (is (not (product-notifications/eligible?
                (assoc-in base [:conditions :audience] "admins")
                context)))
      (is (product-notifications/eligible?
           (assoc-in base [:conditions :audience] "admins")
           (assoc context :superuser? true)))
      (is (not (product-notifications/eligible?
                (assoc-in base [:conditions :deployment] "cloud")
                context)))
      (is (not (product-notifications/eligible?
                (assoc-in base [:conditions :edition] "ee")
                context))))
    (testing "matches combined targeting"
      (let [notification (assoc base :conditions
                                (assoc (:conditions base)
                                       :audience "admins"
                                       :deployment "cloud"
                                       :edition "ee"))
            matching     (assoc context :superuser? true :hosted? true :enterprise? true)]
        (is (product-notifications/eligible? notification matching))
        (is (not (product-notifications/eligible? notification
                                                  (assoc matching :hosted? false))))))
    (testing "normalizes OSS and EE version prefixes and applies half-open bounds"
      (let [bounded (update base :conditions assoc :min_version "64.2" :max_version "65.0")]
        (is (product-notifications/eligible? bounded context))
        (is (product-notifications/eligible? bounded (assoc context :version "v1.64.2")))
        (is (not (product-notifications/eligible? bounded (assoc context :version "v0.65.0"))))
        (is (not (product-notifications/eligible? bounded (assoc context :version "vLOCAL_DEV"))))))
    (testing "an unknown version can match an unbounded notification"
      (is (product-notifications/eligible? base (assoc context :version "vLOCAL_DEV"))))
    (testing "unknown notification schemas fail closed"
      (is (not (product-notifications/eligible? (assoc base :schema_version 2) context))))
    (testing "invalid stored conditions fail closed"
      (is (not (product-notifications/eligible?
                (assoc-in base [:conditions :starts_at] "not-a-time")
                context))))))
