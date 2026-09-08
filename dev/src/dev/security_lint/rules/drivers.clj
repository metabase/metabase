(ns dev.security-lint.rules.drivers
  "Invariants across driver implementations.

  A defence added to one driver has repeatedly failed to reach its siblings: the JDBC property denylist covered
  two of nine drivers at one point. These rules ask each implementation the question the first fix answered."
  (:require
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(defn- driver-method-name
  "The name of the `metabase.driver` multimethod a `defmethod` form implements, or nil for any other
  multimethod: `channel/can-connect?` is a different question about a different thing."
  [node ns]
  (let [s (some-> (ast/arg node 0) ast/unmeta n/sexpr)]
    (when (and (symbol? s)
               (or (= "driver" (namespace s))
                   (and (nil? (namespace s)) (= 'metabase.driver ns))))
      (name s))))

(defn- dispatch-value
  "The dispatch value of a `defmethod` form, as written."
  [node]
  (some-> (ast/arg node 1) ast/unmeta ast/->str))

(defn- mentions?
  "Whether any symbol in the form's body has `nm` as its name."
  [node nm]
  (boolean (some #(= nm (name (n/sexpr %)))
                 (ast/find-nodes ast/symbol-node? node))))

(defn- delegates-to-parent?
  "`((get-method driver/x :sql-jdbc) driver details)` or `next-method`: the parent implementation runs too."
  [node]
  (or (mentions? node "get-method") (mentions? node "next-method")))

(defn- checks-additional-options?
  "Whether the override itself does what the parent does: matches `:additional-options` against a denylist.
  MySQL, H2 and SQLite each carry their own list rather than the shared one, which is the check by another
  route, not the check skipped."
  [node]
  (boolean (some #(= ":additional-options" (ast/->str %))
                 (ast/find-nodes ast/keyword-node? node))))

(defrule driver-connection-check-bypassed
  {:name        "Driver connection check that skips the shared details validation"
   :description (str "`driver/validate-db-details!` on `:sql-jdbc` rejects JDBC properties that load classes or "
                     "write files -- `socketFactory`, `sslfactory`, `loggerFile`. A driver that overrides it "
                     "without running the parent loses that list; a driver whose `can-connect?` never calls it "
                     "connects with whatever the details say. Both shapes have shipped, per driver, more than once.")
   :remediation (str "In `validate-db-details!`, call `((get-method driver/validate-db-details! :sql-jdbc) driver "
                     "details)` before the driver's own checks. In `can-connect?`, call `driver/validate-db-details!` "
                     "or delegate to the `:sql-jdbc` implementation.")
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-20"
   :form-triggers #{defmethod}}
  [{:keys [node ns]}]
  (case (driver-method-name node ns)
    "validate-db-details!"
    ;; the root and the `:sql-jdbc` implementation *are* the parents
    (when-not (or (delegates-to-parent? node) (checks-additional-options? node)
                  (contains? #{":default" ":sql-jdbc"} (dispatch-value node)))
      {:message "validate-db-details! override does not run the parent's JDBC property checks"})

    "can-connect?"
    (when-not (or (delegates-to-parent? node) (mentions? node "validate-db-details!")
                  (contains? #{":default" ":sql-jdbc"} (dispatch-value node)))
      {:message "can-connect? override never validates the connection details"})

    nil))
