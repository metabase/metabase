(ns change-set.strict
  (:require
   [change.strict]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(comment change.strict/keep-me)

(s/def ::id (s/and string?
                   #(re-matches #"^v\d{2,}\.\d{2}-\d{3}$" %)))

(s/def ::author string?)

(s/def ::preCondition
  (s/keys :opt-un [::dbms]))

(s/def ::preConditions
  (s/coll-of ::preCondition))

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
   (s/keys :req-un [::id ::author ::changes ::comment]
           :opt-un [::preConditions])))
