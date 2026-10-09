(ns dev.security-lint.rules.identity
  "Who the code thinks is running it.

  A check that fires only when a user is bound is a check the unbound contexts skip, and those are exactly the
  ones that run with the most authority: a public or embedded card runs `as-admin` with `*current-user-id*` nil,
  a scheduled job and a model-index refresh run with no user at all."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(def ^:private current-user-name #"^\*?current-user(-id)?\*?$")

(defn- current-user-test?
  "Whether a conditional's test is the bound user: `api/*current-user-id*`, `*current-user*`, or one of those under
  `some?`, `not (nil? ...)`, `boolean`, `pos?`, or `and`."
  [test]
  (let [test (ast/unmeta test)]
    (boolean
     (cond
       (ast/symbol-node? test) (re-find current-user-name (name (n/sexpr test)))
       (ast/call? test)        (let [head (some-> (ast/head-sym test) name)]
                                 (case head
                                   ("some?" "boolean" "pos?" "and") (some current-user-test? (ast/args test))
                                   "not"                            (let [a (some-> (ast/arg test 0) ast/unmeta)]
                                                                      (and a (ast/call? a) (= "nil?" (some-> (ast/head-sym a) name))
                                                                           (current-user-test? (ast/arg a 0))))
                                   false))
       :else                   false))))

(def ^:private check-name #"^(check|assert|verify|throw)[-!]|-check!?$|^throw$")

(defn- security-check?
  "Whether a form is a check: a `throw`, or a call whose name says it checks or throws."
  [node]
  (let [node (ast/unmeta node)]
    (boolean (and (ast/call? node)
                  (some-> (ast/head-sym node) name (->> (re-find check-name)))))))

(defn- guarded-body
  "The forms that run only when the test passed: everything after the test for `when`, the then-branch for `if`."
  [head args]
  (case (name head)
    "when" (rest args)
    "if"   (some-> (nth args 1 nil) vector)
    nil))

(defrule check-gated-on-current-user
  {:name        "Security check that runs only when a user is bound"
   :enabled     false
   :description (str "A check nested under `(when *current-user-id* ...)` is skipped in exactly the contexts that "
                     "run with the most authority: a public or embedded card runs as admin with no user bound, a "
                     "scheduled job and a model-index refresh run with none at all. A guard under that gate holds "
                     "for signed-in users and for nobody else.")
   :remediation (str "Run the check whether or not a user is bound; if it needs a user, decide explicitly what an "
                     "unbound context may do, rather than letting it pass.")
   ;; a warning: the body may be a check that genuinely concerns only a bound user, and the rule reads the name
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-863"
   :form-triggers #{when if}}
  [{:keys [node]}]
  (let [head (ast/head-sym node)
        args (ast/args node)]
    (when (and head (seq args) (current-user-test? (first args)))
      (let [checks (filter security-check? (mapcat #(ast/find-nodes ast/call? (ast/unmeta %)) (guarded-body head args)))]
        (when (seq checks)
          {:message (str "Check runs only when a user is bound; public and background contexts skip it: "
                         (str/join ", " (distinct (map #(name (ast/head-sym %)) checks))))})))))
