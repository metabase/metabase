(ns metabase.test.util
  "Helper functions and macros for writing unit tests."
  (:require [expectations :refer :all]
            [metabase.util :as u]))

(declare $->prop)

;; ## Response Deserialization

(defn- deserialize-date [date]
  (some->> (u/parse-iso8601 date)
           .getTime
           java.sql.Timestamp.))

(defn deserialize-dates
  "Deserialize date strings with KEYS returned in RESPONSE.
   Supports plain keywords or vector keysequences like `update-in`.

    (deserialize-dates response :updated_at [:user :last_login])

  DEPRECATED: You should probably just use auto-deserialize-dates instead (!)"
  [response & [k & ks]]
  {:pre [(map? response)
         (or (keyword? k)
             (vector? k))]}
  (let [response (cond
                   (vector? k) (update-in response k deserialize-date)
                   (keyword? k) (update-in response [k] deserialize-date))]
    (if (empty? ks) response
        (apply deserialize-dates response ks))))

(def auto-deserialize-dates-keys
  #{:created_at :updated_at :last_login :date_joined})

(defn auto-deserialize-dates
  "Like deserialize-dates, but automatically recurses over RESPONSE and looks for keys that are known to correspond to dates,
   and automatically deserializes them."
  [response]
  (cond (vector? response) (mapv auto-deserialize-dates response)
        (map? response) (->> response
                             (map (fn [[k v]]
                                    {k (if (contains? auto-deserialize-dates-keys k)
                                         (deserialize-date v)
                                         (auto-deserialize-dates v))}))
                             (reduce merge {}))
        :else response))


;; ## match-$

(defmacro match-$
  "Walk over map DEST-OBJECT and replace values of the form `$` or `$key` as follows:

    {k $} -> {k (k SOURCE-OBJECT)}
    {k $symb} -> {k (:symb SOURCE-OBJECT)}

  ex.

    (match-$ m {:a $, :b 3, :c $b}) -> {:a (:a m), b 3, :c (:b m)}"
  [source-obj dest-object]
  {:pre [(map? dest-object)]}
  (let [source## (gensym)
        dest-object (->> dest-object
                         (map (fn [[k v]]
                                {k (if (= v '$) `(~k ~source##)
                                       v)}))
                         (reduce merge {}))]
    `(let [~source## ~source-obj]
       ~(clojure.walk/prewalk (partial $->prop source##)
                              dest-object))))

(defn- $->prop
  "If FORM is a symbol starting with a `$`, convert it to the form `(form-keyword SOURCE-OBJ)`.

    ($->prop my-obj 'fish)  -> 'fish
    ($->prop my-obj '$fish) -> '(:fish my-obj)"
  [source-obj form]
  (or (when (symbol? form)
        (let [[first-char & rest-chars] (name form)]
          (when (and (= first-char \$)
                     (not (empty? rest-chars))) ; don't match just `$`
            (let [kw (->> rest-chars
                          (apply str)
                          keyword)]
              `(~kw ~source-obj)))))
      form))


;; ## expect-eval-actual-first
;; By default `expect` evaluates EXPECTED first. This isn't always what we want; for example, sometime API tests affect the DB
;; and we'd like to check the results.

(defmacro -doexpect [e a]
  `(let [a# (try ~a (catch java.lang.Throwable t# t#))
         e# (try ~e (catch java.lang.Throwable t# t#))]
     (report
      (try (compare-expr e# a# '~e '~a)
           (catch java.lang.Throwable e2#
             (compare-expr e2# a# '~e '~a))))))

(defmacro expect-eval-actual-first
  "Identical to `expect` but evaluates `actual` first (instead of evaluating `expected` first)."
  [expected actual]
  (let [fn-name (gensym)]
    `(def ~(vary-meta fn-name assoc :expectation true)
       (fn [] (-doexpect ~expected ~actual)))))

;; ## random-name
(defn random-name
  "Generate a random string of 20 uppercase letters."
  []
  (->> (repeatedly 20 #(-> (rand-int 26) (+ (int \A)) char))
       (apply str)))
