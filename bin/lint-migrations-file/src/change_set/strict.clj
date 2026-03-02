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

;; Basic type check only — format enforcement is file-aware and happens in
;; `lint-migrations-file/require-change-set-ids-match-file-format`.
(s/def ::id (s/or :string-id string? :int-id int?))

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
   disallow-delete-cascade-with-add-column
   (s/keys :req-un [::id ::author ::changes ::comment]
           :opt-un [::preConditions])))
