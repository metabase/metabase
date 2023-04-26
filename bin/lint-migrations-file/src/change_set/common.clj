(ns change-set.common
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

;; See PR #18821 for more info on the new migration ID format adopted in 0.42.0+

(s/def ::legacy-id
  ;; some legacy IDs are integers and some are strings. so handle either case.
  (s/or
   :int    int?
   :string (s/and string?
                  #(re-matches #"^\d+$" %)
                  #(<= 1 (Integer/parseUnsignedInt ^String %) 382))))

(s/def ::new-style-id
  (s/and string?
         #(re-matches #"^v\d{2,}\.\d{2}-\d{3}$" %)))

(s/def ::id
  (s/or
   :legacy-id    ::legacy-id
   :new-style-id ::new-style-id))

(s/def ::author string?)

(s/def ::preConditions
  (s/coll-of ::pre-condition))

(s/def ::pre-condition
  ;; don't use `dbms` preconditions, put them in `changeSet` instead; see
  ;; https://github.com/liquibase/liquibase/issues/1459#issuecomment-725451371
  (every-pred map? (complement :dbms)))

(s/def ::dbms
  (s/and
   string?
   (fn [s]
     (let [dbs (into #{} (map str/trim) (str/split s #","))]
       (and (seq dbs)
            (every? #{"h2" "mysql" "mariadb" "postgresql"} dbs))))))

(s/def ::change-set
  (s/keys :req-un [::id ::author]
          :opt-un [::dbms ::preConditions]))
