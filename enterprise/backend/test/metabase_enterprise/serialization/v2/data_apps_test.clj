(ns metabase-enterprise.serialization.v2.data-apps-test
  "Serialization tests for data apps models"
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase.data-apps.models :as data-apps.models]
   [metabase.data-apps.test-util :as data-apps.tu]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest data-app-make-spec-test
  (testing "DataApp make-spec implementation"
    (let [spec (serdes/make-spec "DataApp" {})]
      (testing "includes expected structure"
        (is (some? spec))
        (is (contains? spec :copy))
        (is (contains? spec :skip))
        (is (contains? spec :transform))))))

(deftest data-app-e2e-test
  (testing "DataApp with released definition must be serialized and deserialized correctly"
    (ts/with-random-dump-dir [dump-dir "serdes-data-apps-"]
      (ts/with-dbs [source-db dest-db]
        (ts/with-db source-db
          ;; Create data app with released definition using the data apps test utility
          (data-apps.tu/with-released-app!
            [_app {:name "Test Data App"
                   :slug "test-data-app"
                   :description "A test data app for serialization"}]
            ;; Extract and store
            (let [extraction (serdes/with-cache (into [] (extract/extract {})))
                  data-apps  (filter #(= "DataApp" (-> % :serdes/meta last :model)) extraction)
                  data-app   (first data-apps)]
              (is (=? {:creator_id          "crowberto@metabase.com"
                       :name                "Test Data App"
                       :released_definition [{:config          (mt/malli=? :map)
                                              :creator_id      "crowberto@metabase.com",
                                              :release         [{:app_id     (:entity_id data-app)
                                                                 :creator_id "crowberto@metabase.com",
                                                                 :retracted false}],
                                              :revision_number 1}]}
                      data-app))
              (storage/store! (seq extraction) dump-dir)))

          (ts/with-db dest-db
            ;; Load from dump
            (serdes/with-cache
              (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir)))

            (let [imported-app (data-apps.models/get-published-data-app "test-data-app")]
              (is (=? {:creator_id (mt/user->id :crowberto),
                       :definition {:app_id (:id imported-app),
                                    :config {:actions [],
                                             :pages [{:name "Default Page"}],
                                             :parameters []},
                                    :creator_id (mt/user->id :crowberto),
                                    :id (mt/user->id :crowberto),
                                    :revision_number 1},
                       :description "A test data app for serialization",
                       :name        "Test Data App",
                       :slug        "test-data-app",
                       :status      :published}
                      imported-app)))))))))

