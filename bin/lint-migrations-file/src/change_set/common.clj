(ns change-set.common
  (:require [clojure.spec.alpha :as s]
            [clojure.string :as str]))

(s/def ::id
  (s/or
   :int int?
   :int-string (s/and
                string?
                (fn [^String s]
                  (try
                    (Integer/parseInt s)
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
