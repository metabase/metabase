(ns change-set.strict
  (:require change-set.common
            change.strict
            [clojure.spec.alpha :as s]
            [clojure.string :as str]))

(comment change-set.common/keep-me
         change.strict/keep-me)

;; comment is required for strict change set spec
(s/def ::comment
  (s/and
   string?
   (partial re-find #"Added [\d.x]+")))

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

(def change-types-requiring-rollback
  ;; this list was generated with a little grep and awk from the docs here:
  ;; https://docs.liquibase.com/workflows/liquibase-community/liquibase-auto-rollback.html
  #{:addAutoIncrement
    :alterSequence
    :createFunction
    :createPackage
    :createPackageBody
    :createProcedure
    :createTrigger
    :customChange
    :delete
    :dropAllForeignKeyConstraints
    :dropCheckConstraint
    :dropColumn
    :dropDefaultValue
    :dropForeignKeyConstraint
    :dropFunction
    :dropIndexNot
    :dropPackage
    :dropPackageBody
    :dropPrimaryKey
    :dropProcedure
    :dropSequence
    :dropSynonym
    :dropTable
    :dropTrigger
    :dropUniqueConstraint
    :dropView
    :empty
    :executeCommand
    :insert
    :loadData
    :loadUpdateData
    :markUnused
    :mergeColumns
    :modifyDataType
    :output
    :setColumnRemarks
    :setTableRemarks
    :sql
    :sqlFile
    :stop
    :update})

(defn major-version
  "Returns major version from id string, e.g. 44 from \"v44.00-034\""
  [id-str]
  (when (string? id-str)
    (some-> (re-find #"\d+" id-str) Integer/parseInt)))

(defn rollback-present-when-required?
  "Ensures rollback key is present when change type doesn't support auto rollback"
  [{:keys [id changes] :as change-set}]
  (or
   (int? id)
   (< (major-version id) 45)
   (not (some change-types-requiring-rollback (mapcat keys changes)))
   (contains? change-set :rollback)))

(s/def ::change-set
  (s/and
   rollback-present-when-required?
   (s/merge
    :change-set.common/change-set
    (s/keys :req-un [::changes ::comment]))))
