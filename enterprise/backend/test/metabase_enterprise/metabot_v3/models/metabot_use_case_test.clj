(ns metabase-enterprise.metabot-v3.models.metabot-use-case-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest resolve-profile-test
  (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                 :model/MetabotUseCase _ {:metabot_id metabot-id :name "nlq" :profile "internal" :enabled true}
                 :model/MetabotUseCase _ {:metabot_id metabot-id :name "sql" :profile "internal" :enabled true}
                 :model/MetabotUseCase _ {:metabot_id metabot-id :name "transforms" :profile "transforms_codegen" :enabled true}
                 :model/MetabotUseCase _ {:metabot_id metabot-id :name "omnibot" :profile "internal" :enabled true}]
    (testing "resolves profile from use case in DB"
      (is (= "internal" (metabot-v3.config/resolve-profile metabot-id "nlq" nil)))
      (is (= "internal" (metabot-v3.config/resolve-profile metabot-id "sql" nil)))
      (is (= "transforms_codegen" (metabot-v3.config/resolve-profile metabot-id "transforms" nil)))
      (is (= "internal" (metabot-v3.config/resolve-profile metabot-id "omnibot" nil))))

    (testing "profile override takes precedence"
      (is (= "custom-profile" (metabot-v3.config/resolve-profile metabot-id "nlq" "custom-profile")))
      (is (= "custom-profile" (metabot-v3.config/resolve-profile metabot-id "transforms" "custom-profile"))))

    (testing "returns nil for unknown use case"
      (is (nil? (metabot-v3.config/resolve-profile metabot-id "unknown-use-case" nil))))))
