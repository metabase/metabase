(ns metabase.public-sharing-rest.api.refusal-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.documents.test-util :as documents.test-util]
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
  (t2/update! :model/Document document-id
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
          (testing "sees the question a filter renders indirectly, which a client guessing from the entity's own cards would miss"
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
          (testing "sees the questions a document embeds, though the document itself is saved against no database"
            (mt/with-temp [:model/Document document {}
                           :model/Card     card     {:document_id (:id document)}]
              (embed-cards-in-document! (:id document) [(:id card)])
              (is (= (refused-by-test-db) (refusal "document" (:id document))))))
          (testing "answers the same whether or not a link already exists: it is what a *new* link would reach"
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
          (testing "404s on an archived entity, as creating a public link on it does"
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
          (testing "is superuser-only, because naming the database says how an admin configured it"
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
      (testing "without the database-routing feature nothing is refused: there is no routing to break"
        (mt/with-temp [:model/DatabaseRouter _    {:database_id (mt/id), :user_attribute "db_name"}
                       :model/Card           card {}]
          (is (= {:refusal nil} (refusal "card" (:id card)))))))))
