(ns metabase.query-processor.sql-parameters
  ;; TODO - is it more appropriate to name this namespace something like `native-parameters` ?
  (:require [clojure.string :as s]
            [honeysql.core :as hsql]
            [metabase.db :as db]
            [metabase.models.field :refer [Field], :as field]
            [metabase.query-processor.expand :as ql]
            [metabase.util :as u])
  (:import metabase.models.field.FieldInstance))

;; TODO - we have dynamic *driver* variables like this in several places; it probably makes more sense to see if we can share one used somewhere else instead
(def ^:private ^:dynamic *driver* nil)

;;; ------------------------------------------------------------ String Substituion ------------------------------------------------------------

(defprotocol ^:private ISQLParamSubstituion
  (^:private ->sql ^String [this]))

(extend-protocol ISQLParamSubstituion
  nil           (->sql [_] "NULL")
  Object        (->sql [this]
                  (str this))
  Boolean       (->sql [this]
                  (if this "TRUE" "FALSE"))
  String        (->sql [this]
                  (str \' (s/replace this #"'" "\\\\'") \'))
  FieldInstance (->sql [this]
                  ;; For SQL drivers, generate appropriate qualified & quoted identifier
                  ;; Mative param substitution is only enabled for SQL for the time being. We'll need to tweak this a bit so when we add support for other DBs in the future.
                  (first (hsql/format (apply hsql/qualify (field/qualified-name-components this))
                           :quoting ((resolve 'metabase.driver.generic-sql/quote-style) *driver*)))))

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


;;; ------------------------------------------------------------ Param Resolution ------------------------------------------------------------

(defn- param-value-for-tag [tag params]
  (when (not= (:type tag) "dimension")
    (some (fn [param]
            (when (= (:target param) ["variable" ["template-tag" (:name tag)]])
              (:value param)))
          params)))

(defn- dimension->field-id [dimension]
  (:field-id (ql/expand-ql-sexpr dimension)))

(defn- dimension-value-for-tag [tag]
  (when-let [dimension (:dimension tag)]
    (if-let [field-id (dimension->field-id dimension)]
      (db/select-one [Field :name :parent_id :table_id], :id field-id)
      (throw (Exception. (str "Don't know how to handle dimension: " dimension))))))

(defn- default-value-for-tag [{:keys [default display_name required]}]
  (or default
      (when required
        (throw (Exception. (format "'%s' is a required param." display_name))))))

(defn- parse-value-for-type [type value]
  value
  ;; TODO - do we ever need to do anything special for one of the types?
  #_(case (keyword type)
    :number    value
    :text      value
    :date      value
    :dimension value))

(defn- value-for-tag [tag params]
  (parse-value-for-type (:type tag) (or (param-value-for-tag tag params)
                                        (dimension-value-for-tag tag)
                                        (default-value-for-tag tag))))

(defn- query->params-map [{tags :template_tags, params :parameters}]
  (into {} (for [[k tag] tags
                 :let    [v (value-for-tag tag params)]
                 :when   v]
             ;; TODO - if V is `nil` *on purpose* this still won't give us a query like `WHERE field = NULL`. That kind of query shouldn't be possible from the frontend anyway
             {k v})))


;;; ------------------------------------------------------------ Public API ------------------------------------------------------------

(defn expand-params
  "Expand parameters inside a *native* QUERY."
  [query]
  (binding [*driver* (:driver query)]
    (update-in query [:native :query] (u/rpartial substitute (query->params-map query)))))
