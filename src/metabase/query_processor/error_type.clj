(ns metabase.query-processor.error-type
  "A hierarchy of all QP error types. Ideally all QP exceptions should be `ex-data` maps with an `:type` key whose value
  is one of the types here. If you see an Exception in QP code that doesn't return an `:type`, add it!

    (throw (ex-info (tru \"Don''t know how to parse {0} {1}\" (class x) x)
                    {:type qp.error-type/invalid-parameter}))")

(def ^:private hierarchy
  (make-hierarchy))

(defn known-error-types
  "Set of all known QP error types."
  []
  (descendants hierarchy :error))

(defn known-error-type?
  "Is `error-type` a known QP error type (i.e., one defined with `deferror` above)?"
  [error-type]
  (isa? hierarchy error-type :error))

(defn show-in-embeds?
  "Should errors of this type be shown to users of Metabase in embedded Cards or Dashboards? Normally, we return a
  generic 'Query Failed' error message for embedded queries, so as not to leak information. Some errors (like missing
  parameter errors), however, should be shown even in these situations."
  [error-type]
  (isa? hierarchy error-type :show-in-embeds?))

(defmacro ^:private deferror
  {:style/indent 1}
  [error-name docstring & {:keys [parent show-in-embeds?]}]
  {:pre [(some? parent)]}
  `(do
     (def ~error-name ~docstring ~(keyword error-name))
     (alter-var-root #'hierarchy derive ~(keyword error-name) ~(keyword parent))
     ~(when show-in-embeds?
        `(alter-var-root #'hierarchy derive ~(keyword error-name) :show-in-embeds?))))

;;;; ### Client Errors

(deferror client
  "Generic ancestor type for all errors with the query map itself. Equivalent of a HTTP 4xx status code."
  :parent :error)

(defn client-error?
  "Is `error-type` a client error type, the equivalent of an HTTP 4xx status code?"
  [error-type]
  (isa? hierarchy error-type :client))

(deferror missing-required-permissions
  "The current user does not have required permissions to run the current query."
  :parent client)

(deferror invalid-query
  "Generic ancestor type for errors with the query map itself."
  :parent client)

(deferror missing-required-parameter
  "The query is parameterized, and a required parameter was not supplied."
  :parent invalid-query
  :show-in-embeds? true)

(deferror invalid-parameter
  "The query is parameterized, and a supplied parameter has an invalid value."
  :parent invalid-query
  :show-in-embeds? true)

(deferror unsupported-feature
  "The query is using a feature that is not supported by the database/driver."
  :parent invalid-query
  :show-in-embeds? true)

;;;; ### Server-Side Errors

(deferror server
  "Generic ancestor type for all unexpected server-side errors. Equivalent of a HTTP 5xx status code."
  :parent :error)

(defn server-error?
  "Is `error-type` a server error type, the equivalent of an HTTP 5xx status code?"
  [error-type]
  (isa? hierarchy error-type :server))

(deferror timed-out
  "Error type if query fails to return the first row of results after some timeout."
  :parent server
  :show-in-embeds? true)

;;;; #### QP Errors

(deferror qp
  "Generic ancestor type for all unexpected errors (e.g., uncaught Exceptions) in Query Processor code."
  :parent server)

(deferror driver
  "Generic ancestor type for all errors related to bad drivers and uncaught Exceptions in driver code."
  :parent qp)

;;;; #### Data Warehouse (DB) Errors

(deferror db
  "Generic ancestor type for all unexpected errors returned or thrown by a data warehouse when running a query."
  :parent server)
