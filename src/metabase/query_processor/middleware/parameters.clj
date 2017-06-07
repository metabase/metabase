(ns metabase.query-processor.middleware.parameters
  "Middleware for substituting parameters in queries."
  (:require [clojure.data :as data]
            [clojure.tools.logging :as log]
            [metabase.query-processor.interface :as i]
            [metabase.query-processor.middleware.parameters
             [mbql :as mbql-params]
             [sql :as sql-params]]
            [metabase.util :as u]))

(defn- expand-parameters
  "Expand any :parameters set on the QUERY-DICT and apply them to the query definition.
   This function removes the :parameters attribute from the QUERY-DICT as part of its execution."
  [{:keys [parameters], :as query-dict}]
  ;; params in native queries are currently only supported for SQL drivers
  (if (= :query (keyword (:type query-dict)))
    (mbql-params/expand (dissoc query-dict :parameters) parameters)
    (sql-params/expand query-dict)))

(defn- substitute-parameters*
  "If any parameters were supplied then substitute them into the query."
  [query]
  (u/prog1 (expand-parameters query)
    (when (and (not i/*disable-qp-logging*)
               (not= <> query))
      (when-let [diff (second (data/diff query <>))]
        (log/debug (u/format-color 'cyan "\n\nPARAMS/SUBSTITUTED: %s\n%s" (u/emoji "😻") (u/pprint-to-str diff)))))))

(defn substitute-parameters
  "Substitute Dashboard or Card-supplied parameters in a query, replacing the param placeholers
   with appropriate values and/or modifiying the query as appropriate.

   (e.g. a SQL query with a param like `{{param}}` will have that part of the query replaced with an appropriate
   snippet as well as any prepared statement args needed.)"
  [qp]
  (comp qp substitute-parameters*))
