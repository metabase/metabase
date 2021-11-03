(ns change-set.common
  (:require [clojure.spec.alpha :as s]
            [clojure.string :as str]))

(defn id-in-range?
  "Migration should be 1-382 (inclusive; legacy pre-42 migration numbering scheme) or >= 4200000 (42+ major-minor-id
  scheme). See PR #18821 for more info."
  [id]
  (or (<= 1 id 382)
      ;; check that the id is less than 9900000 to make sure someone didn't accidentally put an extra zero in there.
      (<= 4200000 id 9900000)))

(s/def ::id
  (s/or
   :int (s/and int? id-in-range?)
   :int-string (s/and
                string?
                (fn [^String s]
                  (try
                    (let [id (Integer/parseInt s)]
                      (id-in-range? id))
                    (catch Throwable _
                      false))))))

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
