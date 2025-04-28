(ns metabase.load-test.core
  (:require
   [metabase.load-test.client :as lt.client]
   [metabase.load-test.seed-data :as lt.data]
   [metabase.load-test.system :as lt.system]
   [metabase.session.core :as session]
   [metabase.util.log :as log]
   [trombi.core :as trombi]
   [trombi.reporters.raw-reporter]
   [trombi.reporters.short-summary]))

(set! *warn-on-reflection* true)

(defn test-login
  []
  (lt.system/with-system! [_ (-> lt.system/base-system
                                 (lt.system/with-app-db-seed (constantly [[:model/User :? {:email    "ngoc@metabase.com"
                                                                                           :password "securedpassword"}]]))
                                 (lt.system/with-metabase-cluster 2 :seed/app-db))]
    (letfn [(send-ngoc-login [_]
              (let [{:keys [status] :as resp} (lt.client/client :post "session"
                                                                {:username "ngoc@metabase.com"
                                                                 :password "securedpassword"})]

                (= status 200)))
            (send-crowberto-login [_]
              (let [{:keys [status]} @(lt.client/client :post "session"
                                                        {:username "crowberto@metabase.com"
                                                         :password "blackjet"})]
                (= status 200)))]
      (trombi/run {:name "Login Simulation"
                   :scenarios [{:name "Login against a 2 instance metabase cluster with postgresql"
                                :steps [{:name "login ngoc"
                                         :request send-ngoc-login}
                                        {:name "login crowberto"
                                         :request send-crowberto-login}]}]}
                  {:concurrency 100
                   :experimental-test-runner-stats? true}))))

(defn test-dashcard-deadlock-cache-enabled
  []
  (let [session-key (session/generate-session-key)]
    (lt.system/with-system! [{:keys [seed/app-db]} (-> lt.system/base-system
                                                       (lt.system/with-dwh-db-seed 'test-data)
                                                       (lt.system/with-app-db-seed :seed/dwh-db #(concat (lt.data/chained-filters-seed-data session-key)
                                                                                                         (lt.data/cache-dwh)))
                                                       (lt.system/with-metabase-cluster 1 :seed/app-db))]
      (letfn [(send-card-request [dashboard-id card-id dashcard-id]
                (fn [_]
                  (let [url (format "dashboard/%d/dashcard/%d/card/%d/query" dashboard-id dashcard-id card-id)
                        {:keys [status]} (lt.client/client session-key :post url)]
                    (= status 202))))]
        (let [models (:loaded-data app-db)]
          (trombi/run {:name "Dashcard request simulation"
                       :scenarios [{:name "Query dashcard 1 with cache"
                                    :steps [{:name "card 1 requests"
                                             :request (send-card-request (:dashboard-id models)
                                                                         (:card-id models)
                                                                         (:dashcard-id models))}]}
                                   {:name "Query dashcard 2 with cache"
                                    :steps [{:name "card 2 requests"
                                             :request (send-card-request (:dashboard-id models)
                                                                         (:card2-id models)
                                                                         (:dashcard2-id models))}]}]}
                      {:concurrency 100
                       :requests 10000
                       :experimental-test-runner-stats? true}))))))

(comment
  (metabase.load-test.core/test-dashcard-deadlock-cache-enabled)
  (metabase.load-test.core/test-login)
  (metabase.load-test.core/test-data-permission-graph-update))
