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

(deftest ^:parallel normalize-feed-test
  (testing "normalizes supported notifications and preserves their complete-feed positions"
    (let [feed (product-notifications/normalize-feed
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
      (is (= #{"first" "future" "third"} (:present-ids feed)))
      (is (= ["first" "third"] (mapv :notification_id (:notifications feed))))
      (is (= [0 2] (mapv :position (:notifications feed))))
      (is (= [:all_users :admins] (mapv :audience (:notifications feed))))
      (is (= "star" (get-in feed [:notifications 1 :icon])))
      (is (= (t/offset-date-time "2026-02-01T00:00:00Z")
             (get-in feed [:notifications 1 :starts_at])))))
  (testing "rejects duplicate IDs, including unsupported notifications"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Duplicate"
         (product-notifications/normalize-feed
          {:notifications [(feed-notification "same")
                           (feed-notification "same" {:schema_version 2})]}))))
  (testing "rejects malformed supported notifications"
    (doseq [notification [(feed-notification "blank" {:title ""})
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
                                                     :max_version "64.0")})]]
      (is (thrown? clojure.lang.ExceptionInfo
                   (product-notifications/normalize-feed {:notifications [notification]}))))))

(deftest ^:parallel eligibility-test
  (let [base    {:active      true
                 :audience    :all_users
                 :deployment  :any
                 :edition     :any
                 :starts_at   (t/offset-date-time "2026-01-01T00:00:00Z")
                 :ends_at     (t/offset-date-time "2027-01-01T00:00:00Z")}
        context {:now          (t/offset-date-time "2026-07-01T00:00:00Z")
                 :superuser?   false
                 :hosted?      false
                 :enterprise?  false
                 :version      "v0.64.2"}]
    (testing "matches inclusive start and exclusive end"
      (is (product-notifications/eligible?
           base
           (assoc context :now (:starts_at base))))
      (is (not (product-notifications/eligible?
                base
                (assoc context :now (:ends_at base))))))
    (testing "matches explicit audience, deployment, and edition"
      (is (not (product-notifications/eligible? (assoc base :audience :admins) context)))
      (is (product-notifications/eligible?
           (assoc base :audience :admins)
           (assoc context :superuser? true)))
      (is (not (product-notifications/eligible? (assoc base :deployment :cloud) context)))
      (is (not (product-notifications/eligible? (assoc base :edition :ee) context))))
    (testing "normalizes OSS and EE version prefixes and applies half-open bounds"
      (let [bounded (assoc base :min_version "64.2" :max_version "65.0")]
        (is (product-notifications/eligible? bounded context))
        (is (product-notifications/eligible? bounded (assoc context :version "v1.64.2")))
        (is (not (product-notifications/eligible? bounded (assoc context :version "v0.65.0"))))
        (is (not (product-notifications/eligible? bounded (assoc context :version "vLOCAL_DEV"))))))
    (testing "an unknown version can match an unbounded notification"
      (is (product-notifications/eligible? base (assoc context :version "vLOCAL_DEV"))))))
