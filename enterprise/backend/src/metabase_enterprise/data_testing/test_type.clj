(ns metabase-enterprise.data-testing.test-type
  "[[spec]]: what the module needs to know about each type of saved test.")

(defmulti spec
  "How the module handles the saved tests of `test-type`: `:model`, the model of those tests, and `:run-topics`, the
  audit topics of their runs, `{:start topic :timeout topic}`. Nil for a test type this version does not know, such as
  one a newer node wrote into the run history."
  {:arglists '([test-type])}
  identity)

(defmethod spec :default [_test-type] nil)
