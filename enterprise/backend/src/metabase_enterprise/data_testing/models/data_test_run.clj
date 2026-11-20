(ns metabase-enterprise.data-testing.models.data-test-run
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.default-fields :as t2.default-fields]))

(methodical/defmethod t2/table-name :model/DataTestRun [_model] :data_test_run)

(derive :model/DataTestRun :metabase/model)
(derive :model/DataTestRun :hook/worktree-id)

(t2.default-fields/define-default-fields :model/DataTestRun
  data-testing.db/run-columns)

(defn- stored-result-decoder
  "A function from a stored result as it reads from JSON, with every map key a keyword, to the result as the run
  reported it: keywords where the schema has them, and the keys of rows and tables as strings."
  []
  (mr/cached ::stored-result-decoder
             ::data-testing.schema/stored-run-result
             #(mc/decoder ::data-testing.schema/stored-run-result
                          (mtx/transformer mtx/json-transformer {:name :normalize}))))

(def ^:private max-stored-string-length
  "How many characters of any one string of a result are stored. A cell or a message can be as long as the warehouse
  makes it."
  1000)

(def ^:private max-stored-result-length
  "How many characters of JSON a stored result may take. A larger result is not stored."
  1000000)

(defn- shortened
  "`x` with every string value in it cut to [[max-stored-string-length]]. Map keys stay whole."
  [x]
  (cond
    (string? x)     (if (> (count x) max-stored-string-length)
                      (str (subs x 0 max-stored-string-length) "…")
                      x)
    (map? x)        (update-vals x shortened)
    (sequential? x) (mapv shortened x)
    :else           x))

(defn- result-in
  "The JSON to store for `result`, with its long strings cut, or nil when it is still too large to store."
  [result]
  (let [json (mi/json-in (shortened result))]
    (if (> (count json) max-stored-result-length)
      (log/warnf "Not storing the result of a test run: %d characters of JSON" (count json))
      json)))

(defn- result-out
  "The stored result read from the JSON `s`, or nil when it is not one this version can read."
  [s]
  (try
    (when-let [result (mi/json-out-with-keywordization s)]
      (let [decoded ((stored-result-decoder) result)]
        (if (mr/validate ::data-testing.schema/stored-run-result decoded)
          decoded
          (log/warn "Ignoring a data_test_run.result that is not a stored run result"))))
    (catch Throwable e
      (log/warnf "Ignoring a data_test_run.result that cannot be read: %s" (ex-message e)))))

(t2/deftransforms :model/DataTestRun
  {:status    mi/transform-keyword
   :test_type mi/transform-keyword
   :result    {:in result-in :out result-out}})

(defn with-initiated-by-users
  "`runs`, each with the user whose id is its `:initiated_by`, or nil, under `:initiated_by_user`."
  [runs]
  (let [user-ids (into #{} (keep :initiated_by) runs)
        id->user (when (seq user-ids) (data-testing.db/users-by-id user-ids))]
    (for [run runs]
      (assoc run :initiated_by_user (get id->user (:initiated_by run))))))

(methodical/defmethod t2/batched-hydrate [:model/DataTestRun :initiated_by_user]
  "Add the user who started each run, or nil."
  [_model _k runs]
  (with-initiated-by-users runs))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn start-data-test-run! :- ::data-testing.schema/data-test-run
  "Insert a started DataTestRun of the `test-type` test `test-id`, started by the user `initiated-by`, and return it."
  [test-type    :- ::data-testing.schema/test-type
   test-id      :- ms/PositiveInt
   initiated-by :- [:maybe ::lib.schema.id/user]]
  (data-testing.db/insert-test-run! test-type test-id initiated-by))

(mu/defn finish-data-test-run! :- :int
  "Set `status`, the end time and the stored `result` of the DataTestRun `run-id` if it is still started, returning the
  number of rows updated."
  [run-id :- ms/PositiveInt
   status :- ::data-testing.schema/run-status
   result :- [:maybe ::data-testing.schema/stored-run-result]]
  (data-testing.db/finish-started-test-run! run-id status result))

(mu/defn clear-test-ids-of-runs!
  "Set the test id of the runs of the `test-type` tests with `test-ids` to nil, so that no run names a test after it is
  deleted."
  [test-type :- ::data-testing.schema/test-type
   test-ids  :- [:sequential ms/PositiveInt]]
  (when (seq test-ids)
    (data-testing.db/clear-test-ids-of-runs! test-type (vec test-ids)))
  nil)

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DataTestRun [_model]
  {:skip? false})
