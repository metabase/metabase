(ns change-set.strict
  (:require
   [change.strict]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(comment change.strict/keep-me)

(def id-timestamp-format-re
  "Timestamp is of format `yyyy-MM-dd'T'HH:mm:ss`.
  E.g: v49.2023-12-14T08:54:54"
  #"^v\d{2,}\.(\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])T([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9])$")

(def id-number-format-re
  "E.g: v49.00-008
  This format should no longer be used for new migrations, use `id-timestamp-format-re` instead."
  #"^v\d{2,}\.\d{2}-\d{3}$")

(s/def ::id (s/and string?
                   (s/or
                    ;; new ids should conform this format
                    :id-with-timestamp ;; e.g: v49.2023-12-14T08:54:54
                    (s/and #(re-matches id-timestamp-format-re %))
                    :id-with-old-verion-format ;; e.g: v49.00-008
                    (s/and #(re-matches id-number-format-re %)
                           ;; the cut off id for this old format is v49.00-060
                           ;; see #36787 for context
                           #(neg? (compare % "v49.00-061"))))))

(s/def ::author string?)

(s/def ::preCondition
  (s/keys :opt-un [::dbms]))

(s/def ::preConditions
  (s/nilable (s/coll-of ::preCondition)))

(s/def ::dbms
  (s/keys :req-un [::type]))

(s/def ::type (s/and string? ::valid-dbs))

(s/def ::valid-dbs
  (fn [s]
    (let [dbs (into #{} (map str/trim) (str/split s #","))]
      (and (seq dbs)
           (every? #{"h2" "mysql" "mariadb" "postgresql"} dbs)))))

;; comment is required for strict change set spec
(s/def ::comment
  string?)

(s/def ::changes
  (s/or
   ;; only one change allowed per change set for the strict schema.
   :one-change
   (s/alt :change :change.strict/change)

   ;; unless it's SQL changes, in which case we'll let you specify more than one as long as they are qualified with
   ;; different DBMSes
   :sql-changes-for-different-
   (s/and
    (s/+ (s/alt :sql-change :change.strict/dbms-qualified-sql-change
                :sqlFile-change :change.strict/dbms-qualified-sqlFile-change))
    (fn [changes]
      (apply distinct?
             (mapcat (fn [change]
                       (let [dbms-val (or (-> change val :sql :dbms)
                                          (-> change val :sqlFile :dbms))]
                         (if dbms-val
                           (str/split dbms-val #",")
                           []))) ; provide an empty list if dbms-val is nil
                     changes))))))

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
    ;; metabase.db.custom-migrations
    :customChange})

(defn- major-version
  "Returns major version from id string, e.g. 44 from \"v44.00-034\""
  [id-str]
  (when (string? id-str)
    (some-> (re-find #"\d+" id-str) Integer/parseInt)))

(defn- rollback-present-when-required?
  "Ensures rollback key is present when change type doesn't support auto rollback"
  [{:keys [id changes] :as change-set}]
  (or
   (int? id)
   (< (major-version id) 45)
   (some change-types-supporting-rollback (mapcat keys changes))
   (contains? change-set :rollback)))

(def ^:private change-types-requiring-preconditions
  #{:createTable
    :dropTable
    :addColumn
    :dropColumn
    :createIndex
    :dropIndex
    :addForeignKeyConstraint
    :dropForeignKeyConstraint})

(defn- precondition-present-when-required?
  "Ensures that certain changeSet types include a preCondition. The intent is for the preCondition to ensure that the changeSet is
  idempotent by checking whether the table/column/index/etc does not exist before trying to create it. (Or inversely, that it does
  exist before trying to drop it.)

  We don't currently assert on the structure of the preCondition to provide flexibility if there are cases where idempotence is not
  desired."
  [{:keys [id changes] :as change-set}]
  (or
   (int? id)
   (< (major-version id) 51)
   (not-any? change-types-requiring-preconditions (mapcat keys changes))
   (contains? change-set :preConditions)))

(defn- disallow-delete-cascade-with-add-column
  "Returns false if addColumn changeSet uses deleteCascade. See Metabase issue #14321"
  [{:keys [changes]}]
  (let [[change-type {:keys [columns]}] (ffirst changes)]
    (or (not= :addColumn change-type)
        (not-any? (fn [c]
                    (let [constraint (-> c :column :constraints)]
                      (and (:deleteCascade constraint)
                           (not (:deleteCascadeForce constraint)))))
                  columns))))

(s/def ::change-set
  (s/and
   rollback-present-when-required?
   precondition-present-when-required?
   disallow-delete-cascade-with-add-column
   (s/keys :req-un [::id ::author ::changes ::comment]
           :opt-un [::preConditions])))
