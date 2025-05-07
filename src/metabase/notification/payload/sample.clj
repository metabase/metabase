(ns metabase.notification.payload.sample
  (:refer-clojure :exclude [rand-nth])
  (:require
   [clojure.string :as str]
   [metabase.types :as types]
   [metabase.util.random :as u.random]
   [metabase.util.time :as u.time]))

(set! *warn-on-reflection* true)

(defn rand-nth
  "Reimplementation of [[clojure.core/rand-nth]] using [[*generator*]]."
  [coll]
  (nth coll (rand-int (count coll))))

(defn- gen-int []
  (rand-int 1000000))

(defn- gen-string
  ([]
   (u.random/random-name))
  ([symbols max-len]
   (apply str (repeatedly (inc (rand-int max-len)) #(rand-nth symbols)))))

(defn- gen-time []
  (u.time/local-time (rand-int 24) (rand-int 60) (rand-int 60)))

(defn- gen-date []
  ;; Random day of the year, from 2000-01-01 through 2037-12-31.
  ;; Avoids 2038 because of the 32-bit timestamp overflow.
  ;; TODO: Always adds 0-364 days, so it can't return Dec 31st of a leap year. I don't think it matters, but I will
  ;; highlight it.
  (u.time/add (u.time/local-date (+ 2000 (rand-int 38)) 1 1) ;; Jan 1, from 2000 through 2037
              :day
              (rand-int 365)))

(defn- gen-datetime []
  (u.time/local-date-time (gen-date) (gen-time)))

(defn- gen-latitude []
  ;; +/- 75 degrees is a generous but plausible range for latitudes.
  (* 150 (- (rand) 0.5)))

#_(defn- gen-longitude []
  ;; +/- 180 degrees
    (- (* 360 (rand)) 180))

(defn- gen-category []
  (rand-nth ["Electronics" "Clothing" "Food" "Books" "Sports" "Home" "Beauty" "Toys"]))

(defn- gen-ip-address []
  (str (rand-int 256) "." (rand-int 256) "." (rand-int 256) "." (rand-int 256)))

(defn- gen-url []
  (let [domains ["example.com" "metabase.com" "github.com" "google.com"]
        paths ["/docs" "/api" "/users" "/products" "/search"]
        protocols ["http" "https"]]
    (str (rand-nth protocols) "://" (rand-nth domains) (rand-nth paths))))

(defn- gen-email []
  (let [domains ["gmail.com" "example.com" "metabase.com"]
        names ["john" "jane" "bob" "alice" "user"]]
    (str (rand-nth names) (rand-int 1000) "@" (rand-nth domains))))

(defn- gen-currency []
  (* (rand) 10000))

(defn- gen-percentage []
  (* (rand) 100))

(defn- gen-share []
  (rand))

(defn- gen-quantity []
  (rand-int 1000))

(defn- gen-score []
  (rand-int 100))

(defn- gen-duration []
  (rand-int 86400)) ; seconds in a day

(defn- gen-structured []
  {:id         (rand-int 1000)
   :name       (gen-string)
   :created_at (gen-datetime)
   :metadata   {:tags ["sample" "test" "data"]
                :version "1.0"}})

(defn- gen-enum []
  (rand-nth ["ACTIVE" "INACTIVE" "PENDING" "COMPLETED" "FAILED"]))

(defn- gen-location []
  (rand-nth ["New York" "London" "Tokyo" "Paris" "Berlin"]))

(defn- gen-description []
  (let [sentences ["This is a sample description."
                   "It contains multiple sentences."
                   "Each sentence provides additional context."
                   "The description helps understand the data better."]
        num-sentences (inc (rand-int 3))]
    (str/join " " (take num-sentences (shuffle sentences)))))

(defn- gen-comment []
  (let [templates ["Great work on %s!"
                   "I have a question about %s."
                   "This %s needs more attention."
                   "The %s looks good."]
        subjects ["the implementation" "this feature" "the design" "the code"]]
    (format (rand-nth templates) (rand-nth subjects))))

(defn sample-field
  "Given a field, sample a value based on its type."
  [{:keys [semantic_type] :as field}]
  (let [semantic-type-is #(isa? % semantic_type)
        gen-by-base-type (fn []
                           (cond
                             (types/field-is-type? :type/Text field)     (gen-string)
                             (types/field-is-type? :type/TextLike field) (gen-string)
                             (types/field-is-type? :type/Number field)   (gen-int)
                             (types/field-is-type? :type/Integer field)  (gen-int)
                             (types/field-is-type? :type/Float field)    (* (rand) 1000)
                             (types/field-is-type? :type/Decimal field)  (* (rand) 1000)
                             (types/field-is-type? :type/DateTime field) (gen-datetime)
                             (types/field-is-type? :type/Date field)     (gen-date)
                             (types/field-is-type? :type/Time field)     (gen-time)
                             (types/field-is-type? :type/Boolean field)  (rand-nth [true false])
                             :else nil))]
    (if-not semantic_type
      (gen-by-base-type)
      (cond
        ;; Text-based types
        (semantic-type-is :type/IPAddress)   (gen-ip-address)
        (semantic-type-is :type/URL)         (gen-url)
        (semantic-type-is :type/Category)    (gen-category)
        (semantic-type-is :type/Structured)  (gen-structured)
        (semantic-type-is :type/Email)       (gen-email)
        (semantic-type-is :type/Description) (gen-description)
        (semantic-type-is :type/Comment)     (gen-comment)
        (semantic-type-is :type/Enum)        (gen-enum)

        ;; Numeric types
        (semantic-type-is :type/Currency)   (gen-currency)
        (semantic-type-is :type/Quantity)   (gen-quantity)
        (semantic-type-is :type/Percentage) (gen-percentage)
        (semantic-type-is :type/Share)      (gen-share)
        (semantic-type-is :type/Score)      (gen-score)
        (semantic-type-is :type/Duration)   (gen-duration)
        (semantic-type-is :type/Latitude)   (gen-latitude)
        (semantic-type-is :type/Location)   (gen-location)

        ;; Temporal types
        (semantic-type-is :type/DeletionTemporal)    (gen-datetime)
        (semantic-type-is :type/Birthdate)           (gen-date)
        (semantic-type-is :type/CreationTemporal)    (gen-datetime)
        (semantic-type-is :type/CancelationTemporal) (gen-datetime)
        (semantic-type-is :type/UpdatedTemporal)     (gen-datetime)
        (semantic-type-is :type/JoinTemporal)        (gen-datetime)
        :else                                        (gen-by-base-type)))))
