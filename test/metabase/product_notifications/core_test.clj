(ns metabase.product-notifications.core-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.product-notifications.core :as product-notifications]))

(def ^:private base-ctx
  {:superuser?    true
   :hosted?       true
   :edition       "oss"
   :version       "v0.52.3"
   :today         (t/local-date "2026-08-01")
   :dismissed-ids []})

(defn- notif
  [id & {:as extra}]
  (merge {:id            id
          :schemaVersion 1
          :title         (str id " title")
          :content       (str id " content")}
         extra))

(defn- ids
  "Run the feed through the filter for `ctx` (merged over base) and return the surviving ids."
  [notifs & {:as ctx}]
  (->> (product-notifications/visible-notifications {:notifications notifs} (merge base-ctx ctx))
       (map :id)))

(deftest trims-to-client-shape-test
  (testing "a relevant notification is trimmed to the client-facing keys, including icon"
    (is (= [{:id "a" :title "a title" :content "a content" :icon "star"}]
           (product-notifications/visible-notifications
            {:notifications [(notif "a" :conditions {:admin false} :icon "star")]}
            base-ctx)))))

(deftest schema-version-filtering-test
  (testing "notifications with an unsupported schemaVersion are ignored"
    (is (= ["ok"]
           (ids [(notif "ok"  :conditions {:admin false})
                 (notif "new" :schemaVersion 2 :conditions {:admin false})])))))

(deftest dismissal-filtering-test
  (testing "dismissed notification ids are excluded"
    (is (= ["b"]
           (ids [(notif "a" :conditions {:admin false})
                 (notif "b" :conditions {:admin false})]
                :dismissed-ids ["a"])))))

(deftest admin-condition-test
  (testing "admin defaults to true -> non-admins do not see it"
    (is (= [] (ids [(notif "a")] :superuser? false)))
    (is (= ["a"] (ids [(notif "a")] :superuser? true))))
  (testing "admin false -> everyone sees it"
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false})] :superuser? false))))
  (testing "admin true -> only superusers"
    (is (= [] (ids [(notif "a" :conditions {:admin true})] :superuser? false)))
    (is (= ["a"] (ids [(notif "a" :conditions {:admin true})] :superuser? true)))))

(deftest cloud-condition-test
  (testing "cloud true requires a hosted instance"
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false :cloud true})] :hosted? true)))
    (is (= []    (ids [(notif "a" :conditions {:admin false :cloud true})] :hosted? false))))
  (testing "cloud false requires a self-hosted instance"
    (is (= []    (ids [(notif "a" :conditions {:admin false :cloud false})] :hosted? true)))
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false :cloud false})] :hosted? false))))
  (testing "absent cloud imposes no constraint"
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false})] :hosted? false)))))

(deftest edition-condition-test
  (testing "edition must match the running edition (case-insensitive)"
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false :edition "oss"})] :edition "oss")))
    (is (= []    (ids [(notif "a" :conditions {:admin false :edition "ee"})]  :edition "oss")))
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false :edition "EE"})]  :edition "ee")))))

(deftest date-window-test
  (let [today (t/local-date "2026-08-01")]
    (testing "before the window -> hidden"
      (is (= [] (ids [(notif "a" :conditions {:admin false :start_date "2026-09-01"})] :today today))))
    (testing "inside the window -> shown"
      (is (= ["a"] (ids [(notif "a" :conditions {:admin false
                                                 :start_date "2026-07-01"
                                                 :end_date   "2026-09-01"})]
                        :today today))))
    (testing "after the window -> hidden"
      (is (= [] (ids [(notif "a" :conditions {:admin false :end_date "2026-07-31"})] :today today))))
    (testing "boundaries are inclusive"
      (is (= ["a"] (ids [(notif "a" :conditions {:admin false :start_date "2026-08-01" :end_date "2026-08-01"})]
                        :today today))))
    (testing "a malformed date hides the notification rather than throwing"
      (is (= [] (ids [(notif "a" :conditions {:admin false :start_date "not-a-date"})] :today today))))))

(deftest version-window-test
  (testing "min_version is an inclusive lower bound"
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false :min_version "0.52.3"})] :version "v0.52.3")))
    (is (= []    (ids [(notif "a" :conditions {:admin false :min_version "0.52.4"})] :version "v0.52.3"))))
  (testing "max_version is an inclusive upper bound"
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false :max_version "0.52.3"})] :version "v0.52.3")))
    (is (= []    (ids [(notif "a" :conditions {:admin false :max_version "0.52.2"})] :version "v0.52.3"))))
  (testing "the edition digit is ignored: 0.52.3 matches an EE (v1.52.3) instance"
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false :min_version "0.52.3" :max_version "0.52.3"})]
                      :version "v1.52.3"))))
  (testing "an unparseable running version hides version-targeted notifications"
    (is (= [] (ids [(notif "a" :conditions {:admin false :min_version "0.52.0"})] :version nil)))))

(deftest blank-conditions-pass-test
  (testing "a condition that is missing or a blank string imposes no constraint"
    (is (= ["a"]
           (ids [(notif "a" :conditions {:admin       false
                                         :cloud       ""
                                         :edition     ""
                                         :start_date  ""
                                         :end_date    ""
                                         :min_version ""
                                         :max_version ""})]))))
  (testing "blank cloud passes regardless of hosting"
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false :cloud ""})] :hosted? false))))
  (testing "blank version bounds impose no constraint, even when the running version is unknown"
    (is (= ["a"]
           (ids [(notif "a" :conditions {:admin false :min_version "" :max_version ""})]
                :version nil))))
  (testing "blank edition passes regardless of the running edition"
    (is (= ["a"] (ids [(notif "a" :conditions {:admin false :edition ""})] :edition "ee"))))
  (testing "blank admin still defaults to admins-only"
    (is (= []    (ids [(notif "a" :conditions {:admin ""})] :superuser? false)))
    (is (= ["a"] (ids [(notif "a" :conditions {:admin ""})] :superuser? true)))))

(deftest combines-conditions-and-preserves-order-test
  (testing "all present conditions must pass, and order is preserved"
    (is (= ["first" "third"]
           (ids [(notif "first"  :conditions {:admin false})
                 (notif "second" :conditions {:admin true})          ; needs superuser
                 (notif "third"  :conditions {:admin false :cloud true})]
                :superuser? false
                :hosted? true)))))

(deftest empty-and-nil-feed-test
  (testing "a nil or empty feed yields no notifications"
    (is (= [] (product-notifications/visible-notifications nil base-ctx)))
    (is (= [] (product-notifications/visible-notifications {:notifications []} base-ctx)))))
