(ns dev.security-lint.rules.drivers
  "Invariants across driver implementations.

  A defence added to one driver does not reach its siblings on its own. These rules ask each implementation the
  question the shared implementation answers."
  (:require
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(defn- driver-method-name
  "The name of the `metabase.driver` multimethod a `defmethod` or `mu/defmethod` form implements, or nil for any
  other multimethod: `channel/can-connect?` is a different question about a different thing."
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
   :enabled     false
   :description (str "`driver/validate-db-details!` on `:sql-jdbc` rejects JDBC properties that load classes or "
                     "write files -- `socketFactory`, `sslfactory`, `loggerFile`. A driver that overrides it "
                     "without running the parent loses that list; a driver whose `can-connect?` never calls it "
                     "connects with whatever the details say.")
   :remediation (str "In `validate-db-details!`, call `((get-method driver/validate-db-details! :sql-jdbc) driver "
                     "details)` before the driver's own checks. In `can-connect?`, call `driver/validate-db-details!` "
                     "or delegate to the `:sql-jdbc` implementation.")
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-20"
   ;; `mu/defmethod` implements the multimethod as surely as `defmethod` does, and the JDBC drivers use it
   :form-triggers #{defmethod mu/defmethod}}
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

(defn- value-clause-method?
  "Whether a `defmethod` form implements the compiler for a `:value` clause: `sql.qp/->honeysql [<driver> :value]`
  in a SQL driver, or Mongo's `->rvalue :value`. The base `[:sql :value]` is the guard's home and is left alone."
  [node]
  (let [nm       (some-> (ast/arg node 0) ast/unmeta n/sexpr)
        dispatch (some-> (ast/arg node 1) ast/unmeta)]
    (boolean
     (and (symbol? nm)
          (case (name nm)
            "->honeysql" (and dispatch (ast/vector-node? dispatch)
                              (let [[d clause] (map (comp n/sexpr ast/unmeta) (ast/children dispatch))]
                                (and (= :value clause) (not= :sql d))))
            "->rvalue"   (and dispatch (= :value (n/sexpr dispatch)))
            false)))))

(defn- guards-scalar?
  "Whether the method body checks the value is a scalar itself -- `check-value-literal`, a `coll?`/`map?`/
  `sequential?` test -- or delegates to the parent implementation, which does."
  [node]
  (or (delegates-to-parent? node)
      (some #(mentions? node %) ["check-value-literal" "coll?" "map?" "sequential?" "scalar?"])))

(defrule driver-value-clause-guard-bypassed
  {:name        "Driver :value compiler that never checks the value is a scalar"
   :enabled     false
   :description (str "The base `->honeysql [:sql :value]` throws when the value slot holds a collection, because "
                     "HoneySQL formats a map or a vector there as SQL structure: `[{:raw \"...\"}]` is raw SQL. A "
                     "driver that overrides the `:value` compiler and never runs that check hands any query-builder "
                     "user arbitrary SQL, and a stored Segment or Measure definition carrying such a value runs it "
                     "for every user who references it. Mongo's `->rvalue :value` is the same position: a map "
                     "there is an `$expr` operand, where `$function` is server-side JavaScript.")
   :remediation (str "Call `sql.qp/check-value-literal` on the value first, or delegate to the `[:sql :value]` "
                     "implementation for every type the override does not handle itself.")
   :severity    :error
   :precision   :high
   :cwe         "CWE-89"
   :form-triggers #{defmethod mu/defmethod}}
  [{:keys [node]}]
  (when (and (value-clause-method? node) (not (guards-scalar? node)))
    {:message (str (ast/->str (ast/arg node 0)) " " (ast/->str (ast/arg node 1))
                   " never checks that the value is a scalar")}))
