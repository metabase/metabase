(ns metabase-enterprise.advanced-config.file.workspace
  "Loader for the `:workspace` section of `config.yml`.

   On boot, parses the section and stores it in the in-process atom
   `metabase-enterprise.workspaces.core/workspace-instance-config`. That atom is the
   instance-side source of truth for `db-workspace-namespace`.

   The atom is fresh per process — every boot re-reads `config.yml` and replaces the
   prior value. There is no durable storage of instance-side workspace state, by
   design: the file IS the source of truth, and a different file at boot means a
   different workspace, no questions asked."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver :as driver]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def keep-me
  "Marker so the parent advanced-config.file ns can `(comment ...keep-me)` to retain the require."
  nil)

;;; ---------------------------------- Spec ----------------------------------
;;;
;;; Wire format: every workspace-database carries `:input_schemas` (vec of plain
;;; schema-name strings) and `:output_namespace` (driver-opaque string —
;;; schema name on Postgres-shaped drivers, database name on MySQL). The
;;; warehouse catalog (Snowflake/SQL Server/BigQuery) is derived from the
;;; canonical `Database.details` at boot, not duplicated on each row.

(s/def ::non-blank-string
  (s/and string? seq))

(s/def ::input_schemas
  (s/coll-of ::non-blank-string :min-count 1))

(s/def ::output_namespace ::non-blank-string)

(s/def ::workspace-database-config
  (s/keys :req-un [::input_schemas ::output_namespace]))

(s/def ::databases
  ;; map of database-name -> per-database workspace config. Keys may be keywords or
  ;; strings depending on YAML parser flags; both are accepted.
  (s/and (s/map-of (s/or :kw keyword? :str string?) ::workspace-database-config)
         seq))

(s/def ::name ::non-blank-string)

(s/def ::config-file-spec
  (s/keys :req-un [::name ::databases]))

(defn valid-workspace-section?
  "Predicate used by the file-level loader to decide whether `(:workspace m)` is a
  structurally-valid bring-up manifest. Only a valid section opens the
  config-text-file gate for OSS instances — a typo or empty section must not."
  [section-config]
  (s/valid? ::config-file-spec section-config))

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
  (or (t2/select-one :model/Database :name db-name)
      (throw (ex-info (str "Workspace config references unknown database: " (pr-str db-name))
                      {:database-name db-name}))))

(defn- expand-output
  "Expand a driver-opaque `output_namespace` string into the `{:db ?, :schema ?}`
   atom shape that QP middleware, transform_hooks, and table_remapping consume.

   The atom contract is map-shaped on purpose: doing this expansion once at
   boot lets the per-query hot path read both slots without re-running the
   per-engine case. For 3-slot drivers (Snowflake, SQL Server, BigQuery) the
   `:db` slot is filled from `Database.details`. For 2-slot drivers the
   `output_namespace` string lands in the schema slot.

   `output_namespace` blank means the workspace database isn't provisioned yet —
   the atom carries `{:db ? :schema nil}` and QP/transform consumers treat the
   workspace as having no output mapping."
  [db output-namespace]
  (let [components (set (driver/qualified-name-components (:engine db)))
        positions  (ws.table-remapping/engine-namespace-positions db)
        schema     (when-not (str/blank? output-namespace) output-namespace)]
    (cond-> {}
      (:db components)     (assoc :db (:db positions))
      (:schema components) (assoc :schema schema)
         ;; No-schema drivers (MySQL): the namespace name lands in the db slot.
      (and (:db components) (not (:schema components)))
      (assoc :db schema))))

(defn apply-workspace-section!
  "Boot-time materialization of the parsed `:workspace` section.

   Shape (post-`ordered->plain`):

     {:name      \"<workspace-name>\"
      :databases {\"<db-name>\" {:input_schemas    [<schema-name>, ...]
                                  :output_namespace <ns-string>}
                  ...}}

   Resolves each database name to a `:model/Database` (rows are populated by the
   `:databases` section, which runs earlier — see `advanced-config.file/initialize!`)
   and stores the result in `workspaces.core/workspace-instance-config` keyed by
   db-id. The atom carries `{:input_schemas [String], :output {:db ?, :schema ?}}`.
   `:output` is expanded once at boot via [[expand-output]] so the QP hot path
   doesn't re-run the per-engine case per query."
  [section-config]
  (let [{:keys [name databases]} (ordered->plain section-config)
        resolved-databases (into {}
                                 (map (fn [[db-name-kw wsd-config]]
                                        (let [db-name (clojure.core/name db-name-kw)
                                              db      (resolve-db db-name)]
                                          [(:id db) {:input_schemas (vec (:input_schemas wsd-config))
                                                     :output        (expand-output db (:output_namespace wsd-config))}])))
                                 databases)]
    (ws/set-instance-workspace! {:name      name
                                 :databases resolved-databases})
    (log/infof "Loaded workspace %s from config.yml with %d database(s)"
               (pr-str name) (count resolved-databases))
    {:workspace-name name
     :database-count (count resolved-databases)}))

(defmethod advanced-config.file.i/initialize-section! :workspace
  [_section-name section-config]
  (apply-workspace-section! section-config))
