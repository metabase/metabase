(ns metabase-enterprise.advanced-config.file.workspace
  "Loader for the `:workspace` section of `config.yml`.

  On boot, parses the section and stores it in the `instance-workspace` setting
  (see [[metabase-enterprise.workspaces.settings]]). That setting is the
  instance-side source of truth for `db-workspace-namespace`.

  Every boot re-reads `config.yml` and overwrites the prior value. The setting
  persists across restarts in the instance's app DB, so a running workspace
  survives a process bounce even without `config.yml` — but if `config.yml` is
  present at boot, it wins."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.advanced-config.db :as advanced-config.db]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.advanced-config.file.workspace.output :as-alias wkspc-output]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.load-metadata :as ws.load-metadata]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]))

(set! *warn-on-reflection* true)

;;; ---------------------------------- Spec ----------------------------------
;;;
;;; Wire format: every workspace-database carries `:input_schemas` (vec of plain
;;; schema-name strings) and `:output_namespace` (driver-opaque string —
;;; schema name on Postgres-shaped drivers, database name on MySQL). The
;;; warehouse catalog (SQL Server/BigQuery) is derived from the
;;; canonical `Database.details` at boot, not duplicated on each row.

(s/def ::non-blank-string
  (s/and string? (complement str/blank?)))

(s/def ::input_schemas
  (s/coll-of ::non-blank-string))

(s/def ::wkspc-output/db
  (s/nilable string?))

(s/def ::wkspc-output/schema
  (s/nilable string?))

(s/def ::output
  (s/and (s/keys :opt-un [::wkspc-output/db
                          ::wkspc-output/schema])
         (fn [m] (or (some? (:db m)) (some? (:schema m))))))

(s/def ::workspace-database-config
  (s/keys :req-un [::input_schemas ::output]))

(s/def ::databases
  ;; map of database-name -> per-database workspace config. Keys may be keywords or
  ;; strings depending on YAML parser flags; both are accepted.
  (s/and (s/map-of (s/or :kw keyword? :str string?) ::workspace-database-config)
         seq))

(s/def ::name ::non-blank-string)

;; Path of the load document (see `metabase-enterprise.workspaces.load-metadata`) the databases' Tables and Fields
;; are created from instead of an initial sync.
(s/def ::metadata_file ::non-blank-string)

(s/def ::config-file-spec
  (s/keys :req-un [::name ::databases]
          :opt-un [::metadata_file]))

(defmethod advanced-config.file.i/section-spec :workspace
  [_section-name]
  (s/spec ::config-file-spec))

;;; -------------------------------- Loader ---------------------------------

(defn- ordered->plain
  "snakeyaml's parsed maps are ordered/lazy; re-walk into plain Clojure maps."
  [x]
  (walk/postwalk
   (fn [form]
     (if (map? form)
       (into {} form)
       form))
   x))

(defn- resolve-db [db-name]
  (or (advanced-config.db/database-by-name db-name)
      (throw (ex-info (str "Workspace config references unknown database: " (pr-str db-name))
                      {:database-name db-name}))))

(defn- load-metadata-or-sync!
  "Create the Tables and Fields of `databases` (db-name -> Database) from the load document at `path`. The ones it
  doesn't load and that aren't synced yet get the sync their creation skipped (see
  [[metabase-enterprise.advanced-config.file/initialize!]])."
  [path databases]
  (let [loaded (ws.load-metadata/load-metadata-file! path (update-vals databases :id))]
    (doseq [db (vals databases)
            :when (and (not (loaded (:id db)))
                       (not= "complete" (:initial_sync_status db)))]
      (log/infof "Database %s wasn't loaded from the metadata file; syncing it" (pr-str (:name db)))
      (quick-task/submit-task! (fn [] (sync/sync-database! db))))))

(defn apply-workspace-section!
  "Boot-time materialization of the parsed `:workspace` section.

   Shape (post-`ordered->plain`):

     {:name          \"<workspace-name>\"
      :databases     {\"<db-name>\" {:input_schemas [<schema-name>, ...]
                                      :output        {:db ?, :schema ?}}
                      ...}
      :metadata_file \"<path>\"}   ; optional

   Resolves each database name to a `:model/Database` (rows are populated by the
   `:databases` section, which runs earlier — see
   [[metabase-enterprise.advanced-config.file/initialize!]]) and stores the
   result in the `instance-workspace` setting keyed by db-id. With `:metadata_file`, creates the databases' Tables
   and Fields from that load document instead of syncing them.

   The per-database `:output` map is taken verbatim — `workspaces.config/build-workspace-config`
   on the manager side emits it already-expanded, so we don't re-derive it here."
  [section-config]
  (let [{:keys [name databases metadata_file]} (ordered->plain section-config)
        dbs-by-name        (into {}
                                 (map (fn [db-name-kw]
                                        (let [db-name (clojure.core/name db-name-kw)]
                                          [db-name (resolve-db db-name)])))
                                 (keys databases))
        resolved-databases (into {}
                                 (map (fn [[db-name-kw wsd-config]]
                                        [(:id (dbs-by-name (clojure.core/name db-name-kw)))
                                         {:input_schemas (vec (:input_schemas wsd-config))
                                          :output        (:output wsd-config)}]))
                                 databases)]
    (ws/set-instance-workspace! {:name      name
                                 :databases resolved-databases})
    (when metadata_file
      (load-metadata-or-sync! metadata_file dbs-by-name))
    (log/infof "Loaded workspace %s from config.yml with %d database(s)"
               (pr-str name) (count resolved-databases))
    {:workspace-name name
     :database-count (count resolved-databases)}))

(defmethod advanced-config.file.i/initialize-section! :workspace
  [_section-name section-config]
  (apply-workspace-section! section-config))
