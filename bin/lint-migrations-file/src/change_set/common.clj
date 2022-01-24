(ns change-set.common
  (:require [clojure.spec.alpha :as s]
            [clojure.string :as str]))

;; See PR #18821 for more info on the new migration ID format adopted in 0.42.0+

(s/def ::legacy-id
  ;; some legacy IDs are integers and some are strings. so handle either case.
  (s/or
   :int    int?
   :string (s/and string?
                  #(re-matches #"^\d+$" %)
                  #(<= 1 (Integer/parseUnsignedInt %) 382))))

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
  (s/keys :opt-un [::dbms]))

(s/def ::dbms
  (s/keys :req-un [::type]))

(s/def ::type (s/and string? ::valid-dbs))

(s/def ::valid-dbs
  (fn [s]
    (let [dbs (into #{} (map str/trim) (str/split s #","))]
      (and (seq dbs)
           (every? #{"h2" "mysql" "mariadb" "postgresql"} dbs)))))

(s/def ::change-set
  (s/keys :req-un [::id ::author]
          :opt-un [::preConditions]))
