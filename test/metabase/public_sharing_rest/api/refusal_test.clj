(ns metabase.public-sharing-rest.api.refusal-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.database-routing.core]
   [metabase.documents.test-util :as documents.test-util]
   [metabase.premium-features.defenterprise :as defenterprise]
   [metabase.public-sharing.test-util :as public-sharing.test-util]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(defn- refusal [model id]
  (mt/user-http-request :crowberto :get 200 (format "public-link-refusal/%s/%d" model id)))

(defn- refused-by-test-db []
  {:refusal {:message  (public-sharing.test-util/anonymous-access-refused-message (:name (mt/db)))
             :database {:id (mt/id), :name (:name (mt/db))}}})

(defn- embed-cards-in-document!
  [document-id card-ids]
  (t2/update! :model/Document :id document-id
              {:document (documents.test-util/cards->prose-mirror-ast card-ids)}))

(deftest refusal-test
  (when config/ee-available?
    (testing "GET /api/public-link-refusal/:model/:id"
      (mt/with-premium-features #{:database-routing}
        (mt/with-temp [:model/DatabaseRouter _ {:database_id (mt/id), :user_attribute "db_name"}]
          (testing "names the database that would make a new public link return no data"
            (mt/with-temp [:model/Card          card      {}
                           :model/Dashboard     dashboard {}
                           :model/DashboardCard _         {:dashboard_id (:id dashboard), :card_id (:id card)}]
              (is (= (refused-by-test-db) (refusal "card" (:id card))))
              (is (= (refused-by-test-db) (refusal "dashboard" (:id dashboard))))))
          (testing "sees a filter's value-source card"
            (mt/with-temp [:model/Database      other        {}
                           :model/Card          value-source {}
                           :model/Card          card         {:database_id (:id other)
                                                              :parameters  [(public-sharing.test-util/card-value-source-parameter
                                                                             (:id value-source))]}
                           :model/Card          main         {:database_id (:id other)}
                           :model/Dashboard     dashboard    {:parameters [(public-sharing.test-util/card-value-source-parameter
                                                                            (:id value-source))]}
                           :model/DashboardCard _            {:dashboard_id (:id dashboard), :card_id (:id main)}]
              (is (= (refused-by-test-db) (refusal "card" (:id card))))
              (is (= (refused-by-test-db) (refusal "dashboard" (:id dashboard))))))
          (testing "sees a dashboard's series card"
            (mt/with-temp [:model/Database            other     {}
                           :model/Dashboard           dashboard {}
                           :model/Card                main      {:database_id (:id other)}
                           :model/DashboardCard       dashcard  {:dashboard_id (:id dashboard), :card_id (:id main)}
                           :model/Card                series    {}
                           :model/DashboardCardSeries _         {:dashboardcard_id (:id dashcard), :card_id (:id series)}]
              (is (= (refused-by-test-db) (refusal "dashboard" (:id dashboard))))))
          (testing "sees the cards a document embeds"
            (mt/with-temp [:model/Document document {}
                           :model/Card     card     {:document_id (:id document)}]
              (embed-cards-in-document! (:id document) [(:id card)])
              (is (= (refused-by-test-db) (refusal "document" (:id document))))))
          (testing "answers the same when a link already exists"
            (mt/with-temp [:model/Card card {:public_uuid       (str (random-uuid))
                                             :made_public_by_id (mt/user->id :crowberto)}]
              (is (= (refused-by-test-db) (refusal "card" (:id card))))))
          (testing "is null where a link may be created"
            (mt/with-temp [:model/Database  other     {}
                           :model/Card      card      {:database_id (:id other)}
                           :model/Dashboard dashboard {}
                           :model/Document  document  {}
                           :model/Card      _         {:document_id (:id document)}]
              (is (= {:refusal nil} (refusal "card" (:id card))))
              (is (= {:refusal nil} (refusal "dashboard" (:id dashboard))))
              (testing "including for a question a document owns but does not embed"
                (is (= {:refusal nil} (refusal "document" (:id document)))))))
          (testing "404s on an archived entity"
            (mt/with-temp [:model/Card      card      {:archived true}
                           :model/Dashboard dashboard {:archived true}
                           :model/Document  document  {:archived true}]
              (doseq [[model id] [["card" (:id card)] ["dashboard" (:id dashboard)] ["document" (:id document)]]]
                (testing model
                  (is (=? {:message "The object has been archived."}
                          (mt/user-http-request :crowberto :get 404
                                                (format "public-link-refusal/%s/%d" model id))))))))
          (testing "404s on an entity that does not exist"
            (doseq [model ["card" "dashboard" "document"]]
              (testing model
                (is (= "Not found."
                       (mt/user-http-request :crowberto :get 404
                                             (format "public-link-refusal/%s/%d" model Integer/MAX_VALUE)))))))
          (testing "is superuser-only"
            (mt/with-temp [:model/Card card {}]
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :get 403 (format "public-link-refusal/card/%d" (:id card)))))
              (is (= "Unauthenticated"
                     (client/client :get 401 (format "public-link-refusal/card/%d" (:id card)))))))
          (testing "has no route for anything but a card, dashboard or document"
            (is (= "API endpoint does not exist."
                   (mt/user-http-request :crowberto :get 404 "public-link-refusal/action/1")))))
        (testing "is null once an admin allows anonymous access"
          (mt/with-temp [:model/DatabaseRouter _    {:database_id              (mt/id)
                                                     :user_attribute           "db_name"
                                                     :anonymous_access_granted true}
                         :model/Card           card {}]
            (is (= {:refusal nil} (refusal "card" (:id card)))))))
      (testing "is still refused without the database-routing feature"
        (mt/with-premium-features #{}
          (mt/with-temp [:model/DatabaseRouter _    {:database_id (mt/id), :user_attribute "db_name"}
                         :model/Card           card {}]
            (is (= (refused-by-test-db) (refusal "card" (:id card))))))))))

(defn- refused-database-id-by-database
  "The first of the sorted `database-ids` that has a DatabaseRouter without the anonymous-access grant, checked one
  Database at a time."
  [database-ids]
  (m/find-first #(and (t2/exists? :model/DatabaseRouter :database_id %)
                      (not (t2/select-one-fn :anonymous_access_granted :model/DatabaseRouter :database_id %)))
                (sort database-ids)))

(defn- refusal-naming
  "The refusal response that names the Database with `database-id`, or the response of no refusal for nil."
  [database-id]
  {:refusal (when database-id
              (let [database-name (t2/select-one-fn :name :model/Database :id database-id)]
                {:message  (public-sharing.test-util/anonymous-access-refused-message database-name)
                 :database {:id database-id, :name database-name}}))})

(defn- call-with-dashboard-on-databases
  "Call `f` with the id of a new Dashboard that shows one new Card on each Database of `database-ids`."
  [database-ids f]
  (let [dashboard-id (first (t2/insert-returning-pks! :model/Dashboard (mt/with-temp-defaults :model/Dashboard)))
        card-ids     (t2/insert-returning-pks! :model/Card (for [database-id database-ids]
                                                             (assoc (mt/with-temp-defaults :model/Card)
                                                                    :database_id database-id)))]
    (try
      (t2/insert! :model/DashboardCard (for [card-id card-ids]
                                         {:dashboard_id dashboard-id, :card_id card-id
                                          :row 0, :col 0, :size_x 4, :size_y 4}))
      (f dashboard-id)
      (finally
        (t2/delete! :model/Dashboard :id dashboard-id)
        (t2/delete! :model/Card :id [:in card-ids])))))

(deftest refusal-matches-per-database-check-test
  (when config/ee-available?
    (testing "the refusal names the Database that a check of each Database one at a time names"
      (mt/with-temp [:model/Database       plain       {}
                     :model/Database       granted     {}
                     :model/Database       refused-a   {}
                     :model/Database       refused-b   {}
                     :model/Database       destination {:router_database_id (:id refused-a)}
                     :model/DatabaseRouter _           {:database_id              (:id granted)
                                                        :user_attribute           "db_name"
                                                        :anonymous_access_granted true}
                     :model/DatabaseRouter _           {:database_id (:id refused-a), :user_attribute "db_name"}
                     :model/DatabaseRouter _           {:database_id (:id refused-b), :user_attribute "db_name"}]
        (doseq [features [#{:database-routing} #{}]
                dbs      [[plain]
                          [granted]
                          [refused-a]
                          [destination]
                          [plain granted destination]
                          [plain refused-b]
                          [granted refused-b refused-a]
                          [destination refused-b plain granted]
                          [refused-b refused-a destination]]]
          (testing (format "features %s, Databases %s" features (mapv :name dbs))
            (mt/with-premium-features features
              (let [database-ids (mapv :id dbs)]
                (call-with-dashboard-on-databases
                 database-ids
                 (fn [dashboard-id]
                   (is (= (refusal-naming (refused-database-id-by-database database-ids))
                          (refusal "dashboard" dashboard-id)))))))))))))

(defn- call-with-databases
  "Call `f` with the ids of `n` new Databases, each a router granted anonymous access when `routers?`."
  [n routers? f]
  (let [database-ids (t2/insert-returning-pks! :model/Database (repeatedly n #(mt/with-temp-defaults :model/Database)))]
    (try
      (when routers?
        (t2/insert! :model/DatabaseRouter (for [database-id database-ids]
                                            {:database_id              database-id
                                             :user_attribute           "db_name"
                                             :anonymous_access_granted true})))
      (f database-ids)
      (finally
        (t2/delete! :model/DatabaseRouter :database_id [:in database-ids])
        (t2/delete! :model/Database :id [:in database-ids])))))

(defn- statement-count
  "The number of app-DB statements `request` takes on a new Dashboard with one Card on each of `n` new Databases."
  [n routers? request]
  (call-with-databases
   n routers?
   (fn [database-ids]
     (call-with-dashboard-on-databases
      database-ids
      (fn [dashboard-id]
        (t2/with-call-count [call-count]
          (request dashboard-id)
          (call-count)))))))

(deftest refusal-statement-count-test
  (when config/ee-available?
    (mt/with-premium-features #{:database-routing}
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (doseq [routers?         [false true]
                [label request] [["GET /api/public-link-refusal/dashboard/:id"
                                  #(refusal "dashboard" %)]
                                 ["POST /api/dashboard/:id/public_link"
                                  #(mt/user-http-request :crowberto :post 200 (format "dashboard/%d/public_link" %))]]]
          (testing (format "%s takes as many statements for 6 Databases as for 2, routers: %s" label routers?)
            (statement-count 2 routers? request)
            (is (= (statement-count 2 routers? request)
                   (statement-count 6 routers? request)))))))))

(deftest refusal-without-enterprise-code-test
  (testing "without enterprise code no Database refuses anonymous access"
    (mt/when-ee-evailable
     (let [oss (:oss (get @defenterprise/registry
                          'metabase-enterprise.database-routing.models/anonymous-access-refusing-database-ids))]
       (mt/with-temp [:model/Database       refused {}
                      :model/Database       plain   {}
                      :model/DatabaseRouter _       {:database_id (:id refused), :user_attribute "db_name"}]
         (is (= #{} (oss [(:id refused) (:id plain)]))))))))
