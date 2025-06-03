(ns metabase.eid-translation.util-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.analytics.stats :as stats]
   [metabase.api.common :as api]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.eid-translation.util :as eid-translation.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:parallel api-name->model-test
  (testing "api-name->model should be up-to-date"
    (is (= (into {}
                 (keep (fn [[k {:keys [db-model]}]]
                         (when (#'eid-translation.util/api-model? db-model)
                           [(keyword k) db-model])))
                 api/model->db-model)
           @#'eid-translation.util/api-name->model))))

(deftest ->id-test
  (#'stats/clear-translation-count!)
  (is (= (assoc eid-translation/default-counter :total 0)
         (#'stats/get-translation-count)))
  (mt/with-temp [:model/Card {card-id :id card-eid :entity_id} {}]
    (is (= card-id (eid-translation.util/->id :card card-id)))
    (is (= card-id (eid-translation.util/->id :model/Card card-id)))
    (is (partial= {:ok 0 :total 0} (#'stats/get-translation-count))
        "Translations are not counted when they don't occur")
    (#'stats/clear-translation-count!)
    (is (= card-id (eid-translation.util/->id :card card-eid)))
    (is (= card-id (eid-translation.util/->id :model/Card card-eid)))
    (is (partial= {:ok 2 :total 2} (#'stats/get-translation-count))
        "Translations are counted when they do occur")
    (#'stats/clear-translation-count!))

  (let [samples (t2/select-fn->fn :id :entity_id [:model/Card :id :entity_id] {:limit 100})]
    (when (seq samples)
      (doseq [[card-id entity-id] samples]
        (testing (str "card-id: " card-id " entity-id: " entity-id)

          (is (= card-id (eid-translation.util/->id :model/Card card-id)))
          (is (= card-id (eid-translation.util/->id :card card-id)))

          (is (= card-id (eid-translation.util/->id :model/Card entity-id)))
          (is (= card-id (eid-translation.util/->id :card entity-id)))))
      (is (malli= [:map [:ok pos-int?] [:total pos-int?]]
                  (#'stats/get-translation-count))))))

(deftest ^:parallel entity-id-single-card-translations-test
  (mt/with-temp
    [:model/Card {id :id eid :entity_id} {}]
    (is (= {eid {:id id :type :card :status :ok}}
           (eid-translation.util/model->entity-ids->ids {:card [eid]})))))

(deftest ^:parallel entity-id-card-translations-test
  (mt/with-temp
    [:model/Card {id   :id eid   :entity_id} {}
     :model/Card {id-0 :id eid-0 :entity_id} {}
     :model/Card {id-1 :id eid-1 :entity_id} {}
     :model/Card {id-2 :id eid-2 :entity_id} {}
     :model/Card {id-3 :id eid-3 :entity_id} {}
     :model/Card {id-4 :id eid-4 :entity_id} {}
     :model/Card {id-5 :id eid-5 :entity_id} {}]
    (is (= {eid   {:id id   :type :card :status :ok}
            eid-0 {:id id-0 :type :card :status :ok}
            eid-1 {:id id-1 :type :card :status :ok}
            eid-2 {:id id-2 :type :card :status :ok}
            eid-3 {:id id-3 :type :card :status :ok}
            eid-4 {:id id-4 :type :card :status :ok}
            eid-5 {:id id-5 :type :card :status :ok}}
           (eid-translation.util/model->entity-ids->ids {:card [eid eid-0 eid-1 eid-2 eid-3 eid-4 eid-5]})))))

(deftest entity-id-mixed-translations-test
  (mt/with-temp
    [;; prereqs to create the eid-able entities:
     :model/Card  {model-id :id} {:type :model}
     :model/Card  {card-id :id}  {}
     :model/Field {field-id :id} {}

     ;; eid models:
     :model/Action             {action_id               :id action_eid               :entity_id} {:name "model for creating action" :model_id model-id :type :http}
     :model/Collection         {collection_id           :id collection_eid           :entity_id} {}
     ;; filling entity id for User doesn't work: do it manually below.
     :model/User               {core_user_id            :id #_#_core_user_eid        :entity_id} {}
     :model/Dimension          {dimension_id            :id dimension_eid            :entity_id} {:field_id field-id}
     :model/NativeQuerySnippet {native_query_snippet_id :id native_query_snippet_eid :entity_id} {:creator_id core_user_id}
     :model/PermissionsGroup   {permissions_group_id    :id permissions_group_eid    :entity_id} {}
     :model/Pulse              {pulse_id                :id pulse_eid                :entity_id} {}
     :model/PulseCard          {pulse_card_id           :id pulse_card_eid           :entity_id} {:pulse_id pulse_id :card_id card-id}
     :model/PulseChannel       {pulse_channel_id        :id pulse_channel_eid        :entity_id} {:pulse_id pulse_id}
     :model/Card               {card_id                 :id card_eid                 :entity_id} {}
     :model/Dashboard          {dashboard_id            :id dashboard_eid            :entity_id} {}
     :model/DashboardTab       {dashboard_tab_id        :id dashboard_tab_eid        :entity_id} {:dashboard_id dashboard_id}
     :model/DashboardCard      {dashboardcard_id        :id dashboardcard_eid        :entity_id} {:dashboard_id dashboard_id}
     :model/Segment            {segment_id              :id segment_eid              :entity_id} {}
     :model/Timeline           {timeline_id             :id timeline_eid             :entity_id} {}]
    (let [core_user_eid (u/generate-nano-id)]
      (t2/update! :model/User core_user_id {:entity_id core_user_eid})
      (is (= {action_eid               {:id action_id               :type :action            :status :ok}
              collection_eid           {:id collection_id           :type :collection        :status :ok}
              core_user_eid            {:id core_user_id            :type :user              :status :ok}
              dashboard_tab_eid        {:id dashboard_tab_id        :type :dashboard-tab     :status :ok}
              dimension_eid            {:id dimension_id            :type :dimension         :status :ok}
              native_query_snippet_eid {:id native_query_snippet_id :type :snippet           :status :ok}
              permissions_group_eid    {:id permissions_group_id    :type :permissions-group :status :ok}
              pulse_eid                {:id pulse_id                :type :pulse             :status :ok}
              pulse_card_eid           {:id pulse_card_id           :type :pulse-card        :status :ok}
              pulse_channel_eid        {:id pulse_channel_id        :type :pulse-channel     :status :ok}
              card_eid                 {:id card_id                 :type :card              :status :ok}
              dashboard_eid            {:id dashboard_id            :type :dashboard         :status :ok}
              dashboardcard_eid        {:id dashboardcard_id        :type :dashboard-card    :status :ok}
              segment_eid              {:id segment_id              :type :segment           :status :ok}
              timeline_eid             {:id timeline_id             :type :timeline          :status :ok}}
             (eid-translation.util/model->entity-ids->ids
              {:action            [action_eid]
               :card              [card_eid]
               :collection        [collection_eid]
               :dashboard         [dashboard_eid]
               :dashboard-card    [dashboardcard_eid]
               :dashboard-tab     [dashboard_tab_eid]
               :dimension         [dimension_eid]
               :permissions-group [permissions_group_eid]
               :pulse             [pulse_eid]
               :pulse-card        [pulse_card_eid]
               :pulse-channel     [pulse_channel_eid]
               :segment           [segment_eid]
               :snippet           [native_query_snippet_eid]
               :timeline          [timeline_eid]
               :user              [core_user_eid]}))))))

(deftest ^:parallel missing-entity-translations-test
  (is (= {"abcdefghijklmnopqrstu" {:type :card, :status :not-found}}
         (eid-translation.util/model->entity-ids->ids {:card ["abcdefghijklmnopqrstu"]}))))

(deftest ^:parallel wrong-format-entity-translations-test
  (is (= {"abcdefghijklmnopqrst"
          {:type :card,
           :status :invalid-format,
           :reason ["\"abcdefghijklmnopqrst\" should be 21 characters long, but it is 20"]}}
         (eid-translation.util/model->entity-ids->ids {:card ["abcdefghijklmnopqrst"]}))))
