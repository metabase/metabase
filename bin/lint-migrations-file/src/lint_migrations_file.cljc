(ns lint-migrations-file
  "This is cljc because it is used from both Clojure (:clj) and Babashka (:bb). Not cljs!"
  #_{:clj-kondo/ignore [:unused-alias :unused-namespace]}
  (:require
   [change-set.strict]
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.set :as set]
   [clojure.spec.alpha :as s]
   [clojure.string :as str])
  (:import
   (clojure.lang ExceptionInfo)
   (java.lang Integer)))

#_:clj-kondo/ignore
(set! *warn-on-reflection* true)

(comment change-set.strict/keep-me)

(defmacro validation-error
  "An exception with `::validation-error` in the data, for easy id later."
  [msg & [data]]
  `(ex-info ~msg (merge ~data {::validation-error true})))

(defn- validation-error? [e]
  (::validation-error (ex-data e)))

#?(:bb ::no-op
   :clj ;; just print ordered maps like normal maps.
   (defmethod print-method flatland.ordered.map.OrderedMap
     [m writer]
     (print-method (into {} m) writer)))

(defn- require-database-change-log! [migrations]
  (when-not (contains? migrations :databaseChangeLog)
    (throw (validation-error "Missing `databaseChangeLog` key."))))

(defn- change-set-ids
  "Returns all the change set ids given a change-log. IDs are always returned as strings."
  [change-log]
  (for [{{id :id} :changeSet} change-log
        :when id]
    (str id)))

(defn- require-distinct-change-set-ids [change-log]
  (let [ids (change-set-ids change-log)
        duplicates (->> ids
                        (group-by identity)
                        (keep (fn [[k v]]
                                (when (< 1 (count v))
                                  k))))]
    (when (seq duplicates)
      (throw (validation-error "Change set IDs are not distinct." {:duplicates duplicates})))))

(defn- directory-based-migration-file?
  "Returns true if the file is a directory-based migration file (e.g., `060/20260106_125531.yaml`)."
  [file]
  (boolean (re-matches #".*\d{3}/\d{8}_\d{6}\.yaml$" (str file))))

(defn- file-version
  "Extracts the migration version number from a file.
  For per-release files like `059_update_migrations.yaml`, parses from the filename.
  For directory-based files like `060/20260106_125531.yaml`, parses from the parent directory name."
  [^java.io.File file]
  (if (directory-based-migration-file? file)
    (parse-long (re-find #"\d+" (.getName (.getParentFile file))))
    (parse-long (re-find #"\d+" (.getName file)))))

(defn- changeset-version+id
  "Returns [version local-id] for a changeset.
  For per-release IDs like 'v49.00-032', parses from the ID itself.
  For directory-based files, uses the directory for version and filename (without .yaml) for local-id."
  [file changeset-id]
  (let [id-str (str changeset-id)]
    (if (directory-based-migration-file? file)
      [(file-version file)
       (str/replace (.getName ^java.io.File file) #"\.yaml$" "")]
      (when-let [[_ version local-id] (re-matches #"^v(\d+)\.(.+)$" id-str)]
        [(parse-long version) local-id]))))

(defn- changeset-at-or-after?
  "Returns true if the changeset (identified by file context and changeset ID) is at or after
  the given [threshold-version threshold-id]."
  [file changeset-id threshold-version threshold-id]
  (when-let [[v local-id] (changeset-version+id file changeset-id)]
    (or (> v threshold-version)
        (and (= v threshold-version)
             (not (neg? (compare local-id threshold-id)))))))

(defn- require-change-set-ids-in-order [change-log file]
  (when-not (directory-based-migration-file? file)
    (let [ids              (change-set-ids change-log)
          out-of-order-ids (->> ids
                                (partition 2 1)
                                (filter (fn [[id1 id2]]
                                          (pos? (compare id1 id2)))))]
      (when (seq out-of-order-ids)
        (throw (validation-error "Change set IDs are not in order"
                                 {:out-of-order-ids out-of-order-ids}))))))

(defn- require-change-set-ids-in-correct-file [change-log file]
  (let [fv  (file-version file)
        ids (change-set-ids change-log)
        dir-based? (directory-based-migration-file? file)
        wrong-file-ids
        (if dir-based?
          ;; For directory-based files, IDs don't encode version,
          ;; so there's nothing to cross-check against the file version.
          []
          (->> ids
               (filter (fn [id]
                         (let [id-version (parse-long (re-find #"\d+" id))]
                           (if (= fv 1)
                             (> id-version 55)
                             (not= fv id-version)))))))]
    (when (seq wrong-file-ids)
      (throw (validation-error "Change set IDs are in the wrong file"
                               {:wrong-file-ids wrong-file-ids})))))

(defn- check-change-use-types?
  "Return `true` if change use any type in `types`."
  [types change]
  {:pre [(set? types)]}
  (let [match-target-types? (fn [ttype]
                              (contains? types (str/lower-case ttype)))]
    (cond
     ;; a createTable or addColumn change; see if it adds a target-type col
      (or (:createTable change) (:addColumn change))
      (let [op (cond (:createTable change) :createTable (:addColumn change) :addColumn)]
        (some (fn [col-def]
                (match-target-types? (get-in col-def [:column :type] "")))
              (get-in change [op :columns])))

     ;; a modifyDataType change; see if it change a column to target-type
      (and (:modifyDataType change)
           (match-target-types? (get-in change [:modifyDataType :newDataType] "")))
      true)))

(defn- check-change-set-use-types?
  "Return true if `change-set` doesn't contain usage of any type in `types`."
  [target-types change-set]
  (some #(check-change-use-types? target-types %) (get-in change-set [:changeSet :changes])))

(defn- require-no-types-in-change-log!
  "Throws if any changeset at or after [version id] uses a type in target-types.
  When version and id are not provided, checks all changesets."
  ([target-types change-log]
   (require-no-types-in-change-log! target-types change-log nil nil nil))
  ([target-types change-log file version id]
   {:pre [(set? target-types)]}
   (when-let [using-types? (->> change-log
                                (filter (fn [change-set]
                                          (let [cs-id (get-in change-set [:changeSet :id])]
                                            (and cs-id
                                                 (if version
                                                   (changeset-at-or-after? file cs-id version id)
                                                   true)))))
                                (filter #(check-change-set-use-types? target-types %))
                                (map #(get-in % [:changeSet :id]))
                                seq)]
     (throw (validation-error
             #_:clj-kondo/ignore
             (format "Migration(s) [%s] uses invalid types (in %s)"
                     (str/join "," (map #(str "'" % "'") using-types?))
                     (str/join "," (map #(str "'" % "'") target-types)))
             {:invalid-ids using-types?
              :target-types target-types})))))

(defn- require-no-bare-blob-or-text-types
  "Ensures that no \"text\" or \"blob\" type columns are added in any changesets."
  [change-log]
  (require-no-types-in-change-log! #{"blob" "text"} change-log))

(defn- require-no-bare-boolean-types
  "Ensures that no \"boolean\" type columns are added in changesets at or after v49.00-032."
  [change-log file]
  (require-no-types-in-change-log! #{"boolean"} change-log file 49 "00-032"))

(defn- require-no-datetime-type
  "Ensures that no \"datetime\" or \"timestamp without time zone\" types are used at or after v49.00-000."
  [change-log file]
  (require-no-types-in-change-log!
   #{"datetime" "timestamp" "timestamp without time zone"}
   change-log file 49 "00-000"))

(defn- require-change-set-ids-match-file-format
  "Enforces that changeset IDs use the correct format for the file type:
  - Directory-based files (v60+): any string ID is allowed
  - 001_update_migrations.yaml: any string ID is allowed (legacy file)
  - Other per-release files: IDs must match the timestamp format"
  [change-log file]
  (when-not (or (directory-based-migration-file? file)
                (= (file-version file) 1))
    (let [ids     (change-set-ids change-log)
          bad-ids (remove #(re-matches change-set.strict/id-timestamp-format-re %) ids)]
      (when (seq bad-ids)
        (throw (validation-error
                (format "Per-release migration file contains non-timestamp ID formats: %s"
                        (str/join ", " bad-ids))
                {:invalid-ids (vec bad-ids)}))))))

(defn require-primary-key-exists-has-table-name
  "Ensures that all primaryKeyExists preconditions specify a tableName."
  [change-log]
  (doseq [{:keys [changeSet]} change-log
          :when changeSet
          :let [s (pr-str (:preConditions changeSet))]
          :when (and (str/includes? s ":primaryKeyExists")
                     (not (str/includes? s ":tableName")))]
    (throw (validation-error
            (format "Migration '%s' has primaryKeyExists precondition without tableName" (:id changeSet))
            {:id (:id changeSet)}))))

(s/def ::changeSet
  (s/spec :change-set.strict/change-set))

(defn- only-key [m]
  (let [keys (keys m)]
    (when-not (= 1 (count keys))
      (throw (validation-error "Expected exactly one key." {:keys keys})))
    (first keys)))

(defn- major-version
  "Returns major version from id string, e.g. 44 from \"v44.00-034\".
  For directory-based migrations (file path matches `NNN/`), extracts
  version from the file path. Otherwise parses from the id string."
  [id-str file]
  (if-let [[_ file-version] (when file (re-find #"(\d{3})[/\\]" (str file)))]
    (Integer/parseInt file-version)
    (when (string? id-str)
      (some-> (re-find #"\d+" id-str) Integer/parseInt))))

(def change-types-supporting-rollback
  "This set was generated with a little grep and awk from the docs here:
  https://docs.liquibase.com/workflows/liquibase-community/liquibase-auto-rollback.html

  If a new change type is introduced that supports automatic rollback, it should be added
  to this set."
  #{:addCheckConstraint
    :addColumn
    :addDefaultValue
    :addForeignKeyConstraint
    :addLookupTable
    :addNotNullConstraint
    :addPrimaryKey
    :addUniqueConstraint
    :createIndex
    :createSequence
    :createSynonym
    :createTable
    :createView
    :disableCheckConstraint
    :disableTrigger
    :dropNotNullConstraint
    :enableCheckConstraint
    :enableTrigger
    :renameColumn
    :renameSequence
    :renameTable
    :renameTrigger
    :renameView
    ;; assumes all custom changes use the `def-migration` or `define-reversible-migration` in
    ;; [[metabase.app-db.custom-migrations]]
    :customChange})

(defn- rollback-present-when-required?
  "Ensures rollback key is present when change type doesn't support auto rollback.
  `file` is used to extract version for directory-based migrations."
  [{:keys [id changes] :as change-set} file]
  (or
   (let [v (major-version (str id) file)]
     (and v (< v 45)))
   (some change-types-supporting-rollback (mapcat keys changes))
   (contains? change-set :rollback)))

(defn- validate-database-change-log [change-log file]
  (when (string? change-log)
    (throw (validation-error "Expected `:databaseChangeLog` to be a map, not a string.")))

  (require-distinct-change-set-ids change-log)
  (require-change-set-ids-in-correct-file change-log file)
  (require-change-set-ids-in-order change-log file)
  (require-change-set-ids-match-file-format change-log file)
  (require-no-bare-blob-or-text-types change-log)
  (require-no-bare-boolean-types change-log file)
  (require-no-datetime-type change-log file)
  (require-primary-key-exists-has-table-name change-log)
  (let [{:keys [changeSet]
         :as all} (group-by only-key change-log)]
    (when-not (set/subset? (set (keys all)) #{:property :objectQuotingStrategy :changeSet})
      (throw (validation-error "Expected exactly one of :property, :objectQuotingStrategy, or :changeSet."
                               {:keys (keys all)})))
    (doseq [{:keys [changeSet]} changeSet]
      (when-not (s/valid? ::changeSet changeSet)
        (throw (validation-error "Invalid change set." (s/explain-data ::changeSet changeSet))))
      (when-not (rollback-present-when-required? changeSet file)
        (throw (validation-error "Rollback is required but not present."
                                 {:id (:id changeSet)}))))))

(defn- validate-migrations [migrations file]
  (require-database-change-log! migrations)
  (validate-database-change-log (:databaseChangeLog migrations) file)
  :ok)

(defn- migration-files []
  #_{:clj-kondo/ignore [:unresolved-symbol :unused-binding :syntax]}
  (let [dir-str #?(:bb "resources/migrations" :clj "../../resources/migrations")
        dir (io/file dir-str)]
    (->> (file-seq dir)
         (filter (fn [^java.io.File f]
                   (and (.isFile f)
                        (or
                         ;; Per-release files: 059_update_migrations.yaml
                         (str/ends-with? (.getName f) "_update_migrations.yaml")
                         ;; Directory-based files: 060/20260106_125531.yaml
                         (directory-based-migration-file? f)))))
         (sort-by str))))

(defn- migrations [file]
  (assert (.exists file) (format "%s does not exist" file))
  (letfn [(fix-vals [x]
            ;; convert any lazy seqs to regular vectors and maps
            (cond (map? x) (update-vals x fix-vals)
                  (sequential? x) (mapv fix-vals x)
                  :else x))]
    (fix-vals (yaml/parse-string
               #_:clj-kondo/ignore (slurp file)))))

(defn- display-name
  "Returns a human-readable name for a migration file.
  For per-release files, returns just the filename.
  For directory-based files, returns `parent/filename`."
  [^java.io.File file]
  (if (directory-based-migration-file? file)
    (str (.getName (.getParentFile file)) "/" (.getName file))
    (.getName file)))

(defn- validate-all []
  (doseq [file (migration-files)]
    (println "Validating" (display-name file) "...")
    (try
      (validate-migrations (migrations file) file)
      (catch ExceptionInfo e
        (throw (ex-info (.getMessage e) (assoc (ex-data e) :file (display-name file)) e))))))

(defn -main
  "Entry point for Clojure CLI task `lint-migrations-file`. Run it with

    ./bin/lint-migrations-file.sh"
  []
  (println "Check Liquibase migrations files...")
  (try
    (validate-all)
    (println "Ok.")
    #_:clj-kondo/ignore
    (System/exit 0)
    (catch ExceptionInfo e
      (if (validation-error? e)
        (do
          (println)
          #_:clj-kondo/ignore
          (printf "Error in %s:\t%s\n" (:file (ex-data e)) (.getMessage e))
          #_:clj-kondo/ignore
          (printf "Details:\n\n %s" (with-out-str (pprint/pprint (dissoc (ex-data e) ::validation-error))))
          (println))
        (do
          (pprint/pprint (Throwable->map e))
          (println (.getMessage e))))
      #_:clj-kondo/ignore
      (System/exit 1))
    (catch #_:clj-kondo/ignore
     Throwable e
           (pprint/pprint (Throwable->map e))
           (println (.getMessage e))
           #_:clj-kondo/ignore
           (System/exit 1))))
