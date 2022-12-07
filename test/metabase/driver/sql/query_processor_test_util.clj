(ns metabase.driver.sql.query-processor-test-util
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [honeysql.format :as hformat]
            [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.query-processor :as qp]
            [metabase.util :as u]))

;; [[install-pretty-formatters!]] -- tweaks the actual methods HoneySQL uses to generate SQL strings to add indentation

(defonce ^:private ^clojure.lang.MultiFn orig-format-clause hformat/format-clause)

(defn remove-pretty-formatters!
  "Remove the pretty formatters installed by [[install-pretty-formatters!]]."
  []
  (alter-var-root #'hformat/format-clause (constantly orig-format-clause)))

(defmulti ^:private pretty-format
  "Special version of [[hformat/format-clause]] that indents and pretty-prints the resulting form."
  {:arglists '([clause sql-map])}
  (.dispatchFn orig-format-clause))

(defn install-pretty-formatters!
  "Install code so HoneySQL will pretty-print the SQL it generates."
  []
  (alter-var-root #'hformat/format-clause (constantly pretty-format)))

(defn- pretty-formatters-installed?
  "Whether pretty formatters were installed by [[install-pretty-formatters!]] or not."
  []
  (identical? hformat/format-clause pretty-format))

(defn do-with-pretty-formatters
  "Impl for [[with-pretty-formatters]]."
  [thunk]
  (if (pretty-formatters-installed?)
    (thunk)
    (try
      (install-pretty-formatters!)
      (thunk)
      (finally
        (remove-pretty-formatters!)))))

(defmacro with-pretty-formatters
  "Execute body with the pretty formatters from [[install-pretty-formatters!]] temporarily installed (if they are not
  already installed)."
  [& body]
  `(do-with-pretty-formatters (fn [] ~@body)))

(def ^:private ^:dynamic *indent* 0)

(defn- indent [] (str/join (repeat (* *indent* 2) \space)))

(defn- newline-and-indent []
  (str \newline (indent)))

(def ^:private ^:dynamic *indent-comma-join* true)

(defn- indent-comma-join [strs]
  (if *indent-comma-join*
    (str (newline-and-indent)
         (str/join (str "," (newline-and-indent))
                   strs))
    (str/join ", " strs)))

(defmethod pretty-format :default
  [clause sql-map]
  (str
   (newline-and-indent)
   (binding [*indent*            (inc *indent*)
             *indent-comma-join* true]
     (let [to-sql hformat/to-sql]
       (with-redefs [hformat/comma-join indent-comma-join
                     hformat/to-sql     (fn [form]
                                          (binding [*indent-comma-join* false]
                                            (to-sql form)))]
         (orig-format-clause clause sql-map))))))


;;;; [[query->sql-map]] and [[sql->sql-map]] -- these parse an actual SQL map into a pseudo-HoneySQL form

(defn pretty-sql
  "Remove quotes around identifiers (where possible) and remove `public.` qualifiers."
  [s]
  (if-not (string? s)
    s
    (-> s
        (str/replace #"\"([\w\d_-]+)\"" "$1")
        (str/replace #"PUBLIC\." "")
        (str/replace #"public\." ""))))

(defn even-prettier-sql
  "Do [[pretty-sql]] transformations, and remove excess whitespace and *all* quote marks."
  [s]
  (-> s
      pretty-sql
      (str/replace #"`" "")
      (str/replace #"\s+" " ")
      (str/replace #"\(\s*" "(")
      (str/replace #"\s*\)" ")")
      (str/replace #"'" "\"")
      str/trim))

(defn- symbols [s]
  (binding [*read-eval* false]
    (read-string (str \( s \)))))

;; This is not meant to be a complete list. Just the ones we want to show up on their own lines with [[sql->sql-map]]
;; and [[query->sql-map]] below. It's only for test purposes anyway so we can add more stuff here if we need it.
(def ^:private sql-keywords-that-should-get-newlines
  '#{[LEFT JOIN]
     [RIGHT JOIN]
     [INNER JOIN]
     [OUTER JOIN]
     [FULL JOIN]
     [GROUP BY]
     [ORDER BY]
     SELECT
     FROM
     LIMIT
     WHERE
     OFFSET
     HAVING})

(defn- sql-map
  "Convert a sequence of SQL symbols into something sorta like a HoneySQL map. The main purpose of this is to make tests
  somewhat possible to debug. The goal isn't to actually be HoneySQL, but rather to make diffing huge maps easy."
  [symbols]
  (if-not (sequential? symbols)
    symbols
    (loop [m {}, current-key nil, [x & [y :as more]] symbols]
      (cond
        ;; two-word "keywords"
        (sql-keywords-that-should-get-newlines [x y])
        (let [x-y (keyword (str/lower-case (format "%s-%s" (name x) (name y))))]
          (recur m x-y (rest more)))

        ;; one-word keywords
        (sql-keywords-that-should-get-newlines x)
        (let [x (keyword (str/lower-case x))]
          (recur m x more))

        ;; if we stumble upon a nested sequence that starts with SQL keyword(s) then recursively transform that into a
        ;; map (e.g. for things like subselects)
        (and (sequential? x)
             (or (sql-keywords-that-should-get-newlines (take 2 x))
                 (sql-keywords-that-should-get-newlines (first x))))
        (recur m current-key (cons (sql-map x) more))

        :else
        (let [m (update m current-key #(conj (vec %) x))]
          (if more
            (recur m current-key more)
            m))))))

(defn sql->sql-map
  "Convert a `sql` string into a HoneySQL-esque map for easy diffing."
  [sql]
  (-> sql even-prettier-sql symbols sql-map))

(defn- query->raw-native-query
  "Compile an MBQL query to a raw native query."
  ([{database-id :database, :as query}]
   (query->raw-native-query (or driver/*driver*
                                (driver.u/database->driver database-id))
                            query))

  ([_driver query]
   (qp/compile query)))

(def ^{:arglists '([query] [driver query])} query->sql
  "Compile an MBQL query to 'pretty' SQL (i.e., remove quote marks and `public.` qualifiers)."
  (comp pretty-sql :query query->raw-native-query))

(def ^{:arglists '([query] [driver query])} query->sql-map
  "Compile MBQL query to SQL and parse it as a HoneySQL-esque map."
  (comp sql->sql-map query->sql))


;;;; [[testing]] context tooling

(defn pprint-native-query-with-best-strategy
  "Attempt to compile `query` to a native query, and pretty-print it if possible."
  [query]
  (with-pretty-formatters
    (u/ignore-exceptions
      (let [{native :query, :as query} (query->raw-native-query query)]
        (str "\nNative Query =\n"
             (if (string? native)
               native
               (u/pprint-to-str native))
             \newline
             \newline
             (u/pprint-to-str (dissoc query :query))
             \newline)))))

(defn do-with-native-query-testing-context
  [query thunk]
  ;; building the pretty-printing string is actually a little bit on the expensive side so only do the work needed if
  ;; someone actually looks at the [[testing]] context (i.e. if the test fails)
  (testing (let [to-str (delay (pprint-native-query-with-best-strategy query))]
             (reify
               java.lang.Object
               (toString [_]
                 @to-str)))
    (thunk)))

(defmacro with-native-query-testing-context
  "Compile `query` to a native query (and pretty-print it if it is SQL) and add it as [[testing]] context around
  `body`."
  [query & body]
  `(do-with-native-query-testing-context ~query (fn [] ~@body)))
