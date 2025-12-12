(ns metabase.driver.sql.normalize
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.util :as u]))

(defmulti normalize-unquoted-name
  "Normalize an unquoted table/column name according to the database's rules."
  {:added "0.57.0", :arglists '([driver name-str])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod normalize-unquoted-name :sql
  [_ name-str]
  (u/lower-case-en name-str))

(defn normalize-name
  "Normalizes the (primarily table/column) name passed in.
  Should return a value that matches the name listed in the appdb."
  [driver name-str]
  (let [quote-style (sql.qp/quote-style driver)
        quote-char (if (= quote-style :mysql) \` \")]
    (if (and (= (first name-str) quote-char)
             (= (last name-str) quote-char))
      (let [quote-quote (str quote-char quote-char)
            quote (str quote-char)]
        (-> name-str
            (subs 1 (dec (count name-str)))
            (str/replace quote-quote quote)))
      (normalize-unquoted-name driver name-str))))

(defmulti reserved-literal
  "Checks whether a particular name is actually a literal value in a given sql dialect.

  For example, true and false are usually booleans, not normal names."
  {:added "0.57.0", :arglists '([driver name])}
  (fn [driver name]
    [(driver/dispatch-on-initialized-driver driver) name])
  :hierarchy #'driver/hierarchy)

(defmethod reserved-literal :default
  [_driver _name]
  nil)

(defmethod reserved-literal [:sql "true"]
  [_driver _name]
  {:value true})

(defmethod reserved-literal [:sql "false"]
  [_driver _name]
  {:value false})
