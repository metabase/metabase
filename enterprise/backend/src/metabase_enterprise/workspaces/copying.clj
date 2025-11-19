(ns metabase-enterprise.workspaces.copying
  (:require
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [toucan2.core :as t2]))

;; Following for reference ~atm
(def t2-transform-not-mirrored-keys
  #{:id :creator_id :created_at :updated_at :entity_id #_!!! :target})

;; t2 for snake
(def t2-transform-mirrored-keys
  #{:description :name :source :source_type})

;; Ignoring the "dag things" now, just mirror single transform
(defn- mirror-transform!
  "WIP"
  [workspace database entities-info]
  ;; how to clone reasonably
  ;; Expecting single transform now
  (assert (= 1 (count (-> entities-info :transforms))))
  (let [;; At this point transform tables were created and `transform` that follows should have the `:mirror`
        ;; key set. With addition of e.g. Clickhouse I expect some juggling with how we provide targets,
        ;; but for now doing plain copy-paste schema name here.
        ;; TODO (lbrdnk 2025-11-18) revisit schema, name vs db specific access pattern.
        transform (-> entities-info :transforms first)

        {:keys [mirror-schema-name
                mirror-table-name]}
        (:mirror transform)

        mirror (t2/insert-returning-instance! :model/Transform
                                              (merge
                                               (-> (select-keys transform t2-transform-mirrored-keys)
                                                   ;; this should be happening elsewhere, not on write, for now ok
                                                   (update :name str "_DUP"))
                                               {:workspace_id (:id workspace)
                                                :target {:type "table"
                                                         :database (:id database)
                                                         :schema mirror-schema-name
                                                         :name mirror-table-name}}))]
    (assoc entities-info :transforms [(assoc-in transform [:mirror :transform] mirror)])))

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

;; TODO: proper docstring
(defn mirror-entities!
  "WIP"
  [workspace ; some map???????
   {:keys [_check-outs
           inputs       ; tables the checkouts depend on
           _tables
           _transforms
           _nodes]
    :as entities-info}]
  ;; currently we support single transform only
  (assert (= 1 (count (-> entities-info :transforms))))
  (assert (>= 1 (count (-> entities-info :inputs))))
  (let [database (t2/select-one :model/Database :id (:db_id (first inputs)))]
    (ws.isolation/ensure-database-isolation! workspace database)
    (let [updated-info-1 (ws.isolation/create-transform-tables! workspace database entities-info)
          ;; TODO: later, working with multiple input entities, ensure toposorting for adjustments
          ;; Mirroring only a single transform here
          updated-info-2 (mirror-transform! workspace database updated-info-1)]
      @(def uuu updated-info-2))))

(comment
  ;;;; manually mirror some transform without dependencies
  ;;
  ;; Set the following vars, then exec try block
  ;; for cleanup use the do block
  ;;
  (def your-db-id 2)
  (def your-transform (t2/select-one :model/Transform :id 1))
  (def ws* {:id "ahoj2"})
  ;; going forward we will not be passing whole toucan model around
  (def entities-info* {:transforms [your-transform]
                       :inputs [(t2/select-one :model/Table :db_id your-db-id)]})
  (-> entities-info* :inputs first :db_id)

  (try (mirror-entities! ws* entities-info*)
       (catch Throwable t
         (def eee t)
         (throw t)))

  ;; synced transform tables
  #_(t2/select :model/Table :schema "mb__isolation_91499_ahoj2")

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