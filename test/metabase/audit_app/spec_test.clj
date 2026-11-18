(ns metabase.audit-app.spec-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.audit-app.spec :as audit.spec]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.models.resolution :as models.resolution]
   [metabase.models.spec-test-util :as spec-test-util]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]))

(use-fixtures :once (fixtures/initialize :db))

(defn- audited-models!
  "The audited models of Metabase, once all of them have loaded."
  []
  (spec-test-util/load-models!)
  (filter models.resolution/model->namespace (audit.spec/audited-models)))

(deftest spec-schema-test
  (doseq [model (audited-models!)]
    (testing (str model)
      (is (nil? (mr/explain audit.spec/Spec (audit.spec/spec model)))))))

(deftest spec-columns-test
  (doseq [model (audited-models!)
          :let  [{:keys [track track-redacted skip]} (audit.spec/spec model)
                 listed (concat track track-redacted skip)
                 others (concat (remove #{:id} track) track-redacted skip)]]
    (testing (str model)
      (testing "lists no column twice, and none of the columns that no spec lists, but `:id` among those it tracks"
        (is (= (count listed) (count (set listed))))
        (is (empty? (filter audit.spec/implicit-columns others))))
      (testing "lists each column of its table under `:track`, `:track-redacted` or `:skip`: put a new column where it belongs"
        (is (= (set/difference (spec-test-util/table-columns model) audit.spec/implicit-columns)
               (set others)))))))

(deftest parent-test
  (doseq [model (audited-models!)
          :let  [{parent-model :model, parent-key :key, topics :topics, details :details} (audit.spec/parent model)]
          :when parent-model]
    (testing (str model)
      (testing "belongs to a model with a spec, through a column of its table"
        (is (some? (audit.spec/spec parent-model)))
        (is (contains? (spec-test-util/table-columns model) parent-key)))
      (testing "has the details of its rows under the parent if it records them there with topics"
        (is (= (some? topics) (some? details)))))))

(def ^:private function-topics
  "The topics that the functions in the `:topics` of the specs return, which cannot be enumerated from the specs."
  #{:card-update
    :document-create :document-update :document-delete
    :comment-update
    :user-update
    :api-key-update :api-key-regenerate
    :pulse-create :subscription-create})

(defn- data-topics
  "The topics that the specs of `models` store by data: the names of the events of the models that have no `:topics`,
  and the keywords in `:topics`, the `:topics` of `:parent` and `:moments`."
  [models]
  (into #{}
        (mapcat (fn [model]
                  (let [{:keys [topics parent moments]} (audit.spec/spec model)]
                    (concat (when (and (nil? topics) (nil? parent))
                              (map (comp keyword name) (vals (events/spec model))))
                            (filter keyword? (vals topics))
                            (vals (:topics parent))
                            (map :topic moments)))))
        models))

(def ^:private oss-topics
  "The topics that the audit specs of the models of Metabase store, which are public: they are what the Audit Log keeps."
  #{:api-key-create :api-key-delete :api-key-regenerate :api-key-update
    :cache-config-update
    :card-create :card-delete :card-public-link-created :card-public-link-deleted :card-update
    :channel-create :channel-update
    :comment-create :comment-delete :comment-update
    :dashboard-add-cards :dashboard-create :dashboard-delete :dashboard-public-link-created
    :dashboard-public-link-deleted :dashboard-remove-cards
    :database-create :database-delete :database-update
    :document-create :document-delete :document-update
    :glossary-create :glossary-delete :glossary-update
    :group-create :group-delete :group-membership-create :group-membership-delete :group-update
    :measure-create :measure-delete :measure-update
    :pulse-create
    :segment-create :segment-delete :segment-update
    :subscription-create :subscription-update
    :table-publish :table-unpublish
    :transform-create :transform-delete :update-transform
    :user-deactivated :user-reactivated :user-update})

(def ^:private ee-topics
  "The topics that the audit specs of the models of the enterprise edition store."
  #{:card-test-create :card-test-delete :card-test-update
    :custom-viz-plugin-create :custom-viz-plugin-delete :custom-viz-plugin-update
    :segment-test-create :segment-test-delete :segment-test-update
    :tenant-create :tenant-update
    :transform-test-create :transform-test-delete :transform-test-update})

(deftest stored-topics-test
  (is (= (cond-> oss-topics
           config/ee-available? (into ee-topics))
         (set/union (data-topics (audited-models!)) function-topics))))
