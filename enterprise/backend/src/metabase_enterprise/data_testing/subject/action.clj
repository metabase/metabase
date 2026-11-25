(ns metabase-enterprise.data-testing.subject.action
  "The `:action` subject: a query action, whose SQL modifies existing tables. Expectations read those tables after it
  runs."
  (:require
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase.actions.core :as actions]
   [metabase.lib.schema :as lib.schema]
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

(mu/defn filled-query :- ::lib.schema/query
  "The query of the query action `action`, with the values that the test's `parameters` give its parameters. Throws
  `::data-testing.errors/invalid-parameters` when `parameters` do not fit the action."
  [action     :- ::data-testing.subject/action
   parameters :- [:maybe ::data-testing.schema/parameters]]
  (let [values (refused-with-status-400 #(actions/parameter-values action (or parameters {}))
                                        ::data-testing.errors/invalid-parameters
                                        (tru "The test''s parameter values do not fit the action:"))]
    (actions/query-with-parameter-values action values)))

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
    ;; Compiling the query of an impersonated user refuses a statement that is not a SELECT, so the user is refused
    ;; here first, as the user of any other test is.
    (data-testing.subject/check-not-impersonated database)
    (refused-with-status-400 #(actions/check-actions-enabled action)
                             ::data-testing.errors/actions-disabled
                             (tru "Actions cannot run on the action''s database:"))
    (assoc (data-testing.subject/compile-query
            (filled-query action parameters)
            #(tru "The action''s query could not be compiled to SQL with the test''s parameter values: {0}"
                  (ex-message %)))
           :database database
           :writes?  true)))
