(ns dev.security-lint.rules.disclosure
  "Internal state handed back to the caller in an error."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.vocabulary :as vocab]))

(set! *warn-on-reflection* true)

(defrule error-data-discloses-query
  {:name        "Exception data carries a query, SQL or object definition"
   :enabled     false
   :description (str "`api-exception-response` merges an exception's ex-data into the HTTP response body. An "
                     "`ex-info` whose data holds the query, the compiled SQL or the object being checked hands "
                     "that to the caller -- including the caller whose permission check just failed, who then "
                     "reads the definition of the object they were refused.")
   :remediation (str "Put identifiers in ex-data, not definitions: the card id rather than its query. Keep the "
                     "query in a log line if a human needs it.")
   ;; A query is reported only for a throw that is an HTTP error by construction -- it carries `:status-code` --
   ;; and that a request can reach. Every other `ex-info` with a query in it is somebody's diagnostic, and the
   ;; query processor and Lib have 83 of them; whether one reaches a caller depends on what catches it, and
   ;; reporting them all as notes reported nothing anyone acted on. A credential row is reported wherever the
   ;; throw is caught: a log line, a task-history row and a response body all carry the details.
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-209"
   :triggers    #{clojure.core/ex-info}}
  [{:keys [node endpoint-reachable?] :as ctx}]
  (let [data    (ast/arg node 1)
        ;; a literal value discloses nothing that was not already in the source
        entries (remove (fn [[k v]] (or (not (ast/keyword-node? k)) (ast/literal? v))) (ast/map-entries data))
        queries (for [[k _] entries :when (contains? vocab/disclosing-ex-data-keys (ast/->str k))] (ast/->str k))
        ;; a whole row of a credential-bearing model under any key
        rows    (for [[k v] entries
                      :let  [v (ast/unmeta v)]
                      :when (and (ast/symbol-node? v) (vocab/credential-row? (ast/->str v) (taint/origins ctx v)))]
                  (ast/->str k))
        ;; a credential row is a disclosure wherever the throw is caught; a query is one at a caller
        hits    (concat rows (when (and endpoint-reachable? (ast/map-get data :status-code)) queries))]
    (when (seq hits)
      {:message (str "ex-data returned to the caller carries " (str/join ", " (distinct hits)))})))

(defrule throwable-map-outside-sanitizer
  {:name        "Exception turned into data outside the response sanitizer"
   :description (str "`Throwable->map` yields the exception's ex-data and every cause's ex-data in the chain. "
                     "Metabase keeps two kinds of thing in ex-data -- server-side context (the query, the compiled "
                     "SQL, the permissions required and held, the object being checked) and the API response "
                     "contract (`:errors`, `:specific-errors`, `:error-code`) -- and a map built here cannot tell them "
                     "apart, so whatever it goes into carries the context to the caller: the definition of the very "
                     "object a permission check just refused, as in SEC-1173 and SEC-1210. Every fix that dropped one "
                     "key at one sink reopened at the next key.")
   :remediation (str "Route through `metabase.api.response/throwable->response-map`, which keeps the contract keys "
                     "and drops the rest; put anything a human needs in a log line.")
   ;; A pure pattern, so it grades on its own: the invariant is that exception-to-data happens in exactly one
   ;; namespace. Today the tree has four callers -- the API exception middleware, the streaming response's
   ;; `format-exception`, the QP's `catch-exceptions` and task-history -- and the first three are the disclosing
   ;; sinks SEC-1173's fix routes through the sanitizer; when that lands the sanitizer is the one caller left.
   :severity    :error
   :precision   :high
   :cwe         "CWE-209"
   ;; the sanitizer itself, and the task-history row: a throwable JSON-serialized into storage that admins read
   ;; back on purpose, never a response body
   :exempt-files [#"(^|/)src/metabase/api/response\.clj$"
                  #"(^|/)src/metabase/task_history/models/task_history\.clj$"]
   :triggers    #{clojure.core/Throwable->map}}
  [_]
  {:message (str "Throwable->map carries every ex-data in the cause chain to whatever this map becomes -- use "
                 "metabase.api.response/throwable->response-map")})
