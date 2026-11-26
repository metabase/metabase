(ns metabase-enterprise.data-testing.test-type
  "[[spec]]: what the module needs to know about each type of saved test.")

(defmulti spec
  "How the module handles the saved tests of `test-type`, or nil for a test type this version does not know, such as one
  a newer node wrote into the run history:

  - `:model`: the model of those tests;
  - `:run-topics`: the audit topics of their runs, `{:start topic :timeout topic}`;
  - `:subject`: a function of a saved test that returns the thing it tests, or nil when that is gone."
  {:arglists '([test-type])}
  identity)

(defmethod spec :default [_test-type] nil)
