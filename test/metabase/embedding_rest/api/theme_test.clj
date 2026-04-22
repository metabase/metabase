(ns metabase.embedding-rest.api.theme-test
  "Tests for /api/embed-theme endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.embedding.settings :as embedding.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(deftest create-theme-test
  (testing "POST /api/embed-theme"
    (testing "creates a new embedding theme"
      (mt/with-empty-h2-app-db!
        (let [theme-name "My Test Theme"
              settings   {:color {:brand "#FF0000"}}
              response   (mt/user-http-request :crowberto :post 200 "embed-theme"
                                               {:name     theme-name
                                                :settings settings})]
          (is (= #{:id :entity_id :name :settings :created_at :updated_at}
                 (set (keys response))))
          (is (= theme-name (:name response)))
          (is (= settings (:settings response)))
          (is (pos-int? (:id response)))
          (is (some? (:created_at response)))
          (is (some? (:updated_at response))))))
    (testing "requires superuser permissions"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "embed-theme"
                                   {:name     "Test Theme"
                                    :settings {}}))))
    (testing "requires a non-blank name"
      (is (=? {:errors {:name "value must be a non-blank string."}}
              (mt/user-http-request :crowberto :post 400 "embed-theme"
                                    {:name     ""
                                     :settings {}}))))
    (testing "requires settings to be a map"
      (is (=? {:errors {:settings string?}}
              (mt/user-http-request :crowberto :post 400 "embed-theme"
                                    {:name     "Test Theme"
                                     :settings "not a map"}))))))

(deftest list-themes-test
  (testing "GET /api/embed-theme"
    (testing "returns a list of all themes"
      (mt/with-empty-h2-app-db!
        (is (= [] (mt/user-http-request :crowberto :get 200 "embed-theme")))
        (mt/user-http-request :crowberto :post 200 "embed-theme"
                              {:name     "Theme 1"
                               :settings {:color {:brand "#FF0000"}}})
        (mt/user-http-request :crowberto :post 200 "embed-theme"
                              {:name     "Theme 2"
                               :settings {:color {:brand "#00FF00"}}})
        (let [themes (mt/user-http-request :crowberto :get 200 "embed-theme")]
          (is (= 2 (count themes)))
          ; settings is used for theme card previews
          (is (= #{:id :entity_id :name :settings :created_at :updated_at}
                 (set (keys (first themes)))))
          (testing "themes are ordered by oldest first"
            (is (= ["Theme 1" "Theme 2"]
                   (map :name themes)))))))
    (testing "requires superuser permissions"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "embed-theme"))))))

(deftest get-theme-test
  (testing "GET /api/embed-theme/:id"
    (testing "returns a single theme with full details"
      (mt/with-empty-h2-app-db!
        (let [settings {:color {:brand "#FF0000"}}
              created  (mt/user-http-request :crowberto :post 200 "embed-theme"
                                             {:name     "Test Theme"
                                              :settings settings})
              theme-id (:id created)
              response (mt/user-http-request :crowberto :get 200 (format "embed-theme/%s" theme-id))]
          (is (= #{:id :entity_id :name :settings :created_at :updated_at}
                 (set (keys response))))
          (is (= "Test Theme" (:name response)))
          (is (= settings (:settings response))))))
    (testing "returns 404 for non-existent theme"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 "embed-theme/999999"))))
    (testing "requires superuser permissions"
      (mt/with-temp [:model/EmbeddingTheme {theme-id :id} {:name     "Test Theme"
                                                           :settings {}}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (format "embed-theme/%s" theme-id))))))))

(deftest update-theme-test
  (testing "PUT /api/embed-theme/:id"
    (testing "updates theme name"
      (mt/with-empty-h2-app-db!
        (let [created  (mt/user-http-request :crowberto :post 200 "embed-theme"
                                             {:name     "Original Name"
                                              :settings {:color {:brand "#FF0000"}}})
              theme-id (:id created)
              response (mt/user-http-request :crowberto :put 200 (format "embed-theme/%s" theme-id)
                                             {:name "Updated Name"})]
          (is (= "Updated Name" (:name response)))
          (is (= {:color {:brand "#FF0000"}} (:settings response))))))
    (testing "updates theme settings"
      (mt/with-empty-h2-app-db!
        (let [created  (mt/user-http-request :crowberto :post 200 "embed-theme"
                                             {:name     "Test Theme"
                                              :settings {:color {:brand "#FF0000"}}})
              theme-id (:id created)
              response (mt/user-http-request :crowberto :put 200 (format "embed-theme/%s" theme-id)
                                             {:settings {:color {:brand "#00FF00"}}})]
          (is (= "Test Theme" (:name response)))
          (is (= {:color {:brand "#00FF00"}} (:settings response))))))
    (testing "returns 404 for non-existent theme"
      (is (= "Not found."
             (mt/user-http-request :crowberto :put 404 "embed-theme/999999"
                                   {:name "Updated Name"}))))
    (testing "requires superuser permissions"
      (mt/with-temp [:model/EmbeddingTheme {theme-id :id} {:name     "Test Theme"
                                                           :settings {}}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (format "embed-theme/%s" theme-id)
                                     {:name "Updated Name"})))))))

(deftest delete-theme-test
  (testing "DELETE /api/embed-theme/:id"
    (testing "deletes a theme"
      (mt/with-empty-h2-app-db!
        (let [created  (mt/user-http-request :crowberto :post 200 "embed-theme"
                                             {:name     "Test Theme"
                                              :settings {}})
              theme-id (:id created)]
          (is (t2/exists? :model/EmbeddingTheme :id theme-id))
          (is (nil? (mt/user-http-request :crowberto :delete 204 (format "embed-theme/%s" theme-id))))
          (is (not (t2/exists? :model/EmbeddingTheme :id theme-id))))))
    (testing "returns 404 for non-existent theme"
      (is (= "Not found."
             (mt/user-http-request :crowberto :delete 404 "embed-theme/999999"))))
    (testing "requires superuser permissions"
      (mt/with-temp [:model/EmbeddingTheme {theme-id :id} {:name     "Test Theme"
                                                           :settings {}}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 (format "embed-theme/%s" theme-id))))
        (is (t2/exists? :model/EmbeddingTheme :id theme-id))))))

(deftest copy-theme-test
  (testing "POST /api/embed-theme/:id/copy"
    (testing "duplicates a theme with 'Copy of' prefix"
      (mt/with-empty-h2-app-db!
        (let [original-name "My Theme"
              original-settings {:colors {:brand "#FF0000"
                                          :text-primary "#000000"}}
              created  (mt/user-http-request :crowberto :post 200 "embed-theme"
                                             {:name     original-name
                                              :settings original-settings})
              theme-id (:id created)
              response (mt/user-http-request :crowberto :post 200 (format "embed-theme/%s/copy" theme-id))]
          (is (= #{:id :entity_id :name :settings :created_at :updated_at}
                 (set (keys response))))
          (is (= "Copy of My Theme" (:name response)))
          (is (= original-settings (:settings response)))
          (is (not= theme-id (:id response)))
          (testing "both themes exist in the database"
            (is (t2/exists? :model/EmbeddingTheme :id theme-id))
            (is (t2/exists? :model/EmbeddingTheme :id (:id response)))))))
    (testing "returns 404 for non-existent theme"
      (is (= "Not found."
             (mt/user-http-request :crowberto :post 404 "embed-theme/999999/copy"))))
    (testing "requires superuser permissions"
      (mt/with-temp [:model/EmbeddingTheme {theme-id :id} {:name     "Test Theme"
                                                           :settings {}}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 (format "embed-theme/%s/copy" theme-id))))))))

(def ^:private example-seed-body
  {:themes [{:name     "Light"
             :settings {:colors {:brand "#509EE3"}}}
            {:name     "Dark"
             :settings {:colors {:brand "#88BF4D"}}}]})

(deftest seed-defaults-theme-test
  (testing "POST /api/embed-theme/seed-defaults"
    (testing "seeds the provided themes and flips the setting on first call"
      (mt/with-empty-h2-app-db!
        (is (false? (embedding.settings/default-embedding-themes-seeded)))
        (is (nil? (mt/user-http-request :crowberto :post 204 "embed-theme/seed-defaults" example-seed-body)))
        (is (= ["Light" "Dark"]
               (map :name (t2/select :model/EmbeddingTheme {:order-by [[:created_at :asc]]}))))
        (is (true? (embedding.settings/default-embedding-themes-seeded)))))
    (testing "subsequent calls are a no-op once the setting is flipped — even if themes were deleted"
      (mt/with-empty-h2-app-db!
        (mt/user-http-request :crowberto :post 204 "embed-theme/seed-defaults" example-seed-body)
        (t2/delete! :model/EmbeddingTheme)
        (mt/user-http-request :crowberto :post 204 "embed-theme/seed-defaults" example-seed-body)
        (is (zero? (t2/count :model/EmbeddingTheme))
            "Admin deletion should be preserved — no re-seed")))
    (testing "rolls back atomically when an insert fails"
      (mt/with-empty-h2-app-db!
        (let [original-insert t2/insert!]
          (with-redefs [t2/insert! (fn [model & rows]
                                     (if (= model :model/EmbeddingTheme)
                                       (throw (ex-info "boom" {}))
                                       (apply original-insert model rows)))]
            (mt/user-http-request :crowberto :post 500 "embed-theme/seed-defaults" example-seed-body)))
        (is (zero? (t2/count :model/EmbeddingTheme)))
        (is (false? (embedding.settings/default-embedding-themes-seeded))
            "Setting flag must not flip when the insert fails")))
    (testing "requires superuser permissions"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "embed-theme/seed-defaults" example-seed-body))))
    (testing "requires a themes array of non-blank names and map settings"
      (is (=? {:errors {:themes string?}}
              (mt/user-http-request :crowberto :post 400 "embed-theme/seed-defaults" {:themes "nope"}))))))
