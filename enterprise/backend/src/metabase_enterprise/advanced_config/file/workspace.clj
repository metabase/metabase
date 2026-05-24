(ns metabase-enterprise.advanced-config.file.workspace
  "Loader for the `:workspace` section of `config.yml`.

  On boot, parses the section and stores it in the `workspace-instance` setting
  (see `metabase-enterprise.workspaces.settings`). That setting is the
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
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.util.log :as log]))

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

(defn apply-workspace-section!
  "Boot-time materialization of the parsed `:workspace` section.

   Shape (post-`ordered->plain`):

     {:name      \"<workspace-name>\"
      :databases {\"<db-name>\" {:input_schemas    [<schema-name>, ...]
                                  :output_namespace <ns-string>}
                  ...}}

   Resolves each database name to a `:model/Database` (rows are populated by the
   `:databases` section, which runs earlier — see
   [[metabase-enterprise.advanced-config.file/initialize!]]) and stores the
   result in the `workspace-instance` setting keyed by db-id. The setting
   carries `{:input_schemas [String], :output {:db ?, :schema ?}}` per database."
  [section-config]
  (let [config (ws/build-instance-config (ordered->plain section-config))]
    (ws/set-instance-workspace! config)
    (log/infof "Loaded workspace %s from config.yml with %d database(s)"
               (pr-str (:name config)) (count (:databases config)))
    {:workspace-name (:name config)
     :database-count (count (:databases config))}))

(defmethod advanced-config.file.i/initialize-section! :workspace
  [_section-name section-config]
  (apply-workspace-section! section-config))
