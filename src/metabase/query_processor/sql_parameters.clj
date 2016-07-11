(ns metabase.query-processor.sql-parameters
  (:require [clojure.string :as s]
            [metabase.util :as u]))

(defprotocol ^:private ISQLParamSubstituion
  (^:private ->sql ^String [this]))

(extend-protocol ISQLParamSubstituion
  nil     (->sql [_] "NULL")
  Object  (->sql [this]
            (str this))
  Boolean (->sql [this]
            (if this "TRUE" "FALSE"))
  String  (->sql [this]
            (str \' (s/replace this #"'" "\\\\'") \')))

(defn- replace-param [s params match param]
  (let [k (keyword param)
        _ (assert (contains? params k)
            (format "Unable to substitute '%s': param not specified." param))
        v (->sql (k params))]
    (s/replace-first s match v)))

(defn- handle-simple [s params]
  (loop [s s, [[match param] & more] (re-seq #"\{\{\s*(\w+)\s*\}\}" s)]
    (if-not match
      s
      (recur (replace-param s params match param) more))))

(defn- handle-optional [s params]
  (try (handle-simple s params)
       (catch Throwable _
         "")))

(defn substitute
  "Replace PARAMS in SQL string. See parameterized SQL guide for more details. (TODO - Add link once we have the guide)

     (substitute \"SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}\"
       {:toucans_are_cool true})
     ; -> \"SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE\""
  {:style/indent 1}
  ^String [sql params]
  (loop [s sql, [[match optional] & more] (re-seq #"\[\[([^\]]+)\]\]" sql)]
    (if-not match
      (s/trim (handle-simple s params))
      (let [s (s/replace-first s match (handle-optional optional params))]
        (recur s more)))))
