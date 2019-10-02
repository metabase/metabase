(ns metabase.query-processor.error-type
  "A hierarchy of all QP error types. Ideally all QP exceptions should be `ex-data` maps with an `:type` key whose value
  is one of the types here. If you see an Exception in QP code that doesn't return an `:type`, add it!")

(def ^:private hierarchy
  (-> (make-hierarchy)
      ;; errors deriving from `:client-error` are the equivalent of HTTP 4xx client status codes
      (derive :client-error :error)
      (derive :invalid-query :client-error)
      ;; errors deriving from `:unexpected-server-error` are the equivalent of HTTP 5xx status codes
      (derive :unexpected-server-error :error)
      (derive :unexpected-qp-error :unexpected-server-error)
      (derive :unexpected-db-error :unexpected-server-error)))

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

;;;; ### Server-Side Errors

(deferror server
  "Generic ancestor type for all unexpected server-side errors. Equivalent of a HTTP 5xx status code."
  :parent :error)

(defn server-error?
  "Is `error-type` a server error type, the equivalent of an HTTP 5xx status code?"
  [error-type]
  (isa? hierarchy error-type :server))

;;;; #### QP Errors

(deferror qp
  "Generic ancestor type for all unexpected errors (e.g., uncaught Exceptions) in QP code."
  :parent server)

;;;; #### Data Warehouse (DB) Errors

(deferror db
  "Generic ancestor type for all unexpected errors returned or thrown by a data warehouse when running a query."
  :parent server)
