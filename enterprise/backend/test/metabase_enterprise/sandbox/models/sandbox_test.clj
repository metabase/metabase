(ns metabase-enterprise.sandbox.models.sandbox-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.sandbox.models.sandbox-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.sandbox.models.sandbox :as sandboxes]
   [metabase-enterprise.test :as met]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.measures.test-util :as measures.tu]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest disallow-changing-table-id-test
  (testing "You can't change the table_id of a sandbox after it has been created."
    (mt/with-temp [:model/Sandbox gtap {:table_id (mt/id :venues)
                                        :group_id (u/the-id (perms-group/all-users))}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"You cannot change the table ID of a sandbox once it has been created"
           (t2/update! :model/Sandbox (:id gtap) {:table_id (mt/id :checkins)}))))))

(deftest disallow-queries-that-add-columns-test
  (testing "Don't allow saving a Sandboxing query that contains columns not in the Table it replaces (#13715)"
    (doseq [[msg f] {"Create a new GTAP"
                     (fn [query]
                       (mt/with-temp [:model/Card                   card {:dataset_query   query
                                                                          :result_metadata (qp.preprocess/query->expected-cols query)}
                                      :model/Sandbox _    {:table_id (mt/id :venues)
                                                           :group_id (u/the-id (perms-group/all-users))
                                                           :card_id  (:id card)}]
                         :ok))

                     "Update an existing GTAP"
                     (fn [query]
                       (mt/with-temp [:model/Card                   card {:dataset_query   query
                                                                          :result_metadata (qp.preprocess/query->expected-cols query)}
                                      :model/Sandbox gtap {:table_id (mt/id :venues)
                                                           :group_id (u/the-id (perms-group/all-users))}]
                         (t2/update! :model/Sandbox (:id gtap) {:card_id (:id card)})
                         :ok))

                     "Update query for Card associated with an existing GTAP"
                     (fn [query]
                       (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                          :result_metadata (qp.preprocess/query->expected-cols (mt/mbql-query venues))}
                                      :model/Sandbox _    {:table_id (mt/id :venues)
                                                           :group_id (u/the-id (perms-group/all-users))
                                                           :card_id  (:id card)}]
                         (t2/update! :model/Card (:id card) {:dataset_query query})
                         :ok))}]
      (testing (str "\n" msg "\n")
        (testing "sanity check"
          (is (= :ok
                 (f (mt/mbql-query venues)))))
        (testing "removing columns = ok"
          (is (= :ok
                 (f (mt/mbql-query venues {:fields [$id $name]})))))
        (testing "changing order of columns = ok"
          (is (= :ok
                 (f (mt/mbql-query venues
                      {:fields (for [id (shuffle (map :id (qp.preprocess/query->expected-cols (mt/mbql-query venues))))]
                                 [:field id nil])})))))))))

(deftest disallow-queries-that-change-types-test
  (testing "Don't allow saving a Sandboxing query that changes the type of a column vs. the type in the Table it replaces (#13715)"
    (mt/with-premium-features #{:sandboxes}
      (doseq [[msg f] {"Create a new GTAP"
                       (fn [metadata]
                         (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                            :result_metadata metadata}
                                        :model/Sandbox _    {:table_id (mt/id :venues)
                                                             :group_id (u/the-id (perms-group/all-users))
                                                             :card_id  (:id card)}]
                           :ok))

                       "Update an existing GTAP"
                       (fn [metadata]
                         (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                            :result_metadata metadata}
                                        :model/Sandbox gtap {:table_id (mt/id :venues)
                                                             :group_id (u/the-id (perms-group/all-users))}]
                           (t2/update! :model/Sandbox (:id gtap) {:card_id (:id card)})
                           :ok))

                       "Update query for Card associated with an existing GTAP"
                       (fn [metadata]
                         (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                            :result_metadata (qp.preprocess/query->expected-cols (mt/mbql-query venues))}
                                        :model/Sandbox _    {:table_id (mt/id :venues)
                                                             :group_id (u/the-id (perms-group/all-users))
                                                             :card_id  (:id card)}]
                           (t2/update! :model/Card (:id card) {:result_metadata metadata})
                           :ok))}]
        (testing (str "\n" msg "\n")
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Sandbox Questions can't return columns that have different types than the Table they are sandboxing"
               (f (-> (vec (qp.preprocess/query->expected-cols (mt/mbql-query venues)))
                      (assoc-in [0 :base_type] :type/Text)))))
          (testing "type changes to a descendant type = ok"
            (is (= :ok
                   (f
                    (-> (vec (qp.preprocess/query->expected-cols (mt/mbql-query venues)))
                        (assoc-in [0 :base_type] :type/BigInteger)))))))))))

(deftest add-sandboxes-to-permissions-graph-test
  (mt/with-premium-features #{:sandboxes}
    (mt/with-full-data-perms-for-all-users!
      (testing "Sandbox definitions in the DB are automatically added to the permissions graph"
        (mt/with-temp [:model/Sandbox _gtap {:table_id (mt/id :venues)
                                             :group_id (u/the-id (perms-group/all-users))}]
          (is (partial=
               {(u/the-id (perms-group/all-users))
                {(mt/id)
                 {:view-data
                  {"PUBLIC"
                   {(mt/id :venues) :sandboxed}}}}}
               (sandboxes/add-sandboxes-to-permissions-graph {})))))
      (testing "When perms are set at the DB level, incorporating a sandbox breaks them out to table-level"
        (mt/with-temp [:model/Sandbox _gtap {:table_id (mt/id :venues)
                                             :group_id (u/the-id (perms-group/all-users))}]
          (is (partial=
               {(u/the-id (perms-group/all-users))
                {(mt/id)
                 {:view-data {"PUBLIC"
                              {(mt/id :venues) :sandboxed}}}}}
               (sandboxes/add-sandboxes-to-permissions-graph
                {(u/the-id (perms-group/all-users))
                 {(mt/id)
                  {:view-data :unrestricted}}})))))
      (testing "When perms are set at the schema level, incorporating a sandbox breaks them out to table-level"
        (mt/with-temp [:model/Sandbox _gtap {:table_id (mt/id :venues)
                                             :group_id (u/the-id (perms-group/all-users))}]
          (is (partial=
               {(u/the-id (perms-group/all-users))
                {(mt/id)
                 {:view-data
                  {"PUBLIC"
                   {(mt/id :venues) :sandboxed}}}}}
               (sandboxes/add-sandboxes-to-permissions-graph
                {(u/the-id (perms-group/all-users))
                 {(mt/id)
                  {:view-data :unrestricted}}}))))))))

;;; ------------------------------------------ sandbox dependency set guard -------------------------------------------

(def ^:private card-msg
  #"You do not have permissions to modify a question that is used for row and column level security")
(def ^:private snippet-msg
  #"You do not have permissions to modify a snippet that is used for row and column level security")
(def ^:private segment-msg
  #"You do not have permissions to modify a segment that is used for row and column level security")
(def ^:private measure-msg
  #"You do not have permissions to modify a measure that is used for row and column level security")

(defn- guarded-writes-test
  "Runs the sandbox-guard contract against a policy built by `with-policy`, a function that creates the policy's
  entities and a sandbox on VENUES and calls its argument with a map of those entities. `ops` is a function of that
  map returning the guarded writes in order, as `[op-name expected-message thunk]` triples, deletes last; every thunk
  returns the number of rows it writes.

  Every write is refused with its message for a non-admin, and all of them go through, in order, for an admin and for
  a server-side write with no user bound; each pass gets its own policy."
  [with-policy ops]
  (testing "a non-admin is refused"
    (with-policy
      (fn [policy]
        (mt/with-test-user :rasta
          (doseq [[op-name msg f] (ops policy)]
            (testing op-name
              (is (thrown-with-msg? clojure.lang.ExceptionInfo msg (f)))))))))
  (testing "an admin may do all of it"
    (with-policy
      (fn [policy]
        (mt/with-test-user :crowberto
          (doseq [[op-name _msg f] (ops policy)]
            (testing op-name
              (is (= 1 (f)))))))))
  (testing "a server-side write with no user bound may do all of it"
    (with-policy
      (fn [policy]
        (mt/with-test-user :rasta
          (binding [api/*current-user-id* nil]
            (doseq [[op-name _msg f] (ops policy)]
              (testing op-name
                (is (= 1 (f)))))))))))

(defn- untouched-test
  "Asserts a non-admin may still write an unrelated entity of the same kind: `write` is called with the map from
  `with-policy` and must return the number of rows it writes."
  [with-policy write]
  (testing "an unrelated entity of the same kind is untouched"
    (with-policy
      (fn [policy]
        (mt/with-test-user :rasta
          (is (= 1 (write policy))))))))

(defn- snippet-query
  "A native query on VENUES filtered by `{{snippet: <snippet-name>}}`; Lib resolves the tag's `:snippet-id` by name."
  [{snippet-name :name}]
  (lib/native-query (mt/metadata-provider) (format "SELECT * FROM VENUES WHERE {{snippet: %s}}" snippet-name)))

(defn- with-card-policy [f]
  (mt/with-temp [:model/PermissionsGroup group {}
                 :model/Card             card  {:dataset_query (mt/mbql-query venues)}
                 :model/Card             other {:dataset_query (mt/mbql-query venues)}
                 :model/Sandbox          _     {:table_id (mt/id :venues), :group_id (:id group), :card_id (:id card)}]
    (f {:card card, :other other})))

(deftest only-admins-can-change-a-card-a-sandbox-is-built-out-of-test
  (mt/with-premium-features #{:sandboxes}
    (guarded-writes-test
     with-card-policy
     (fn [{:keys [card]}]
       [["query"   card-msg #(t2/update! :model/Card (:id card) {:dataset_query (mt/mbql-query venues {:limit 1})})]
        ["archive" card-msg #(t2/update! :model/Card (:id card) {:archived true})]
        ["delete"  card-msg #(t2/delete! :model/Card (:id card))]]))
    (untouched-test
     with-card-policy
     (fn [{:keys [other]}]
       (t2/update! :model/Card (:id other) {:dataset_query (mt/mbql-query venues {:limit 1})})))))

(defn- with-snippet-policy
  "A policy whose snippet `outer` splices in snippet `inner`, which in turn reads Card `nested-card` through a
  `{{#card}}` tag."
  [f]
  (let [inner-name (mt/random-name)
        outer-name (mt/random-name)]
    (mt/with-temp [:model/PermissionsGroup   group       {}
                   :model/Card               nested-card {:dataset_query (mt/mbql-query venues {:limit 1})}
                   :model/NativeQuerySnippet inner       {:name    inner-name
                                                          :content (format "ID IN (SELECT ID FROM {{#%d-nested}})"
                                                                           (:id nested-card))}
                   :model/NativeQuerySnippet outer       {:name    outer-name
                                                          :content (format "{{snippet: %s}}" inner-name)}
                   :model/NativeQuerySnippet other       {:content "1 = 1"}
                   :model/Card               policy      {:dataset_query (snippet-query outer)}
                   :model/Sandbox            _           {:table_id (mt/id :venues)
                                                          :group_id (:id group)
                                                          :card_id  (:id policy)}]
      (f {:inner inner, :outer outer, :other other, :nested-card nested-card}))))

(deftest only-admins-can-change-a-snippet-a-sandbox-is-built-out-of-test
  (mt/with-premium-features #{:sandboxes}
    (guarded-writes-test
     with-snippet-policy
     (fn [{:keys [inner outer nested-card]}]
       [["content"                       snippet-msg #(t2/update! :model/NativeQuerySnippet (:id outer)
                                                                  {:content "1 = 1"})]
        ["name"                          snippet-msg #(t2/update! :model/NativeQuerySnippet (:id outer)
                                                                  {:name (mt/random-name)})]
        ["archive"                       snippet-msg #(t2/update! :model/NativeQuerySnippet (:id outer)
                                                                  {:archived true})]
        ["content of the nested snippet" snippet-msg #(t2/update! :model/NativeQuerySnippet (:id inner)
                                                                  {:content "2 = 2"})]
        ["query of the nested Card"      card-msg    #(t2/update! :model/Card (:id nested-card)
                                                                  {:dataset_query (mt/mbql-query venues)})]
        ["delete"                        snippet-msg #(t2/delete! :model/NativeQuerySnippet (:id outer))]]))
    (untouched-test
     with-snippet-policy
     (fn [{:keys [other]}]
       (t2/update! :model/NativeQuerySnippet (:id other) {:content "2 = 2"})))))

(defn- venues-query []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- price-above
  "A Segment definition: VENUES.PRICE above `n`."
  [n]
  (measures.tu/segment-definition (mt/id :venues) (mt/id :venues :price) n))

(defn- with-segment-policy
  "A policy filtering on Segment `outer`, whose definition filters on Segment `inner`."
  [f]
  (mt/with-temp [:model/PermissionsGroup group  {}
                 :model/Segment          inner  {:table_id (mt/id :venues), :definition (price-above 2)}
                 :model/Segment          outer  {:table_id   (mt/id :venues)
                                                 :definition (lib/filter (venues-query)
                                                                         (lib.metadata/segment (mt/metadata-provider)
                                                                                               (:id inner)))}
                 :model/Segment          other  {:table_id (mt/id :venues), :definition (price-above 3)}
                 :model/Card             policy {:dataset_query (lib/filter (venues-query)
                                                                            (lib.metadata/segment (mt/metadata-provider)
                                                                                                  (:id outer)))}
                 :model/Sandbox          _      {:table_id (mt/id :venues)
                                                 :group_id (:id group)
                                                 :card_id  (:id policy)}]
    (f {:inner inner, :outer outer, :other other})))

(deftest only-admins-can-change-a-segment-a-sandbox-is-built-out-of-test
  (mt/with-premium-features #{:sandboxes}
    (guarded-writes-test
     with-segment-policy
     (fn [{:keys [inner outer]}]
       [["definition"                       segment-msg #(t2/update! :model/Segment (:id outer)
                                                                     {:definition (price-above 4)})]
        ["archive"                          segment-msg #(t2/update! :model/Segment (:id outer) {:archived true})]
        ["definition of the nested segment" segment-msg #(t2/update! :model/Segment (:id inner)
                                                                     {:definition (price-above 4)})]
        ["delete"                           segment-msg #(t2/delete! :model/Segment (:id outer))]]))
    (untouched-test
     with-segment-policy
     (fn [{:keys [other]}]
       (t2/update! :model/Segment (:id other) {:definition (price-above 5)})))))

(defn- sum-where-measure-definition
  "A Measure definition summing VENUES.PRICE over the rows matching `segment-id`."
  [segment-id]
  (let [mp (mt/metadata-provider)]
    (lib/aggregate (venues-query)
                   (lib/sum-where (lib.metadata/field mp (mt/id :venues :price))
                                  (lib.metadata/segment mp segment-id)))))

(defn- sum-of-price
  "A Measure definition: the sum of VENUES.PRICE (or, for an even `n`, of VENUES.LATITUDE, so that consecutive writes
  change something)."
  [n]
  (measures.tu/measure-definition (mt/id :venues) (mt/id :venues (if (odd? n) :price :latitude))))

(defn- measure-then-filter-query
  "A two-stage query: aggregate VENUES by CATEGORY_ID with `measure-id`, then keep only the groups whose measure
  is above 10 -- the measure decides which rows come back."
  [measure-id]
  (let [mp            (mt/metadata-provider)
        aggregated    (-> (venues-query)
                          (lib/aggregate (lib.metadata/measure mp measure-id))
                          (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id))))
        measure-col-1 (m/find-first #(:is-aggregation (lib/display-info aggregated %))
                                    (lib/returned-columns aggregated))
        stage-2       (lib/append-stage aggregated)
        measure-col-2 (m/find-first #(= (lib/display-name stage-2 %) (lib/display-name aggregated measure-col-1))
                                    (lib/filterable-columns stage-2))]
    (lib/filter stage-2 (lib/> measure-col-2 10))))

(defn- with-measure-policy
  "A policy aggregating with Measure `measure`, whose `sum-where` reads Segment `segment`."
  [f]
  (mt/with-temp [:model/PermissionsGroup group   {}
                 :model/Segment          segment {:table_id (mt/id :venues), :definition (price-above 2)}
                 :model/Measure          measure {:table_id   (mt/id :venues)
                                                  :definition (sum-where-measure-definition (:id segment))}
                 :model/Measure          other   {:table_id (mt/id :venues), :definition (sum-of-price 1)}
                 :model/Card             policy  {:dataset_query (measure-then-filter-query (:id measure))}
                 :model/Sandbox          _       {:table_id (mt/id :venues)
                                                  :group_id (:id group)
                                                  :card_id  (:id policy)}]
    (f {:segment segment, :measure measure, :other other})))

(deftest only-admins-can-change-a-measure-a-sandbox-is-built-out-of-test
  (mt/with-premium-features #{:sandboxes}
    (guarded-writes-test
     with-measure-policy
     (fn [{:keys [segment measure]}]
       [["definition of the nested segment" segment-msg #(t2/update! :model/Segment (:id segment)
                                                                     {:definition (price-above 3)})]
        ["definition"                       measure-msg #(t2/update! :model/Measure (:id measure)
                                                                     {:definition (sum-of-price 2)})]
        ["archive"                          measure-msg #(t2/update! :model/Measure (:id measure) {:archived true})]
        ["delete"                           measure-msg #(t2/delete! :model/Measure (:id measure))]]))
    (untouched-test
     with-measure-policy
     (fn [{:keys [other]}]
       (t2/update! :model/Measure (:id other) {:definition (sum-of-price 2)})))))

(deftest non-admin-cannot-rewrite-a-policy-snippet-through-the-api-test
  (testing "SEC-1094: a non-admin with native access to an unrelated Database only cannot rewrite a policy snippet"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:content "ID = 1"}]
      (met/with-gtaps! {:gtaps {:venues {:query (snippet-query snippet)}}}
        (mt/with-temp [:model/Database                  other-db {}
                       :model/PermissionsGroup          editors  {}
                       :model/User                      editor   {}
                       :model/PermissionsGroupMembership _       {:user_id (:id editor), :group_id (:id editors)}]
          (perms/set-database-permission! editors (:id other-db) :perms/view-data :unrestricted)
          (perms/set-database-permission! editors (:id other-db) :perms/create-queries :query-builder-and-native)
          (letfn [(sandboxed-row-count []
                    (count (mt/rows (mt/user-http-request :rasta :post 202 "dataset" (mt/mbql-query venues)))))]
            (is (= 1 (sandboxed-row-count)))
            (is (= "You do not have permissions to modify a snippet that is used for row and column level security."
                   (mt/user-http-request editor :put 403 (str "native-query-snippet/" (:id snippet))
                                         {:content "1 = 1"})))
            (is (= "ID = 1" (t2/select-one-fn :content :model/NativeQuerySnippet :id (:id snippet))))
            (is (= 1 (sandboxed-row-count)))))))))

(defn- with-mixed-policies!
  "Two sandboxes on VENUES, one per group, whose dependency chains mix every entity kind and are spread over six
  Collections:

    policy-a (policy-coll) -> {{snippet: outer}} (policy-snippet-coll) -> {{snippet: inner}} (dep-snippet-coll)
      -> {{#nested-card}} (chain-coll) -> [:segment seg-1]
    policy-b (policy-coll) -> source Card (chain-coll) -> [:measure measure] -> sum-where [:segment seg-2]

  `free-coll` and `free-snippet-coll` hold a Card and a snippet no policy reads. All Users may curate all six
  Collections and nothing else. Calls `f` with the Collections keyed `:policy`, `:chain`, `:free`, `:policy-snippet`,
  `:dep-snippet`, and `:free-snippet`."
  [f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
      (let [inner-name (mt/random-name)
            outer-name (mt/random-name)
            mp         (mt/metadata-provider)]
        (mt/with-temp [:model/PermissionsGroup   group-a             {}
                       :model/PermissionsGroup   group-b             {}
                       :model/Collection         policy-coll         {}
                       :model/Collection         chain-coll          {}
                       :model/Collection         free-coll           {}
                       :model/Collection         policy-snippet-coll {:namespace "snippets"}
                       :model/Collection         dep-snippet-coll    {:namespace "snippets"}
                       :model/Collection         free-snippet-coll   {:namespace "snippets"}
                       :model/Segment            seg-1       {:table_id (mt/id :venues), :definition (price-above 2)}
                       :model/Segment            seg-2       {:table_id (mt/id :venues), :definition (price-above 3)}
                       :model/Measure            measure     {:table_id   (mt/id :venues)
                                                              :definition (sum-where-measure-definition (:id seg-2))}
                       :model/Card               nested-card {:collection_id (:id chain-coll)
                                                              :dataset_query (lib/filter (venues-query)
                                                                                         (lib.metadata/segment mp (:id seg-1)))}
                       :model/Card               source      {:collection_id (:id chain-coll)
                                                              :dataset_query (measure-then-filter-query (:id measure))}
                       :model/Card               _free-card  {:collection_id (:id free-coll)
                                                              :dataset_query (mt/mbql-query venues)}
                       :model/NativeQuerySnippet _inner      {:collection_id (:id dep-snippet-coll)
                                                              :name          inner-name
                                                              :content       (format "ID IN (SELECT ID FROM {{#%d-nested}})"
                                                                                     (:id nested-card))}
                       :model/NativeQuerySnippet outer       {:collection_id (:id policy-snippet-coll)
                                                              :name          outer-name
                                                              :content       (format "{{snippet: %s}}" inner-name)}
                       :model/NativeQuerySnippet _free-snip  {:collection_id (:id free-snippet-coll), :content "1 = 1"}
                       :model/Card               policy-a    {:collection_id (:id policy-coll)
                                                              :dataset_query (snippet-query outer)}
                       :model/Card               policy-b    {:collection_id (:id policy-coll)
                                                              :dataset_query (lib/query mp (lib.metadata/card mp (:id source)))}
                       :model/Sandbox            _           {:table_id (mt/id :venues)
                                                              :group_id (:id group-a)
                                                              :card_id  (:id policy-a)}
                       :model/Sandbox            _           {:table_id (mt/id :venues)
                                                              :group_id (:id group-b)
                                                              :card_id  (:id policy-b)}]
          (let [colls {:policy         policy-coll
                       :chain          chain-coll
                       :free           free-coll
                       :policy-snippet policy-snippet-coll
                       :dep-snippet    dep-snippet-coll
                       :free-snippet   free-snippet-coll}]
            (doseq [coll (vals colls)]
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))
            (f colls)))))))

(defn- archive-collection! [coll]
  (collection/archive-collection! (t2/select-one :model/Collection :id (:id coll))))

(defn- archived? [coll]
  (t2/select-one-fn :archived :model/Collection :id (:id coll)))

(deftest archiving-or-deleting-a-collection-respects-the-sandbox-dependency-set-test
  (testing "archiving or deleting a Collection cascades to its Cards and snippets, and the guard fires per row"
    (mt/with-premium-features #{:sandboxes}
      (testing "for a non-admin"
        (with-mixed-policies!
          (fn [{:keys [policy chain free policy-snippet dep-snippet free-snippet]}]
            (mt/with-test-user :rasta
              (doseq [[coll msg] [[policy         card-msg]
                                  [chain          card-msg]
                                  [policy-snippet snippet-msg]
                                  [dep-snippet    snippet-msg]]]
                (testing (str "a Collection with a policy dependency in it: " (:name coll))
                  (testing "archiving is refused and rolled back"
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo msg (archive-collection! coll)))
                    (is (false? (archived? coll)))
                    (is (not-any? :archived (t2/select :model/Card :collection_id (:id coll))))
                    (is (not-any? :archived (t2/select :model/NativeQuerySnippet :collection_id (:id coll)))))
                  (testing "deleting is refused and nothing is deleted"
                    (let [before (+ (t2/count :model/Card :collection_id (:id coll))
                                    (t2/count :model/NativeQuerySnippet :collection_id (:id coll)))]
                      (is (thrown-with-msg? clojure.lang.ExceptionInfo msg (t2/delete! :model/Collection (:id coll))))
                      (is (t2/exists? :model/Collection :id (:id coll)))
                      (is (= before (+ (t2/count :model/Card :collection_id (:id coll))
                                       (t2/count :model/NativeQuerySnippet :collection_id (:id coll)))))))))
              (doseq [coll [free free-snippet]]
                (testing (str "a Collection with no policy dependency in it: " (:name coll))
                  (testing "may be archived"
                    (archive-collection! coll)
                    (is (true? (archived? coll))))
                  (testing "and deleted"
                    (is (= 1 (t2/delete! :model/Collection (:id coll)))))))))))
      (testing "an admin may archive and then delete all of them"
        (with-mixed-policies!
          (fn [colls]
            (mt/with-test-user :crowberto
              (doseq [coll (vals colls)]
                (testing (:name coll)
                  (archive-collection! coll)
                  (is (true? (archived? coll)))))
              (doseq [coll (vals colls)]
                (testing (:name coll)
                  (is (= 1 (t2/delete! :model/Collection (:id coll)))))))))))))
