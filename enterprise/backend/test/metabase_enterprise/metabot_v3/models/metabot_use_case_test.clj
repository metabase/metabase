(ns metabase-enterprise.metabot-v3.models.metabot-use-case-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest default-use-cases-exist-test
  (testing "internal metabot has default use cases after migration"
    (let [internal-entity-id (get-in metabot-v3.config/metabot-config
                                     [metabot-v3.config/internal-metabot-id :entity-id])
          metabot-id (t2/select-one-pk :model/Metabot :entity_id internal-entity-id)]
      (when metabot-id
        (let [use-cases (t2/select :model/MetabotUseCase :metabot_id metabot-id {:order-by [[:name :asc]]})]
          (is (= ["nlq" "omnibot" "sql" "transforms"]
                 (map :name use-cases)))))))

  (testing "embedded metabot has default use cases after migration"
    (let [embedded-entity-id (get-in metabot-v3.config/metabot-config
                                     [metabot-v3.config/embedded-metabot-id :entity-id])
          metabot-id (t2/select-one-pk :model/Metabot :entity_id embedded-entity-id)]
      (when metabot-id
        (let [use-cases (t2/select :model/MetabotUseCase :metabot_id metabot-id)]
          (is (= 1 (count use-cases)))
          (is (= "embedding" (:name (first use-cases)))))))))
