(ns metabase-enterprise.metabot-v3.models.metabot-use-case-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest fetch-use-case-test
  (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                 :model/MetabotUseCase _ {:metabot_id metabot-id :name "nlq" :profile "internal" :enabled true}
                 :model/MetabotUseCase _ {:metabot_id metabot-id :name "sql" :profile "internal" :enabled true}
                 :model/MetabotUseCase _ {:metabot_id metabot-id :name "transforms" :profile "transforms_codegen" :enabled true}
                 :model/MetabotUseCase _ {:metabot_id metabot-id :name "omnibot" :profile "internal" :enabled false}]
    (testing "fetches use case from DB"
      (is (= {:profile "internal" :enabled true} (metabot-v3.config/fetch-use-case metabot-id "nlq")))
      (is (= {:profile "internal" :enabled true} (metabot-v3.config/fetch-use-case metabot-id "sql")))
      (is (= {:profile "transforms_codegen" :enabled true} (metabot-v3.config/fetch-use-case metabot-id "transforms")))
      (is (= {:profile "internal" :enabled false} (metabot-v3.config/fetch-use-case metabot-id "omnibot"))))

    (testing "returns nil for unknown use case"
      (is (nil? (metabot-v3.config/fetch-use-case metabot-id "unknown-use-case"))))))
