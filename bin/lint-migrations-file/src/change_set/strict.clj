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

(s/def ::change-set
  (s/merge
   :change-set.common/change-set
   (s/keys :req-un [::changes ::comment])))
