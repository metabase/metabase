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
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.advanced-config.file.workspace.output :as-alias wkspc-output]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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

(s/def ::config-file-spec
  (s/keys :req-un [::name ::databases]))

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

(defn apply-workspace-section!
  "Boot-time materialization of the parsed `:workspace` section.

   Shape (post-`ordered->plain`):

     {:name      \"<workspace-name>\"
      :databases {\"<db-name>\" {:input_schemas [<schema-name>, ...]
                                  :output        {:db ?, :schema ?}}
                  ...}}

   Resolves each database name to a `:model/Database` (rows are populated by the
   `:databases` section, which runs earlier — see
   [[metabase-enterprise.advanced-config.file/initialize!]]) and stores the
   result in the `instance-workspace` setting keyed by db-id.

   The per-database `:output` map is taken verbatim — `workspaces.config/build-workspace-config`
   on the manager side emits it already-expanded, so we don't re-derive it here."
  [section-config]
  (let [{:keys [name databases]} (ordered->plain section-config)
        resolved-databases (into {}
                                 (map (fn [[db-name-kw wsd-config]]
                                        (let [db-name (clojure.core/name db-name-kw)
                                              db      (resolve-db db-name)]
                                          [(:id db) {:input_schemas (vec (:input_schemas wsd-config))
                                                     :output        (:output wsd-config)}])))
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
