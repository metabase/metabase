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
            (let [extraction (serdes/with-cache (into [] (extract/extract {})))
                  data-apps  (filter #(= "DataApp" (-> % :serdes/meta last :model)) extraction)
                  data-app   (first data-apps)]
              (is (=? {:creator_id          "crowberto@metabase.com"
                       :name                "Test Data App"
                       :released_definition [{:config          (mt/malli=? :map)
                                              :creator_id      "crowberto@metabase.com",
                                              :release         [{:app_id     (:entity_id data-app)
                                                                 :creator_id "crowberto@metabase.com"}],
                                              :revision_number 1}]}
                      data-app))
              (storage/store! (seq extraction) dump-dir)))

          (ts/with-db dest-db
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

(deftest data-app-no-released-definition-test
  (testing "DataApp with no released definition must be serialized and deserialized correctly"
    (ts/with-random-dump-dir [dump-dir "serdes-data-apps-no-release-"]
      (ts/with-dbs [source-db dest-db]
        (ts/with-db source-db
          (data-apps.tu/with-data-app!
            [_app {:name "Test Data App No Release"
                   :slug "test-data-app-no-release"
                   :description "A test data app without released definition"
                   :definition  {:config data-apps.tu/default-app-definition-config}}]
            (let [extraction (serdes/with-cache (into [] (extract/extract {})))
                  data-apps  (filter #(= "DataApp" (-> % :serdes/meta last :model)) extraction)
                  data-app   (first data-apps)]
              (is (=? {:creator_id          "crowberto@metabase.com"
                       :name                "Test Data App No Release"
                       :released_definition nil}
                      data-app))
              (storage/store! (seq extraction) dump-dir)))

          (ts/with-db dest-db
            (serdes/with-cache
              (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir)))

            (let [imported-app (t2/select-one :model/DataApp :slug "test-data-app-no-release")]
              (is (zero? (t2/count :model/DataAppDefinition :app_id (:id imported-app))))
              (is (=? {:creator_id (mt/user->id :crowberto)
                       :description "A test data app without released definition"
                       :name        "Test Data App No Release"
                       :slug        "test-data-app-no-release"
                       :status      :private}
                      imported-app)))))))))

(deftest data-app-multiple-definitions-one-release-test
  (testing "DataApp with multiple definitions and one release will only serialize the relased definition"
    (ts/with-random-dump-dir [dump-dir "serdes-data-apps-multiple-"]
      (ts/with-dbs [source-db dest-db]
        (ts/with-db source-db
          ;; Create data app with initial definition
          (data-apps.tu/with-data-app!
            [app {:name       "Test Data App Multiple"
                  :slug       "test-data-app-multiple"
                  :description "A test data app with multiple definitions"
                  :definition {:config data-apps.tu/default-app-definition-config}}]
            ;; Create a second definition and release it
            (let [new-definition {:config {:actions []
                                           :pages [{:name "Released Page"}]
                                           :parameters []}
                                  :creator_id (mt/user->id :crowberto)}
                  _ (data-apps.models/set-latest-definition! (:id app) new-definition)
                  _ (data-apps.models/release! (:id app) (mt/user->id :crowberto))
                  ;; Create another definition after release (not released)
                  _ (data-apps.models/set-latest-definition! (:id app)
                                                             {:config {:actions []
                                                                       :pages [{:name "Post-Release Draft"}]
                                                                       :parameters []}
                                                              :creator_id (mt/user->id :crowberto)})
                  extraction (serdes/with-cache (into [] (extract/extract {})))
                  data-apps  (filter #(= "DataApp" (-> % :serdes/meta last :model)) extraction)
                  data-app   (first data-apps)]
              (is (=? {:creator_id          "crowberto@metabase.com"
                       :name                "Test Data App Multiple"
                       :released_definition [{:config          (mt/malli=? :map)
                                              :creator_id      "crowberto@metabase.com"
                                              :release         [{:app_id     (:entity_id data-app)
                                                                 :creator_id "crowberto@metabase.com"}]
                                              :revision_number 2}]}
                      data-app))
              (storage/store! (seq extraction) dump-dir))))

        (ts/with-db dest-db
          (serdes/with-cache
            (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir)))

          (let [imported-app (data-apps.models/get-published-data-app "test-data-app-multiple")]
            (is (=? {:creator_id (mt/user->id :crowberto)
                     :definition {:app_id          (:id imported-app)
                                  :config          {:actions []
                                                    :pages [{:name "Released Page"}]
                                                    :parameters []}
                                  :creator_id      (mt/user->id :crowberto)
                                  :id              (mt/user->id :crowberto)
                                  :revision_number 2}
                     :description "A test data app with multiple definitions"
                     :name        "Test Data App Multiple"
                     :slug        "test-data-app-multiple"
                     :status      :published}
                    imported-app))))))))
