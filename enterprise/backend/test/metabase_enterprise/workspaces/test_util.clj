(ns ^:mb/driver-tests metabase-enterprise.workspaces.test-util
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn ws-fixtures!
  "Sets up test fixtures for workspace tests. Must be called at the top level of test namespaces."
  []
  (use-fixtures :once (fn [tests]
                        (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
                          (mt/with-premium-features [:workspaces :dependencies :transforms]
                            (search.tu/with-index-disabled
                              (tests))))))

  (use-fixtures :each (fn [tests]
                        (mt/with-model-cleanup [:model/Collection
                                                :model/Transform
                                                :model/TransformRun
                                                :model/Workspace
                                                :model/WorkspaceTransform]
                          (tests)))))

(defn ws-ready
  "Poll until workspace status becomes :ready or timeout."
  [ws-or-id]
  (let [ws-id (cond-> ws-or-id
                (map? ws-or-id) :id)]
    (u/poll {:thunk      #(t2/select-one :model/Workspace :id ws-id)
             :done?      #(= :ready (:status %))
             :timeout-ms 5000})))

(defn create-ready-ws!
  "Create a workspace and wait for it to be ready."
  [name]
  (ws-ready (mt/with-current-user (mt/user->id :crowberto)
              (ws.common/create-workspace! (mt/user->id :crowberto)
                                           {:name        name
                                            :database_id (mt/id)}))))
