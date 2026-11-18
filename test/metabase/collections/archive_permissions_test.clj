(ns metabase.collections.archive-permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.core :as collections]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- archived-flags
  "The `archived` flag of every row in `rows`, a map of model to rows, by model and id."
  [rows]
  (into {} (for [[model instances] rows
                 :let              [ids (map :id instances)]]
             [model (t2/select-pk->fn :archived model :id [:in ids])])))

(deftest collection-writer-archives-what-others-created-test
  (testing "a user who writes a Collection archives and restores it with an item of every kind others created in it"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
        (let [creator (mt/user->id :crowberto)]
          (mt/with-temp [:model/Collection         top          {}
                         :model/Collection         sub          {:location (format "/%d/" (:id top))}
                         :model/Collection         snippet-coll {:namespace "snippets"}
                         :model/Collection         actions-coll {:namespace "data-actions"}
                         :model/Card               card         {:collection_id (:id top), :creator_id creator}
                         :model/Card               sub-card     {:collection_id (:id sub), :creator_id creator}
                         :model/Dashboard          dashboard    {:collection_id (:id top), :creator_id creator}
                         :model/Card               dq           {:collection_id (:id top), :dashboard_id (:id dashboard), :creator_id creator}
                         :model/Document           document     {:collection_id (:id top), :creator_id creator}
                         :model/Card               doc-card     {:collection_id (:id top), :document_id (:id document), :creator_id creator}
                         :model/Exploration        exploration  {:collection_id (:id top), :creator_id creator}
                         :model/Document           summary      {:collection_id (:id top), :exploration_id (:id exploration), :creator_id creator}
                         :model/Timeline           timeline     {:collection_id (:id top), :creator_id creator}
                         :model/TimelineEvent      event        {:timeline_id (:id timeline), :creator_id creator}
                         :model/Pulse              pulse        {:collection_id (:id top), :creator_id creator}
                         :model/NativeQuerySnippet snippet      {:collection_id (:id snippet-coll), :creator_id creator}
                         :model/Action             action       {:type :query, :name "Rename", :model_id nil, :collection_id (:id actions-coll)}]
            (doseq [coll [top sub snippet-coll actions-coll]]
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))
            (let [rows        {:model/Collection         [top sub]
                               :model/Card               [card sub-card dq doc-card]
                               :model/Dashboard          [dashboard]
                               :model/Document           [document summary]
                               :model/Exploration        [exploration]
                               :model/Timeline           [timeline]
                               :model/Pulse              [pulse]}
                  all-flags   (fn [expected]
                                (every? (fn [[_model flags]] (every? #(= expected %) (vals flags)))
                                        (archived-flags rows)))]
              (mt/with-test-user :rasta
                (testing "archiving"
                  (collections/update-collection! (:id top) {:archived true})
                  (is (all-flags true))
                  (is (false? (t2/select-one-fn :archived :model/TimelineEvent :id (:id event))))
                  (collections/update-collection! (:id snippet-coll) {:archived true})
                  (is (true? (t2/select-one-fn :archived :model/NativeQuerySnippet :id (:id snippet))))
                  (collections/update-collection! (:id actions-coll) {:archived true})
                  (is (true? (t2/select-one-fn :archived :model/Action :id (:id action)))))
                (testing "restoring"
                  (collections/update-collection! (:id top) {:archived false})
                  (is (all-flags false))
                  (collections/update-collection! (:id snippet-coll) {:archived false})
                  (is (false? (t2/select-one-fn :archived :model/NativeQuerySnippet :id (:id snippet))))
                  (collections/update-collection! (:id actions-coll) {:archived false})
                  (is (false? (t2/select-one-fn :archived :model/Action :id (:id action)))))))))))))
