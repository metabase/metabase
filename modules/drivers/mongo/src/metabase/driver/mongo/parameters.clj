(ns metabase.driver.mongo.parameters
  (:require [clojure
             [string :as str]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [metabase.driver.common.parameters :as params]
            [metabase.driver.common.parameters
             [parse :as parse]
             [values :as values]]
            [metabase.query-processor.error-type :as error-type]
            [metabase.util :as u]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [tru]]])
  (:import java.time.temporal.Temporal
           metabase.driver.common.parameters.Date))

(defn- param-value->str [x]
  (condp instance? x
    ;; Date = the Parameters Date type, not an actual Temporal type
    Date     (->str (u.date/parse (:s x)))
    ;; convert temporal types to ISODate("2019-12-09T...") (etc.)
    Temporal (format "ISODate(\"%s\")" (u.date/format x))
    ;; for everything else, splice it in as its string representation
    (pr-str x)))

(defn- substitute-param [param->value [acc missing] in-optional? {:keys [k]}]
  (if-not (contains? param->value k)
    [acc (conj missing k)]
    (let [v (get param->value k)]
      (when (params/FieldFilter? v)
        (throw (ex-info (tru "Field filter parameters are not currently supported for MongoDB native queries.")
                 {:type error-type/invalid-query})))
      (if (= params/no-value v)
        [acc (conj missing k)]
        [(conj acc (param-value->str v)) missing]))))

(declare substitute*)

(defn- substitute-optional [param->value [acc missing] {subclauses :args}]
  (let [[opt-acc opt-missing] (substitute* param->value subclauses true)]
    (if (seq opt-missing)
      [acc missing]
      [(into acc opt-acc) missing])))

(defn- substitute*
  "Returns a sequence of `[[replaced...] missing-parameters]`."
  [param->value xs in-optional?]
  (reduce
   (fn [[acc missing] x]
     (cond
       (string? x)
       [(conj acc x) missing]

       (params/Param? x)
       (substitute-param param->value [acc missing] in-optional? x)

       (params/Optional? x)
       (substitute-optional param->value [acc missing] x)

       :else
       (throw (ex-info (tru "Don''t know how to substitute {0} {1}" (.getName (class x)) (pr-str x))
                {:type error-type/driver}))))
   [[] nil]
   xs))

(defn- substitute [param->value xs]
  (let [[replaced missing] (substitute* param->value xs false)]
    (when (seq missing)
      (throw (ex-info (tru "Cannot run query: missing required parameters: {0}" (set missing))
               {:type error-type/invalid-query})))
    (when (seq replaced)
      (str/join replaced))))

(defn- parse-and-substitute [param->value x]
  (if-not (string? x)
    x
    (u/prog1 (substitute param->value (parse/parse x))
      (when-not (= x <>)
        (log/debug (tru "Substituted {0} -> {1}" (pr-str x) (pr-str <>)))))))

(defn substitute-native-parameters
  "Implementation of `driver/substitue-native-parameters` for MongoDB."
  [driver inner-query]
  (let [param->value (values/query->params-map inner-query)]
    (update inner-query :query (partial walk/postwalk (partial parse-and-substitute param->value)))))
