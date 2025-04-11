(ns metabase.load-test.core
  (:require
   [metabase.load-test.client :as lt.client]
   [metabase.load-test.containers :as lt.containers]
   [metabase.load-test.db :as lt.db]
   [src.dev.add-load :as add-load]
   [trombi.core :as trombi]))

(defn test-login
  []
  (lt.containers/with-containers! lt.containers/config-with-postgres-two-metabase
    (lt.db/with-container-db
      (add-load/from-script [[:model/User :? {:email    "ngoc@metabase.com"
                                              :password "securedpassword"}]])
      (letfn [(send-login [_]
                (let [{:keys [status]} (lt.client/client :post "session"
                                                         {:username "ngoc@metabase.com"
                                                          :password "securedpassword"})]
                  (= status 200)))]
        (trombi/run {:name "Login Simulation"
                     :scenarios [{:name "Login against a 2 instance metabase cluster with postgresql"
                                  :steps [{:name "login"
                                           :request send-login}]}]}
                    {:concurrency 100})))))

(comment
  (metabase.load-test.core/test-login))
