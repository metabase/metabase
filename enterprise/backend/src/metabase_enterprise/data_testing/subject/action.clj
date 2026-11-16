(ns metabase-enterprise.data-testing.subject.action
  "The `:action` subject: a query action, whose SQL modifies existing tables. Expectations read those tables after it
  runs."
  (:require
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase.actions.core :as actions]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- refused-with-status-400
  "Calls `thunk`. An exception it throws with status code 400 is rethrown as `error-type`, with `message` before the
  exception's own message; any other exception passes through."
  [thunk error-type message]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (if (= 400 (:status-code (ex-data e)))
        (throw (data-testing.errors/ex error-type (str message " " (ex-message e)) {} e))
        (throw e)))))

(mu/defmethod data-testing.subject/subject-plan :action :- ::data-testing.subject/subject-plan
  [_subject-type
   action                :- ::data-testing.subject/action
   {:keys [parameters]}  :- ::data-testing.subject/definition]
  (when-not (= :query (keyword (:type action)))
    (throw (data-testing.errors/ex
            ::data-testing.errors/unsupported-action
            (tru "Only query actions can be tested.")
            {})))
  (let [database (data-testing.subject/testable-database (:database_id action))]
    (refused-with-status-400 #(actions/check-actions-enabled action)
                             ::data-testing.errors/actions-disabled
                             (tru "Actions cannot run on the action''s database:"))
    (let [values (refused-with-status-400 #(actions/parameter-values action (or parameters {}))
                                          ::data-testing.errors/invalid-parameters
                                          (tru "The test''s parameter values do not fit the action:"))
          {sql :query params :params}
          (try
            (qp.compile/compile (actions/query-with-parameter-values action values))
            (catch Exception e
              (throw (data-testing.errors/ex
                      ::data-testing.errors/uncompilable-subject
                      (tru "The action''s query could not be compiled to SQL with the test''s parameter values: {0}"
                           (ex-message e))
                      {}
                      e))))]
      {:database database
       :compiled {:query sql :params params}
       :writes?  true})))
