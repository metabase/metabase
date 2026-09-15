(ns metabase.transform-testing.expectations
  "Checks the expectations of a transform test against the output of the transform under test."
  (:require
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.executor :as transform-testing.executor]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::context
  "What checking an expectation needs: the connection holding the temp tables and how to refer to them."
  [:map {:closed true}
   [:driver       :keyword]
   [:conn         :some]
   [:output-table :string]
   [:replacements ::transform-testing.compile/table-replacements]])

(defmulti check-expectation
  "Checks `expectation` against the output temp table on the connection of `context`, returning whether it passed."
  {:arglists '([context expectation])}
  (fn [_context expectation]
    (:type expectation)))

(mu/defmethod check-expectation :equals :- ::transform-testing.schema/status
  [_context     :- ::context
   _expectation :- ::transform-testing.schema/expectation.equals]
  (throw (ex-info "Not implemented" {})))

(mu/defmethod check-expectation :empty :- ::transform-testing.schema/status
  [{:keys [driver conn replacements]} :- ::context
   {:keys [sql]}                      :- ::transform-testing.schema/expectation.empty]
  (let [query (transform-testing.compile/replace-tables driver sql replacements)]
    (if (empty? (transform-testing.executor/run-query driver conn [query []] 1))
      :passed
      :failed)))
