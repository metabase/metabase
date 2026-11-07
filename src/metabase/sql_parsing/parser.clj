(ns metabase.sql-parsing.parser
  "Hands callers the [[metabase.sql-parsing.protocol/SqlParser]] implementation for a backend: GraalPy, the Java port
  of sqlglot, or a shadow backend that answers with one and compares the other in the background. Each
  implementation is loaded on first use."
  (:require
   [metabase.sql-parsing.settings :as sql-parsing.settings]
   [metabase.sql-parsing.shadow :as shadow]))

(set! *warn-on-reflection* true)

(defn- base-parser
  "The SqlParser for a backend that is not a shadow backend."
  [backend]
  (case backend
    :sqlglot      ((requiring-resolve 'metabase.sql-parsing.graal/parser))
    :sqlglot-java ((requiring-resolve 'metabase.sql-parsing.sqlglot-java/parser))
    (throw (ex-info (str "Unknown SQL parser backend; choose :sqlglot (GraalPy), :sqlglot-java, :sqlglot-shadow or"
                         " :sqlglot-java-shadow.")
                    {:backend backend}))))

(def ^:private shadow-backends
  "Each shadow backend, as the backend that answers and the backend compared with it in the background."
  {:sqlglot-shadow      [:sqlglot :sqlglot-java]
   :sqlglot-java-shadow [:sqlglot-java :sqlglot]})

(defn- sample?
  [_method]
  (< (rand) (sql-parsing.settings/sql-parsing-shadow-sample-rate)))

(def ^:private shadow-parsers
  "One parser per shadow backend for the life of the process: each owns the thread pool its comparisons run on."
  (update-vals shadow-backends
               (fn [[primary-backend shadow-backend]]
                 (delay (shadow/parser {:primary-backend primary-backend
                                        :primary         (base-parser primary-backend)
                                        :shadow-backend  shadow-backend
                                        :shadow          (base-parser shadow-backend)
                                        :sample?         sample?})))))

(defn parser
  "The SqlParser for `backend`: `:sqlglot` runs sqlglot on GraalPy, `:sqlglot-java` runs the Java port.
  `:sqlglot-shadow` answers with GraalPy and compares the Java port in the background, and `:sqlglot-java-shadow`
  does the reverse."
  [backend]
  (if-let [shadow-parser (shadow-parsers backend)]
    @shadow-parser
    (base-parser backend)))
