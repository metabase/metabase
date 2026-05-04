(ns metabase-enterprise.advanced-config.file.workspace
  "Loader for the `:workspace` section of `config.yml`.

   On boot, parses the section and stores it in the in-process atom
   `metabase-enterprise.workspaces.core/workspace-instance-config`. That atom is the
   instance-side source of truth for `db-workspace-schema`.

   The atom is fresh per process — every boot re-reads `config.yml` and replaces the
   prior value. There is no durable storage of instance-side workspace state, by
   design: the file IS the source of truth, and a different file at boot means a
   different workspace, no questions asked."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.walk :as walk]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def keep-me
  "Marker so the parent advanced-config.file ns can `(comment ...keep-me)` to retain the require."
  nil)

;;; ---------------------------------- Spec ----------------------------------
;;;
;;; Wire format: every workspace-database carries `:input` (vec of namespace maps)
;;; and `:output` (single namespace map). A namespace is `{:db ?, :schema ?}` -
;;; both keys optional, missing means "this driver doesn't emit this AST level."
;;; Empty string `""` is invalid on the wire (only valid at storage). See
;;; `ai-reports/2026-05-04-table-namespace-mapping-spec.md` for the full contract.

(s/def ::non-blank-string
  (s/and string? seq))

(s/def ::db ::non-blank-string)
(s/def ::schema ::non-blank-string)

(s/def ::table-namespace
  ;; A namespace is `{:db ?, :schema ?}` with at least one slot populated. An
  ;; entirely empty `{}` is illegal: there's nothing to remap to/from.
  (s/and (s/keys :opt-un [::db ::schema])
         (fn [m] (or (contains? m :db) (contains? m :schema)))))

(s/def ::input
  (s/coll-of ::table-namespace :min-count 1))

(s/def ::output ::table-namespace)

(s/def ::workspace-database-config
  (s/keys :req-un [::input ::output]))

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

(defn- resolve-db-id [db-name]
  (or (t2/select-one-pk :model/Database :name db-name)
      (throw (ex-info (str "Workspace config references unknown database: " (pr-str db-name))
                      {:database-name db-name}))))

(defn apply-workspace-section!
  "Boot-time materialization of the parsed `:workspace` section.

   Shape (post-`ordered->plain`):

     {:name      \"<workspace-name>\"
      :databases {\"<db-name>\" {:input  [{:db ?, :schema ?}, ...]
                                  :output {:db ?, :schema ?}}
                  ...}}

   Resolves each database name to a `:model/Database` id (the canonical Database
   rows are populated by the `:databases` section, which runs earlier — see
   `advanced-config.file/initialize!`) and stores the result in
   `workspaces.core/workspace-instance-config` keyed by db-id. The atom carries
   the same `{:input, :output}` shape — `nil` slots stay `nil` (translation to
   the storage `\"\"` sentinel happens at the storage boundary, not here)."
  [section-config]
  (let [{:keys [name databases]} (ordered->plain section-config)
        resolved-databases (into {}
                                 (map (fn [[db-name-kw wsd-config]]
                                        (let [db-name (clojure.core/name db-name-kw)
                                              db-id   (resolve-db-id db-name)]
                                          [db-id {:input  (vec (:input wsd-config))
                                                  :output (:output wsd-config)}])))
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
