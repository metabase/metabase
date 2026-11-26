(ns metabase.queries.models.card-request-workspace-test
  "A request works in a workspace only through the remote sync worktree that names it, whose Cards are its own: they
  store the column lists of their queries as in any worktree, and production's Cards do not change."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(defn- table-query [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-key)))))

(def ^:private result-metadata
  [{:name "ID" :display_name "ID" :base_type :type/BigInteger}])

(defn- card-row [card-name]
  {:name                   card-name
   :display                :table
   :visualization_settings {}
   :dataset_query          (table-query :venues)
   :result_metadata        result-metadata
   :creator_id             (mt/user->id :crowberto)})

(defn- column-names [card-id]
  (mdb/with-worktree-scope {:type :all}
    (map :name (t2/select-one-fn :result_metadata :model/Card :id card-id))))

(deftest a-workspace-worktree-card-stores-its-columns-test
  (mt/with-model-cleanup [:model/Card]
    (let [[{production-id :id}] (card/create-cards! [(card-row "production")])
          worktree-id           (t2/insert-returning-pk! :remote_sync_worktree {:branch (mt/random-name)})]
      (try
        (mdb/with-worktree-scope {:type :worktree :worktree-id worktree-id}
          (mt/with-dynamic-fn-redefs [workspaces/workspace-bound? (constantly true)]
            (let [[{own-id :id}] (card/create-cards! [(card-row "own")])]
              (testing "a Card made in the worktree stores its column list"
                (is (= ["ID"] (column-names own-id))))
              (testing "an update in the worktree stores the new list"
                (card/update-cards! [{:id own-id :result_metadata [{:name "WS" :display_name "WS"
                                                                    :base_type :type/Text}]}])
                (is (= ["WS"] (column-names own-id))))
              (testing "production's Card is out of the worktree's reach"
                (card/update-cards! [{:id production-id :result_metadata [{:name "WS" :display_name "WS"
                                                                           :base_type :type/Text}]}])
                (is (= ["ID"] (column-names production-id)))))))
        (finally
          (t2/delete! :remote_sync_worktree :id worktree-id))))))
