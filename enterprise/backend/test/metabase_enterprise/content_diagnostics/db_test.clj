(ns metabase-enterprise.content-diagnostics.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.db :as cd.db]
   [metabase.test :as mt]))

(defn- row
  "A minimal valid finding row of `finding-type`, carrying `details`. `entity-id` varies per row: the
  table's unique index spans (scan_id, entity_type, entity_id, finding_type), so two accepted rows of
  the same finding type would otherwise collide."
  [entity-id finding-type details]
  {:scan_id                "db-test"
   :entity_type            :card
   :entity_id              entity-id
   :finding_type           finding-type
   :scope_collection_id    nil
   :last_active_at         nil
   :duration_ms            nil
   :content_count          nil
   :duplicate_count        nil
   :entity_name            nil
   :entity_created_at      nil
   :entity_creator_id      nil
   :entity_creator_name    nil
   :card_type              nil
   :entity_collection_name nil
   :entity_kind            nil
   :details                details})

(deftest insert-findings-checks-details-against-the-finding-type-test
  (testing "`details` is validated against the row's own finding type, not the union of every type"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (testing "a leaf slow finding's own details are accepted"
        (is (some? (cd.db/insert-findings! [(row 1 :slow {:threshold_ms 15000})]))))
      (testing "so is the container roll-up's alternative shape"
        (is (some? (cd.db/insert-findings! [(row 2 :slow {:slow_entity_ids [2 3]})]))))
      (testing "but another finding type's details are rejected"
        (is (thrown? clojure.lang.ExceptionInfo
                     (cd.db/insert-findings! [(row 3 :slow {:duplicate_entity_ids [2]})]))))
      (testing "and so is mixing two types' details in one blob"
        (is (thrown? clojure.lang.ExceptionInfo
                     (cd.db/insert-findings! [(row 4 :slow {:threshold_ms 1 :threshold_days 30})]))))
      (testing "an unregistered finding type has no arm at all"
        (is (thrown? clojure.lang.ExceptionInfo
                     (cd.db/insert-findings! [(row 5 :trash-not-emptied {:threshold_ms 1})])))))))
