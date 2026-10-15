(ns metabase-enterprise.library-branching.mutation.core
  "Mutation testing in the running JVM. A mutation is data: a name, a target (a var or a method), and edits of the
  target's source form. A run applies each mutation to the loaded code, runs the tests, restores the target, and
  gives :killed, :survived, :timeout or :invalid.")

(def ^:dynamic *running*
  "True while a run executes tests. A run that starts while it is true returns nil."
  false)

(defn apply-edits
  "The source text `form-text` after `edits`, read in the namespace `ns-sym`."
  [_ns-sym _form-text _edits]
  (throw (ex-info "Not implemented." {})))

(defn preview
  "`{:original text :mutated text}`: the source form of the target of `mutation`, without and with its edits."
  [_mutation]
  (throw (ex-info "Not implemented." {})))

(defn run-mutations
  "The result of each of `mutations`, in order."
  [_mutations _opts]
  (throw (ex-info "Not implemented." {})))

(defn report
  "A Markdown table of `results`, and a list of their docs."
  [_results]
  (throw (ex-info "Not implemented." {})))

(defn is-expected
  "One `clojure.test/is` for each of `results`: its result is its expected result."
  [_results]
  (throw (ex-info "Not implemented." {})))

(defn check
  "Runs `mutations` with `opts`, asserts the expected result of each, and returns the results."
  [_mutations _opts]
  (throw (ex-info "Not implemented." {})))
