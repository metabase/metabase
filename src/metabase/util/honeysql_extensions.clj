(ns metabase.util.honeysql-extensions
  (:refer-clojure :exclude [+ - / * mod inc dec cast concat format])
  (:require [clojure.string :as s]
            (honeysql [core :as hsql]
                      [format :as hformat]
                      helpers))
  (:import honeysql.format.ToSql))

(alter-meta! #'honeysql.core/format assoc :style/indent 1)
(alter-meta! #'honeysql.core/call   assoc :style/indent 1)

;; for some reason the metadata on these helper functions is wrong which causes Eastwood to fail, see
;; https://github.com/jkk/honeysql/issues/123
(alter-meta! #'honeysql.helpers/merge-left-join assoc
             :arglists '([m & clauses])
             :style/indent 1)


;; Add an `:h2` quote style that uppercases the identifier
(let [quote-fns     @(resolve 'honeysql.format/quote-fns)
      ansi-quote-fn (:ansi quote-fns)]
  (intern 'honeysql.format 'quote-fns
          (assoc quote-fns :h2 (comp s/upper-case ansi-quote-fn))))


;; `:crate` quote style that correctly quotes nested column identifiers
(defn- str-insert
  "Insert C in string S at index I."
  [s c i]
  (str c (subs s 0 i) c (subs s i)))

(defn- crate-column-identifier
  [^CharSequence s]
  (let [idx (s/index-of s "[")]
    (if (nil? idx)
      (str \" s \")
      (str-insert s "\"" idx))))

(let [quote-fns @(resolve 'honeysql.format/quote-fns)]
  (intern 'honeysql.format 'quote-fns
          (assoc quote-fns :crate crate-column-identifier)))


;; register the `extract` function with HoneySQL
;; (hsql/format (hsql/call :extract :a :b)) -> "extract(a from b)"
(defmethod hformat/fn-handler "extract" [_ unit expr]
  (str "extract(" (name unit) " from " (hformat/to-sql expr) ")"))

;; register the function "distinct-count" with HoneySQL
;; (hsql/format :%distinct-count.x) -> "count(distinct x)"
(defmethod hformat/fn-handler "distinct-count" [_ field]
  (str "count(distinct " (hformat/to-sql field) ")"))


;; HoneySQL 0.7.0+ parameterizes numbers to fix issues with NaN and infinity -- see
;; https://github.com/jkk/honeysql/pull/122. However, this broke some of Metabase's behavior, specifically queries
;; with calculated columns with numeric literals -- some SQL databases can't recognize that a calculated field in a
;; SELECT clause and a GROUP BY clause is the same thing if the calculation involves parameters. Go ahead an use the
;; old behavior so we can keep our HoneySQL dependency up to date.
(extend-protocol honeysql.format/ToSql
  java.lang.Number
  (to-sql [x] (str x)))

;; HoneySQL automatically assumes that dots within keywords are used to separate schema / table / field / etc. To
;; handle weird situations where people actually put dots *within* a single identifier we'll replace those dots with
;; lozenges, let HoneySQL do its thing, then switch them back at the last second
;;
;; TODO - Maybe instead of this lozengey hackiness it would make more sense just to add a new "identifier" record type
;; that implements `ToSql` in a more intelligent way
(defn escape-dots
  "Replace dots in a string with WHITE MEDIUM LOZENGES (⬨)."
  ^String [s]
  (s/replace (name s) #"\." "⬨"))

(defn qualify-and-escape-dots
  "Combine several NAME-COMPONENTS into a single Keyword, and escape dots in each name by replacing them with WHITE
  MEDIUM LOZENGES (⬨).

     (qualify-and-escape-dots :ab.c :d) -> :ab⬨c.d"
  ^clojure.lang.Keyword [& name-components]
  (apply hsql/qualify (for [s name-components
                            :when s]
                        (escape-dots s))))

(defn unescape-dots
  "Unescape lozenge-escaped names in a final SQL string (or vector including params).
   Use this to undo escaping done by `qualify-and-escape-dots` after HoneySQL compiles a statement to SQL."
  ^String [sql-string-or-vector]
  (when sql-string-or-vector
    (if (string? sql-string-or-vector)
      (s/replace sql-string-or-vector #"⬨" ".")
      (vec (cons (unescape-dots (first sql-string-or-vector))
                 (rest sql-string-or-vector))))))


;; Single-quoted string literal
(defrecord Literal [literal]
  :load-ns true
  ToSql
  (to-sql [_]
    (str \' (name literal) \')))

(defn literal
  "Wrap keyword or string S in single quotes and a HoneySQL `raw` form."
  [s]
  (Literal. s))


(def ^{:arglists '([& exprs])}  +  "Math operator. Interpose `+` between EXPRS and wrap in parentheses." (partial hsql/call :+))
(def ^{:arglists '([& exprs])}  -  "Math operator. Interpose `-` between EXPRS and wrap in parentheses." (partial hsql/call :-))
(def ^{:arglists '([& exprs])}  /  "Math operator. Interpose `/` between EXPRS and wrap in parentheses." (partial hsql/call :/))
(def ^{:arglists '([& exprs])}  *  "Math operator. Interpose `*` between EXPRS and wrap in parentheses." (partial hsql/call :*))
(def ^{:arglists '([& exprs])} mod "Math operator. Interpose `%` between EXPRS and wrap in parentheses." (partial hsql/call :%))

(defn inc "Add 1 to X."        [x] (+ x 1))
(defn dec "Subtract 1 from X." [x] (- x 1))


(defn cast
  "Generate a statement like `cast(x AS c)`."
  [c x]
  (hsql/call :cast x (hsql/raw (name c))))

(defn quoted-cast
  "Generate a statement like `cast(x AS \"c\")`.

   Like `cast` but quotes the type C. This is useful for cases where we deal with user-defined types or other types
   that may have a space in the name, for example Postgres enum types."
  [c x]
  (hsql/call :cast x (keyword c)))

(defn format
  "SQL `format` function."
  [format-str expr]
  (hsql/call :format expr (literal format-str)))

(defn round
  "SQL `round` function."
  [x decimal-places]
  (hsql/call :round x decimal-places))

(defn ->date                     "CAST X to a `date`."                     [x] (cast :date x))
(defn ->datetime                 "CAST X to a `datetime`."                 [x] (cast :datetime x))
(defn ->timestamp                "CAST X to a `timestamp`."                [x] (cast :timestamp x))
(defn ->timestamp-with-time-zone "CAST X to a `timestamp with time zone`." [x] (cast "timestamp with time zone" x))
(defn ->integer                  "CAST X to a `integer`."                  [x] (cast :integer x))
(defn ->time                     "CAST X to a `time` datatype"             [x] (cast :time x))
(defn ->boolean                  "CAST X to a `boolean` datatype"          [x] (cast :boolean x))

;;; Random SQL fns. Not all DBs support all these!
(def ^{:arglists '([& exprs])} floor   "SQL `floor` function."  (partial hsql/call :floor))
(def ^{:arglists '([& exprs])} hour    "SQL `hour` function."   (partial hsql/call :hour))
(def ^{:arglists '([& exprs])} minute  "SQL `minute` function." (partial hsql/call :minute))
(def ^{:arglists '([& exprs])} week    "SQL `week` function."   (partial hsql/call :week))
(def ^{:arglists '([& exprs])} month   "SQL `month` function."  (partial hsql/call :month))
(def ^{:arglists '([& exprs])} quarter "SQL `quarter` function."(partial hsql/call :quarter))
(def ^{:arglists '([& exprs])} year    "SQL `year` function."   (partial hsql/call :year))
(def ^{:arglists '([& exprs])} concat  "SQL `concat` function." (partial hsql/call :concat))
