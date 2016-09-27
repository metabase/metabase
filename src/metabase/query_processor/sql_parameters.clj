(ns metabase.query-processor.sql-parameters
  "Param substitution for *SQL* drivers."
  (:require [clojure.string :as s]
            [honeysql.core :as hsql]
            [metabase.db :as db]
            [metabase.models.field :refer [Field], :as field]
            [metabase.query-processor.expand :as ql]
            [metabase.util :as u])
  (:import clojure.lang.Keyword
           honeysql.types.SqlCall
           metabase.models.field.FieldInstance))

;; TODO - we have dynamic *driver* variables like this in several places; it probably makes more sense to see if we can share one used somewhere else instead
(def ^:private ^:dynamic *driver* nil)

(def ^:private ^:dynamic *timezone* nil)

;;; ------------------------------------------------------------ String Substituion ------------------------------------------------------------

(defprotocol ^:private ISQLParamSubstituion
  (^:private ->sql ^String [this]))

(defrecord ^:private Dimension [^FieldInstance field, param])

(defrecord ^:private DateRange [start end])

(defrecord ^:private NumberValue [value])

(defn- dimension-value->sql [dimension-type value]
  (if (contains? #{"date/range" "date/month-year" "date/quarter-year"} dimension-type)
    (->sql (map->DateRange ((resolve 'metabase.query-processor.parameters/date->range) value *timezone*))) ; TODO - get timezone from query dict
    (str "= " (->sql value))))

(defn- honeysql->sql ^String [x]
  (first (hsql/format x
           :quoting ((resolve 'metabase.driver.generic-sql/quote-style) *driver*))))

(defn- format-oracle-date [s]
  (format "TO_TIMESTAMP('%s', 'yyyy-MM-dd')" (u/format-date "yyyy-MM-dd" (u/->Date s))))

(defn- oracle-driver? ^Boolean []
  (when-let [oracle-driver-class (u/ignore-exceptions (Class/forName "metabase.driver.oracle.OracleDriver"))]
    (instance? oracle-driver-class *driver*)))

(extend-protocol ISQLParamSubstituion
  nil         (->sql [_]    "NULL")
  Object      (->sql [this] (str this))
  Boolean     (->sql [this] (if this "TRUE" "FALSE"))
  NumberValue (->sql [this] (:value this))
  String      (->sql [this] (str \' (s/replace this #"'" "\\\\'") \')) ; quote single quotes inside the string
  Keyword     (->sql [this] (honeysql->sql this))
  SqlCall     (->sql [this] (honeysql->sql this))

  FieldInstance
  (->sql [this]
    (->sql (let [identifier (apply hsql/qualify (field/qualified-name-components this))]
             (if (re-find #"^date/" (:type this))
               ((resolve 'metabase.driver.generic-sql/date) *driver* :day identifier)
               identifier))))

  DateRange
  (->sql [{:keys [start end]}]
    ;; This is a dirty dirty HACK! Unfortuantely Oracle is super-dumb when it comes to automatically converting strings to dates
    ;; so we need to add the cast here
    ;; TODO - fix this when we move to support native params in non-SQL databases
    ;; Perhaps by making ->sql a multimethod that dispatches off of type and engine
    (if (oracle-driver?)
      (if (= start end)
        (format "= %s" (format-oracle-date start))
        (format "BETWEEN %s AND %s" (format-oracle-date start) (format-oracle-date end)))
      ;; Not the Oracle driver
      (if (= start end)
        (format "= '%s'" start)
        (format "BETWEEN '%s' AND '%s'" start end))))

  Dimension
  (->sql [{:keys [field param]}]
    (if-not param
      ;; if the param is `nil` just put in something that will always be true, such as `1` (e.g. `WHERE 1 = 1`)
      "1 = 1"
      (let [param-type (:type param)]
        (format "%s %s" (->sql (assoc field :type param-type)) (dimension-value->sql param-type (:value param)))))))


(defn- replace-param [s params match param]
  (let [k (keyword param)
        _ (assert (contains? params k)
            (format "Unable to substitute '%s': param not specified.\nFound: %s" param (keys params)))
        v (->sql (k params))]
    (s/replace-first s match v)))

(defn- handle-simple [s params]  (loop [s s, [[match param] & more] (re-seq #"\{\{\s*(\w+)\s*\}\}" s)]
    (if-not match
      s
      (recur (replace-param s params match param) more))))

(defn- handle-optional [s params]
  (try (handle-simple s params)
       (catch Throwable _
         "")))

(defn- substitute
  "Replace PARAMS in SQL string. See parameterized SQL guide for more details. (TODO - Add link once we have the guide)

     (substitute \"SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}\"
       {:toucans_are_cool true})
     ; -> \"SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE\""
  {:style/indent 1}
  ^String [sql params]
  {:pre [(string? sql) (seq sql) (u/maybe? map? params)]}
  (loop [s sql, [[match optional] & more] (re-seq #"\[\[([^\]]+)\]\]" sql)]
    (if-not match
      (s/trim (handle-simple s params))
      (let [s (s/replace-first s match (handle-optional optional params))]
        (recur s more)))))


;;; ------------------------------------------------------------ Param Resolution ------------------------------------------------------------

(defn- param-with-target [params target]
  (some (fn [param]
          (when (= (:target param) target)
            param))
        params))

(defn- param-value-for-tag [tag params]
  (when (not= (:type tag) "dimension")
    (:value (param-with-target params ["variable" ["template-tag" (:name tag)]]))))

(defn- dimension->field-id [dimension]
  (:field-id (ql/expand-ql-sexpr dimension)))

(defn- dimension-value-for-tag [tag params]
  (when-let [dimension (:dimension tag)]
    (let [field-id (or (dimension->field-id dimension)
                       (throw (Exception. (str "Don't know how to handle dimension: " dimension))))]
      (map->Dimension {:field (db/select-one [Field :name :parent_id :table_id], :id field-id)
                       :param (param-with-target params ["dimension" ["template-tag" (:name tag)]])}))))

(defn- default-value-for-tag [{:keys [default display_name required]}]
  (or default
      (when required
        (throw (Exception. (format "'%s' is a required param." display_name))))))

(defn- parse-value-for-type [param-type value]
  (cond
    (= param-type "number")                                (->NumberValue value)
    (and (= param-type "dimension")
         (= (get-in value [:param :type]) "number"))       (update-in value [:param :value] ->NumberValue)
    :else                                                  value))

(defn- value-for-tag
  "Given a map TAG (a value in the `:template_tags` dictionary) return the corresponding value from the PARAMS sequence.
   The VALUE is something that can be compiled to SQL via `->sql`."
  [tag params]
  {:pre [(map? tag) (u/maybe? sequential? params)]}
  (parse-value-for-type (:type tag) (or (param-value-for-tag tag params)
                                        (dimension-value-for-tag tag params)
                                        (default-value-for-tag tag))))

(defn- query->params-map [{{tags :template_tags} :native, params :parameters}]
  (into {} (for [[k tag] tags
                 :let    [v (value-for-tag tag params)]
                 :when   v]
             ;; TODO - if V is `nil` *on purpose* this still won't give us a query like `WHERE field = NULL`. That kind of query shouldn't be possible from the frontend anyway
             {k v})))


;;; ------------------------------------------------------------ Public API ------------------------------------------------------------

(defn expand-params
  "Expand parameters inside a *native* QUERY."
  [query]
  (binding [*driver*   (:driver query)
            *timezone* (get-in query [:settings :report-timezone])]
    (update-in query [:native :query] (u/rpartial substitute (query->params-map query)))))
