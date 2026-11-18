(ns metabase-enterprise.data-testing.suite
  "Test suites as the current user sees them: [[with-members]] resolves each member to the saved test it names,
  [[member-rows]] turns the members a client sends into the rows a suite stores, and [[runs-for-reader]] hides from the
  run history what the reader may not see."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private TestRef
  "A saved test by type and entity id. The type can be one this version does not know."
  [:tuple :keyword :string])

(def ^:private TestKey
  "A saved test by type and either id or entity id."
  [:tuple :keyword [:or ms/PositiveInt :string]])

(mu/defn saved-tests-by :- [:map-of TestKey ::data-testing.schema/saved-test]
  "The saved tests whose `column` holds one of the values in `refs`, `[test-type value]` pairs, keyed by pair, each
  hydrated with `:can_read`. A pair of a test type this version does not know, or that names no test, is absent."
  [column :- [:enum :id :entity_id]
   refs   :- [:sequential TestKey]]
  (into {}
        (mapcat (fn [[test-type type-refs]]
                  (when-let [model (:model (data-testing.test-type/spec test-type))]
                    (for [saved-test (t2/hydrate (data-testing.db/saved-tests-where model column (into [] (comp (map second) (distinct)) type-refs))
                                                 :can_read)]
                      [[test-type (get saved-test column)] saved-test]))))
        (group-by first refs)))

(mu/defn- member-response :- ::data-testing.schema/test-suite.member.response
  "`member` as the current user sees it, given `saved-test`, the test it names, or nil."
  [{:keys [test_type test_entity_id position]} :- ::data-testing.schema/test-suite.member
   saved-test                                  :- [:maybe ::data-testing.schema/saved-test]]
  (let [member {:test_type test_type :test_entity_id test_entity_id :position position}]
    (cond
      (nil? saved-test)          (assoc member :status :missing)
      (mi/can-read? saved-test)  (assoc member :status :readable :test_id (:id saved-test) :name (:name saved-test))
      :else                      (assoc member :status :unreadable))))

(mu/defn with-members :- [:sequential ::data-testing.schema/test-suite.response]
  "`suites`, each with its members in order, as the current user sees them."
  [suites :- [:sequential ::data-testing.schema/test-suite]]
  (let [members  (data-testing.db/suite-members (mapv :id suites))
        tests    (saved-tests-by :entity_id (mapv (juxt :test_type :test_entity_id) members))
        by-suite (group-by :suite_id members)]
    (mapv (fn [suite]
            (assoc suite :members (mapv #(member-response % (get tests [(:test_type %) (:test_entity_id %)]))
                                        (get by-suite (:id suite)))))
          suites)))

(defn- refuse-member
  "Throw a 400 for a requested member naming `value`, the id or entity id of a `test-type` test, that names no test the
  current user can read. The message is the same whether the test is missing or unreadable."
  [test-type value]
  (throw (ex-info (tru "There is no {0} test {1} that you can read." (name test-type) (pr-str value))
                  {:status-code 400})))

(mu/defn member-rows :- [:sequential [:map {:closed true}
                                      [:test_type      ::data-testing.schema/test-type]
                                      [:test_entity_id :string]]]
  "The rows a suite stores for `requested`, the members a client sent, in order. A member by test id must name a test the
  current user can read. A member by entity id must name such a test, or be in `kept`, the members the suite has now as
  `[test-type entity-id]`, so that a user can keep a member they cannot read or that is missing. Throws a 400 for any
  other member, and for a test named twice."
  [requested :- [:sequential ::data-testing.schema/test-suite.member.request]
   kept      :- [:set TestRef]]
  (let [readable (fn [tests] (into {} (filter (comp mi/can-read? val)) tests))
        by-id    (readable (saved-tests-by :id (into [] (comp (filter :test_id) (map (juxt :test_type :test_id))) requested)))
        by-eid   (readable (saved-tests-by :entity_id (into [] (comp (filter :test_entity_id) (map (juxt :test_type :test_entity_id))) requested)))
        rows     (mapv (fn [{:keys [test_type test_id test_entity_id]}]
                         (if test_id
                           (if-let [saved-test (get by-id [test_type test_id])]
                             {:test_type test_type :test_entity_id (:entity_id saved-test)}
                             (refuse-member test_type test_id))
                           (if (or (contains? kept [test_type test_entity_id])
                                   (contains? by-eid [test_type test_entity_id]))
                             {:test_type test_type :test_entity_id test_entity_id}
                             (refuse-member test_type test_entity_id))))
                       requested)]
    (when-let [repeated (seq (keep (fn [[row n]] (when (> n 1) row)) (frequencies rows)))]
      (throw (ex-info (tru "A test can be in a suite only once. Named more than once: {0}"
                           (pr-str (mapv (juxt (comp name :test_type) :test_entity_id) repeated)))
                      {:status-code 400})))
    rows))

(mu/defn runs-for-reader :- [:sequential ::data-testing.schema/test-suite-run]
  "`runs` with the `:error` removed from each member whose test the current user cannot read: a refusal can quote the
  test's SQL. A member whose test is missing keeps its error."
  [runs :- [:sequential ::data-testing.schema/test-suite-run]]
  (let [refs   (into [] (comp (mapcat :members) (filter :error) (map (juxt :test_type :test_entity_id)) (distinct)) runs)
        tests  (saved-tests-by :entity_id refs)
        hidden (into #{} (keep (fn [[ref saved-test]] (when-not (mi/can-read? saved-test) ref))) tests)]
    (mapv (fn [run]
            (cond-> run
              (seq (:members run))
              (update :members (partial mapv #(cond-> %
                                                (contains? hidden [(:test_type %) (:test_entity_id %)])
                                                (dissoc :error))))))
          runs)))
