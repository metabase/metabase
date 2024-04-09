(ns metabase.driver.sql.query-processor-test-util
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test.data.env :as tx.env]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

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
     WITH
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
        (let [x-y (keyword (u/lower-case-en (format "%s-%s" (name x) (name y))))]
          (recur m x-y (rest more)))

        ;; one-word keywords
        (sql-keywords-that-should-get-newlines x)
        (let [x (keyword (u/lower-case-en x))]
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
   (qp.compile/compile query)))

(def ^{:arglists '([query] [driver query])} query->sql
  "Compile an MBQL query to 'pretty' SQL (i.e., remove quote marks and `public.` qualifiers)."
  (comp pretty-sql :query query->raw-native-query))

(def ^{:arglists '([query] [driver query])} query->sql-map
  "Compile MBQL query to SQL and parse it as a HoneySQL-esque map."
  (comp sql->sql-map query->sql))


;;;; [[testing]] context tooling

(defn pprint-native-query-with-best-strategy
  "Attempt to compile `query` to a native query, and pretty-print it if possible."
  ([query]
   (pprint-native-query-with-best-strategy (or driver/*driver* :h2) query))

  ([driver query]
   (u/ignore-exceptions
     (let [{native :query, :as query} (query->raw-native-query query)]
       (str "\nNative Query =\n"
            (cond
              (and (string? native)
                   (isa? driver/hierarchy driver :sql))
              (driver/prettify-native-form driver native)

              (string? native)
              native

              :else
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

(defn sql-drivers
  "All the drivers in the :sql hierarchy."
  []
  (set
    (for [driver (tx.env/test-drivers)
          :when  (isa? driver/hierarchy (driver/the-driver driver) (driver/the-driver :sql))]
      (tx/the-driver-with-test-extensions driver))))
