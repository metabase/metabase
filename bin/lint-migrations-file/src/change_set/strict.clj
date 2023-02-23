(ns change-set.strict
  (:require
   [change-set.common]
   [change.strict]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]))

(comment change-set.common/keep-me
         change.strict/keep-me)

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
    (s/+ :change.strict/dbms-qualified-sql-change)
    (fn [changes]
      (apply distinct? (mapcat #(str/split (-> % :sql :dbms) #",")
                               changes))))))

(def change-types-supporting-rollback
  ;; This set was generated with a little grep and awk from the docs here:
  ;; https://docs.liquibase.com/workflows/liquibase-community/liquibase-auto-rollback.html
  ;;
  ;; If a new change type is introduced that supports automatic rollback, it should be added
  ;; to this set.
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

(defn- disallow-delete-cascade-with-add-column
  "Returns false if addColumn changeSet uses deleteCascade. See Metabase issue #14321"
  [{:keys [changes]}]
  (let [[change-type {:keys [columns]}] (ffirst changes)]
    (if (= :addColumn change-type)
      (not-any? #(-> % :column :constraints :deleteCascade) columns)
      true)))

(s/def ::change-set
  (s/and
   rollback-present-when-required?
   disallow-delete-cascade-with-add-column
   (s/merge
    :change-set.common/change-set
    (s/keys :req-un [::changes ::comment]))))
