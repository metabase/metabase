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
   :description (str "`api-exception-response` merges an exception's ex-data into the HTTP response body. An "
                     "`ex-info` whose data holds the query, the compiled SQL or the object being checked hands "
                     "that to the caller -- including the caller whose permission check just failed. A 403 "
                     "denying access to a card has returned the card's native SQL three times over.")
   :remediation (str "Put identifiers in ex-data, not definitions: the card id rather than its query. Keep the "
                     "query in a log line if a human needs it.")
   ;; Reported only for a throw that is an HTTP error by construction -- it carries `:status-code` -- and that a
   ;; request can reach. Every other `ex-info` with a query in it is somebody's diagnostic, and the query
   ;; processor and Lib have 83 of them; whether one reaches a caller depends on what catches it, and reporting
   ;; them all as notes reported nothing anyone acted on.
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
        hits    (concat rows (when endpoint-reachable? queries))]
    (when (and (seq hits) (ast/map-get data :status-code))
      {:message (str "ex-data returned to the caller carries " (str/join ", " (distinct hits)))})))
