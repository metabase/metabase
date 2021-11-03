(ns change-set.common
  (:require [clojure.spec.alpha :as s]
            [clojure.string :as str]))

;; See PR #18821 for more info on the new migration ID format adopted in 0.42.0+

(defn- ->int [id]
  (if (string? id)
    (Integer/parseUnsignedInt id)
    id))

(defn legacy-id? [id]
  (<= 1 (->int id) 382))

(defn enough-zeroes? [id]
  (>= (->int id) 4200000))

(defn not-too-many-zeroes?
  "Check that the id is less than 9900000 to make sure someone didn't accidentally put an extra zero in there."
  [id]
  (< (->int id) 9900000))

(s/def ::id-in-range
  (s/or :legacy    legacy-id?
        :new-style (s/and (complement legacy-id?)
                          enough-zeroes?
                          not-too-many-zeroes?)))

(s/def ::id
  (s/or
   :int        (s/and int? pos? ::id-in-range)
   :int-string (s/and string? ::id-in-range)))

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
