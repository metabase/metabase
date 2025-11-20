(ns metabase-enterprise.workspaces.mirroring
  (:require
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;; TODO (Chris 2025-11-18) not sure why this is here - maybe we should check that between this and mirrored keys
;;       that we are fully specifying everying on the model - so we catch if something important is added.
(def t2-transform-not-mirrored-keys
  "WIP"
  #{:id :creator_id :created_at :updated_at :entity_id})

;; t2 for snake
(def t2-transform-keys
  "WIP"
  #{:description :name :source :target :source_type})

(defn- mirror-transform!
  "Create the mirroring transform and transform mapping rows for a single transform."
  [workspace database-id graph transform]
  ;; With addition of e.g. Clickhouse I expect some juggling with how we provide targets,
  ;; but for now doing plain copy-paste schema name here.
  ;; TODO (lbrdnk 2025-11-18) revisit schema, name vs db specific access pattern.
  (let [table-mapping (u/for-map [{:keys [name schema mapping]} (:outputs graph)]
                        [[name schema] ((juxt :name :schema) mapping)])
        ;; TODO (Chris 2025-11-19) avoid re-selecting here, by passing what we need from the start
        mirror        (let [transform (t2/select-one (into [:model/Transform] t2-transform-keys) (:id transform))
                            target    (:target transform)
                            old-s+n   ((juxt :schema :name) target)
                            new-s+n   (table-mapping old-s+n old-s+n)]
                        (assert (= "table" (:type target)) "We only support mirroring transforms that target tables.")
                        (assert (= database-id (:database target)) "Unexpected target database for transform.")
                        (merge transform
                               ;; TODO (Chris 2025-11-19) shouldn't rename like this - will mess up promotion!
                               {:name         (str (:name transform) "_DUP")
                                :workspace_id (:id workspace)
                                ;; TODO (Chris 2025-11-19) remap source table (when necessary)
                                #_#_:source {}
                                :target       {:type     "table"
                                               :database database-id
                                               :schema   (first new-s+n)
                                               :name     (second new-s+n)}}))
        mirror        (t2/insert-returning-instance! :model/Transform mirror)
        graph-node    (assoc transform :mapping (select-keys mirror [:id :name]))
        _             (t2/insert! :model/WorkspaceMappingTransform
                                  {:upstream_id   (:id transform)
                                   :downstream_id (:id mirror)
                                   :workspace_id  (:id workspace)})]
    (update graph :transforms #(if % (conj % graph-node) [graph-node]))))

(defn- mirror-transforms! [workspace database-id graph]
  (reduce #(mirror-transform! workspace database-id %1 %2) graph (:transforms graph)))

(comment
  ;;
  (t2/select-one :model/Transform)
  ;;=> (toucan2.instance/instance
  ;;    :model/Transform
  ;;    {:description "x",
  ;;     :dependency_analysis_version 2,
  ;;     :name "overwrite_existing_test",
  ;;     :source
  ;;     {:type :query,
  ;;      :query
  ;;      {:lib/type :mbql/query,
  ;;       :lib/metadata
  ;;       (metabase.lib.metadata.invocation-tracker/invocation-tracker-provider
  ;;        (metabase.lib.metadata.cached-provider/cached-metadata-provider
  ;;         (metabase.lib-be.metadata.jvm/->UncachedApplicationDatabaseMetadataProvider 2))),
  ;;       :database 2,
  ;;       :stages
  ;;       [{:lib/type :mbql.stage/mbql,
  ;;         :aggregation
  ;;         [[:sum
  ;;           #:lib{:uuid "ed6c85c7-9d2f-48e5-899a-ca77a56791f0"}
  ;;           [:field
  ;;            {:effective-type :type/Float, :lib/uuid "3e975bcc-4444-41d8-94ad-f107ec83419f", :base-type :type/Float}
  ;;            259]]],
  ;;         :source-table 32,
  ;;         :breakout
  ;;         [[:field
  ;;           {:effective-type :type/DateTimeWithLocalTZ,
  ;;            :base-type :type/DateTimeWithLocalTZ,
  ;;            :lib/uuid "32cf8766-5a19-430d-a006-4482cd8b9493",
  ;;            :temporal-unit :month}
  ;;           261]]}]}},
  ;;     :source_type :mbql,
  ;;     :creator_id 1,
  ;;     :updated_at #t "2025-11-18T10:07:10.024448Z",
  ;;     :id 1,
  ;;     :entity_id "otpI4D8HlmpmnIaesJzAL",
  ;;     :target {:type "table", :database 2, :name "tabi_tabi", :schema "public"},
  ;;     :created_at #t "2025-11-18T10:03:57.366345Z"})
  )

(defn mirror-entities!
  "WIP"
  [workspace
   database
   graph]
  ;; Add a check that isolation exists instead as this is supposed to be called from common or core.
  #_(ws.isolation/ensure-database-isolation! workspace database)
  (->> graph
       (ws.isolation/create-isolated-output-tables! workspace database)
       (mirror-transforms! workspace (:id database))))

#_:clj-kondo/ignore
(comment
  ;;;; manually mirror some transform without dependencies -- adjust to your needs
  ;;
  ;; Set the following vars, then exec try block
  ;; for cleanup use the do block
  ;;
  (def ws* {:id "ahoj2"})

  (def graph* (#'metabase-enterprise.workspaces.common/build-graph
               {:transforms (t2/select-fn-vec :id [:model/Transform :id] :workspace_id nil {:order-by [:id], :limit 1})}))

  (def db-id* (t2/select-one-fn :db_id [:model/Table :db_id] (:id (first (:inputs graph*)))))

  (try (mirror-entities! ws* db-id* graph*)
       (catch Throwable t
         (def eee t)
         (throw t)))

  ;; synced transform tables
  #_(t2/select :model/Table :schema [:like "mb__isolation_%_ahoj2"])

  ;; drop tested
  (do
    (t2/delete! :model/Transform :id [:> 1])
    (t2/delete! :model/Table :schema "mb__isolation_91499_ahoj2")
    (let [db (t2/select-one :model/Database :id 2)
          driver (metabase.driver.util/database->driver db)
          jdbc-spec ((requiring-resolve 'metabase.driver.sql-jdbc.connection/connection-details->spec)
                     driver
                     (:details db))]
      (clojure.java.jdbc/execute! jdbc-spec ["DROP SCHEMA \"mb__isolation_91499_ahoj2\" CASCADE"]))))
