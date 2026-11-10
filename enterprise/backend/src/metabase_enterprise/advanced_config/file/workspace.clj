(ns metabase-enterprise.advanced-config.file.workspace
  "Loader for the `:workspace` section of `config.yml`.

  The form the parent's `GET /api/ee/workspace-manager/:id/config` emits. On boot,
  translates it into the `workspaces-enabled` setting and each database's
  `database-workspace-schema` setting (see [[metabase-enterprise.workspaces.settings]]).
  The same settings can be set directly, in the `settings` section and per-database
  `settings`; this section is kept so existing configs keep working. `:id` and
  `:parent_url` set the parent identity (the `workspace-id` and `workspace-parent-url`
  settings) when either is present; a section with neither leaves both settings alone.
  `:name` and `:input_schemas` are accepted and ignored.

  Every boot re-reads `config.yml` and overwrites the prior values."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.advanced-config.db :as advanced-config.db]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.advanced-config.file.workspace.output :as-alias wkspc-output]
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

(s/def ::id
  (s/nilable pos-int?))

(s/def ::parent_url
  (s/nilable ::non-blank-string))

(s/def ::config-file-spec
  (s/keys :req-un [::name ::databases]
          :opt-un [::id ::parent_url]))

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

(defn apply-workspace-section!
  "Boot-time materialization of the parsed `:workspace` section.

   Shape (post-`ordered->plain`):

     {:id         <parent workspace id>
      :parent_url \"<parent site URL>\"
      :name       \"<workspace-name>\"
      :databases  {\"<db-name>\" {:input_schemas [<schema-name>, ...]
                                   :output        {:db ?, :schema ?}}
                   ...}}

   Resolves each database name to a `:model/Database` (rows are populated by the
   `:databases` section, which runs earlier — see
   [[metabase-enterprise.advanced-config.file/initialize!]]) and makes the instance a
   workspace whose databases write to the `:output` namespace. The schema is
   `:output`'s `:schema`, or its `:db` on engines without schemas (MySQL), where the
   parent puts the namespace there. When the section has `:id` or `:parent_url`, sets
   the parent identity from them, clearing whichever is absent. A section with neither
   leaves the identity alone, so a value from the `settings` section survives."
  [section-config]
  (let [{:keys [id parent_url name databases] :as section} (ordered->plain section-config)
        schemas (into {}
                      (map (fn [[db-name-kw {:keys [output]}]]
                             [(:id (resolve-db (clojure.core/name db-name-kw)))
                              (or (:schema output) (:db output))]))
                      databases)]
    (ws/set-instance-workspace! schemas)
    (when (or (contains? section :id) (contains? section :parent_url))
      (ws/set-instance-identity! id parent_url))
    (log/infof "Loaded workspace %s from config.yml with %d database(s)"
               (pr-str name) (count schemas))
    {:workspace-name name
     :database-count (count schemas)}))

(defmethod advanced-config.file.i/initialize-section! :workspace
  [_section-name section-config]
  (apply-workspace-section! section-config))
