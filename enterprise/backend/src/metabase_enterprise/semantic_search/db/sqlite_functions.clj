(ns metabase-enterprise.semantic-search.db.sqlite-functions
  "Defining SQLite scalar functions in Clojure over sqlite-jdbc's `org.sqlite.Function`. Its argument and result
  accessors are protected, and a Clojure proxy can't reach protected members, so they're called through accessible
  `Method` handles instead."
  (:import
   (java.lang.reflect Method)
   (java.sql Connection)
   (org.sqlite Function)))

(set! *warn-on-reflection* true)

(defn- function-method ^Method [method-name & param-types]
  (doto (.getDeclaredMethod Function method-name (into-array Class param-types))
    (.setAccessible true)))

(def ^:private ^Method m-args         (function-method "args"))
(def ^:private ^Method m-value-type   (function-method "value_type" Integer/TYPE))
(def ^:private ^Method m-value-blob   (function-method "value_blob" Integer/TYPE))
(def ^:private ^Method m-value-text   (function-method "value_text" Integer/TYPE))
(def ^:private ^Method m-value-double (function-method "value_double" Integer/TYPE))
(def ^:private ^Method m-value-long   (function-method "value_long" Integer/TYPE))
(def ^:private ^Method m-result-null  (function-method "result"))
(def ^:private ^Method m-result-text  (function-method "result" String))
(def ^:private ^Method m-result-long  (function-method "result" Long/TYPE))
(def ^:private ^Method m-result-dbl   (function-method "result" Double/TYPE))

;; sqlite3 fundamental datatype codes, as returned by value_type
(def ^:private sqlite-integer 1)
(def ^:private sqlite-float 2)
(def ^:private sqlite-blob 4)
(def ^:private sqlite-null 5)

(defn- invoke [^Method m ^Function f & args]
  (.invoke m f (object-array args)))

(defn arg-count
  "Number of arguments of the current call."
  ^long [f]
  (long (invoke m-args f)))

(defn arg-value
  "Argument `i` of the current call as a Clojure value: nil, Long, Double, String or byte array."
  [f i]
  (let [t (long (invoke m-value-type f (int i)))]
    (cond
      (= t sqlite-null)    nil
      (= t sqlite-integer) (invoke m-value-long f (int i))
      (= t sqlite-float)   (invoke m-value-double f (int i))
      (= t sqlite-blob)    (invoke m-value-blob f (int i))
      :else                (invoke m-value-text f (int i)))))

(defn args
  "All arguments of the current call, see [[arg-value]]."
  [f]
  (mapv #(arg-value f %) (range (arg-count f))))

(defn result!
  "Set the current call's result to the Clojure value `v`: nil → NULL, integers → INTEGER, other numbers → REAL,
  anything else → its string."
  [f v]
  (cond
    (nil? v)     (invoke m-result-null f)
    (integer? v) (invoke m-result-long f (long v))
    (number? v)  (invoke m-result-dbl f (double v))
    :else        (invoke m-result-text f (str v))))

(defn sql-function
  "An `org.sqlite.Function` whose result is `(f & args)` over the call's arguments (see [[arg-value]])."
  ^Function [f]
  (proxy [Function] []
    (xFunc []
      (result! this (apply f (args this))))))

(defn register!
  "Register `(sql-function f)` as `fn-name` on `conn` (a raw sqlite-jdbc connection, not a wrapper)."
  [^Connection conn ^String fn-name f]
  (Function/create conn fn-name (sql-function f)))
