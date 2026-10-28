(ns metabase-enterprise.sandbox.query-processor.middleware.sandboxing-field-refs-test
  "Field refs in a sandboxed user's query must agree with what the sandbox returns: refs to columns a sandbox leaves
  out are dropped from a projection or refused, refs that would read a sandboxed table outside its sandbox are refused,
  and refs to other tables are kept."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.sandbox.query-processor.middleware.sandboxing-field-refs-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]))

(defn- table-sandbox
  "Row sandbox: VENUES rows with CATEGORY_ID = the user's `cat` attribute (10 rows). Every column is visible."
  []
  {:gtaps      {:venues {:remappings {"cat" [:variable [:field (mt/id :venues :category_id) nil]]}}}
   :attributes {"cat" 50}})

(defn- mbql-card-column-sandbox
  "Column sandbox from an MBQL card: every VENUES row, without NAME and PRICE."
  []
  {:gtaps {:venues {:query (mt/mbql-query venues
                             {:fields [$id $category_id $latitude $longitude]})}}})

(defn- native-card-column-sandbox
  "Row and column sandbox from a native card: VENUES rows with ID < 50, without NAME and PRICE."
  []
  {:gtaps {:venues {:query (mt/native-query
                            {:query "SELECT ID, CATEGORY_ID, LATITUDE, LONGITUDE FROM VENUES WHERE ID < 50"})}}})

(def ^:private policies
  {:table-row-sandbox   {:sandbox-fn table-sandbox,              :hides-columns? false, :restricts-rows? true}
   :mbql-column-sandbox {:sandbox-fn mbql-card-column-sandbox,   :hides-columns? true,  :restricts-rows? false}
   :native-card-sandbox {:sandbox-fn native-card-column-sandbox, :hides-columns? true,  :restricts-rows? true}})

(defn- grant-query-access!
  "Give the sandboxed user's group ordinary query access to CATEGORIES and CHECKINS (neither is sandboxed)."
  [group]
  (doseq [table [:categories :checkins]]
    (data-perms/set-table-permission! group (mt/id table) :perms/view-data :unrestricted)
    (data-perms/set-table-permission! group (mt/id table) :perms/create-queries :query-builder)))

(defn- do-with-each-policy! [f]
  (doseq [[policy-name {:keys [sandbox-fn], :as policy}] policies]
    (testing (str policy-name "\n")
      (met/with-gtaps! (sandbox-fn)
        (grant-query-access! &group)
        (doseq [schema-checks? [true false]]
          (testing (str (if schema-checks? "with" "without") " schema checks\n")
            (if schema-checks?
              (f (assoc policy :schema-checks? schema-checks?))
              (mu/disable-enforcement (f (assoc policy :schema-checks? schema-checks?))))))))))

(defn- run [query]
  (qp/process-query (qp/userland-query query)))

(defn- run-as-admin [query]
  (request/as-admin (run query)))

(defn- col-names [result]
  (mapv :name (mt/cols result)))

(def ^:private refused-hidden-column
  {:status     :failed
   :error_type :missing-required-permissions
   :error      #"(?s).*column you do not have permission.*"})

(def ^:private refused-unsandboxed-ref
  {:status     :failed
   :error_type :invalid-query
   :error      #"(?s).*not reached through its sandbox.*"})

(defn- venues-count
  "Number of VENUES rows the sandboxed user can see."
  []
  (-> (run (mt/mbql-query venues {:aggregation [[:count]]})) mt/rows ffirst))

(deftest positive-control-test
  (do-with-each-policy!
   (fn [{:keys [hides-columns? restricts-rows?]}]
     (let [result (run (mt/mbql-query venues {:order-by [[:asc $id]], :limit 2}))]
       (is (=? {:status :completed} result))
       (is (= (if hides-columns?
                ["ID" "CATEGORY_ID" "LATITUDE" "LONGITUDE"]
                ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"])
              (col-names result))))
     (when restricts-rows?
       (testing "the sandbox restricts rows"
         (is (< (venues-count) 100)))))))

(deftest implicit-join-out-of-sandboxed-table-keeps-column-test
  (testing "A column of another table, reached through an implicit join from the sandboxed table, is kept"
    (do-with-each-policy!
     (fn [_]
       (let [query  (mt/mbql-query venues {:fields   [$id $category_id->categories.name]
                                           :order-by [[:asc $id]]
                                           :limit    3})
             result (run query)]
         (is (=? {:status :completed} result))
         (is (= 2 (count (col-names result))))
         (testing "values match what an admin gets for the same venues"
           (let [ids      (map first (mt/rows result))
                 expected (into {} (map (juxt first second)) (mt/rows (run-as-admin (mt/mbql-query venues {:fields [$id $category_id->categories.name]}))))]
             (is (= (map expected ids)
                    (map second (mt/rows result)))))))))))

(deftest implicit-join-filter-out-of-sandboxed-table-test
  (testing "Filters and breakouts through an implicit join out of the sandboxed table keep working"
    (do-with-each-policy!
     (fn [_]
       (is (=? {:status :completed}
               (run (mt/mbql-query venues {:aggregation [[:count]]
                                           :breakout    [$category_id->categories.name]}))))
       (is (=? {:status :completed}
               (run (mt/mbql-query venues {:aggregation [[:count]]
                                           :filter      [:= $category_id->categories.name "Burger"]}))))))))

(deftest field-id-of-sandboxed-table-without-join-is-refused-test
  (testing "A field id of the sandboxed table in a query on another table, with no join, is refused"
    (do-with-each-policy!
     (fn [_]
       (testing "positive control"
         (is (=? {:status :completed}
                 (run (mt/mbql-query checkins {:fields [$id $venue_id->venues.latitude], :limit 2})))))
       (testing "in :fields"
         (is (=? refused-unsandboxed-ref
                 (run (mt/mbql-query checkins {:fields [$id [:field (mt/id :venues :latitude) nil]], :limit 2})))))
       (testing "in a filter"
         (is (=? refused-unsandboxed-ref
                 (run (mt/mbql-query checkins {:aggregation [[:count]]
                                               :filter      [:> [:field (mt/id :venues :latitude) nil] 0]})))))))))

(deftest bogus-join-alias-is-refused-test
  (testing "A ref to the sandboxed table with a join alias that names no join is refused"
    (do-with-each-policy!
     (fn [{:keys [schema-checks?]}]
       (testing "in an explicit join condition"
         (is (=? refused-unsandboxed-ref
                 (run (mt/mbql-query checkins
                        {:joins  [{:source-table $$venues
                                   :alias        "v"
                                   :condition    [:= $venue_id [:field (mt/id :venues :id) {:join-alias "Bogus"}]]
                                   :fields       :none}]
                         :fields [$id]
                         :limit  2})))))
       ;; the parameter schema rejects this target when schema checks are on, so check production mode only
       (when-not schema-checks?
         (testing "in a parameter target"
           (is (=? refused-unsandboxed-ref
                   (run (assoc (mt/mbql-query checkins {:aggregation [[:count]]})
                               :parameters [{:type   :category
                                             :value  [10.0]
                                             :target [:dimension [:field (mt/id :venues :latitude)
                                                                  {:join-alias "Venues"}]]}]))))))))))

(deftest hidden-column-is-refused-outside-fields-test
  (testing "A column the sandbox leaves out is refused wherever it would decide which rows come back"
    (do-with-each-policy!
     (fn [{:keys [hides-columns?]}]
       (doseq [[clause query] {:filter      (mt/mbql-query venues {:aggregation [[:count]], :filter [:> $price 2]})
                               :breakout    (mt/mbql-query venues {:aggregation [[:count]], :breakout [$price]})
                               :aggregation (mt/mbql-query venues {:aggregation [[:sum $price]]})
                               :order-by    (mt/mbql-query venues {:fields [$id], :order-by [[:asc $price]], :limit 2})
                               :expression  (mt/mbql-query venues {:expressions {"p" [:+ $price 1]}
                                                                   :fields      [$id [:expression "p"]]
                                                                   :limit       2})
                               :name-ref    (mt/mbql-query venues {:aggregation [[:count]]
                                                                   :filter      [:= [:field "NAME" {:base-type :type/Text}] "Bird's Nest"]})
                               :implicit-join-filter
                               (mt/mbql-query checkins {:aggregation [[:count]], :filter [:> $venue_id->venues.price 2]})
                               :explicit-join-condition
                               (mt/mbql-query checkins {:joins  [{:source-table $$venues
                                                                  :alias        "v"
                                                                  :condition    [:= $id &v.venues.price]
                                                                  :fields       :none}]
                                                        :fields [$id]
                                                        :limit  2})
                               :later-stage
                               (mt/mbql-query venues {:source-query {:source-table $$venues}
                                                      :aggregation  [[:count]]
                                                      :filter       [:> [:field "PRICE" {:base-type :type/Integer}] 2]})}]
         (testing clause
           (if hides-columns?
             (is (=? refused-hidden-column (run query)))
             (is (=? {:status :completed} (run query))))))))))

(deftest hidden-column-is-dropped-from-fields-test
  (testing "A column the sandbox leaves out is dropped from a projection, like a view would"
    (do-with-each-policy!
     (fn [{:keys [hides-columns?]}]
       (doseq [[shape query expected-cols]
               [[:field-id (mt/mbql-query venues {:fields [$id $price], :limit 2}) ["ID" "PRICE"]]
                [:implicit-join (mt/mbql-query checkins {:fields [$id $venue_id->venues.price], :limit 2}) ["ID" "PRICE"]]
                [:explicit-join (mt/mbql-query checkins {:joins  [{:source-table $$venues
                                                                   :alias        "v"
                                                                   :condition    [:= $venue_id &v.venues.id]
                                                                   :fields       [&v.venues.id &v.venues.price]}]
                                                         :fields [$id]
                                                         :limit  2})
                 ["ID" "ID_2" "PRICE"]]]]
         (testing shape
           (let [result (run query)]
             (is (=? {:status :completed} result))
             (is (= (if hides-columns?
                      (vec (remove #{"PRICE"} expected-cols))
                      expected-cols)
                    (col-names result))))))))))

(deftest name-ref-does-not-fall-back-to-joined-column-test
  (testing "A name ref to a hidden column does not resolve to a same-named column of a joined table"
    (do-with-each-policy!
     (fn [{:keys [hides-columns?]}]
       (let [query  (mt/mbql-query venues {:fields   [$id [:field "NAME" {:base-type :type/Text}] $category_id->categories.id]
                                           :order-by [[:asc $id]]
                                           :limit    3})
             result (run query)]
         (is (=? {:status :completed} result))
         (if hides-columns?
           (testing "the hidden column is dropped and no category name takes its place"
             (is (= 2 (count (col-names result))))
             (is (not-any? string? (mapcat identity (mt/rows result)))))
           (testing "the venue's own NAME comes back"
             (let [id->name (into {} (mt/rows (run-as-admin (mt/mbql-query venues {:fields [$id $name]}))))]
               (is (= (map (comp id->name first) (mt/rows result))
                      (map second (mt/rows result))))))))))))

(deftest saved-question-model-and-nested-query-over-sandboxed-table-test
  (testing "Queries over a saved question, model, or nested query on the sandboxed table run"
    (do-with-each-policy!
     (fn [{:keys [hides-columns?]}]
       (let [expected (if hides-columns?
                        ["ID" "CATEGORY_ID" "LATITUDE" "LONGITUDE"]
                        ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"])]
         (testing "nested query"
           (let [result (run (mt/mbql-query venues {:source-query {:source-table $$venues}, :limit 2}))]
             (is (=? {:status :completed} result))
             (is (= expected (col-names result)))))
         (doseq [card-type [:question :model]]
           (testing card-type
             (let [base   (mt/metadata-provider)
                   mp     (lib.tu/metadata-provider-with-card-from-query
                           base 1 (lib/query base (lib.metadata/table base (mt/id :venues))) {:type card-type})
                   result (run (lib/query mp (lib.metadata/card mp 1)))]
               (is (=? {:status :completed} result))
               (is (= expected (col-names result)))))))))))

(deftest permission-check-refuses-sandboxed-table-outside-sandbox-test
  (testing "The permission check refuses a query that reads a sandboxed table outside its sandbox"
    (do-with-each-policy!
     (fn [_]
       (let [query (mt/mbql-query venues {:fields [$id], :order-by [[:asc $id]], :limit 2})]
         (testing "positive control"
           (is (=? {:status :completed} (run query))))
         (testing "when preprocessing leaves the sandboxed table in place"
           (mt/with-dynamic-fn-redefs [qp.middleware.enterprise/apply-sandboxing identity]
             (is (=? {:status     :failed
                      :error_type :missing-required-permissions}
                     (run query)))
             (testing "admins are not affected"
               (is (=? {:status :completed} (run-as-admin query))))
             (testing "in a join"
               (is (=? {:status     :failed
                        :error_type :missing-required-permissions}
                       (run (mt/mbql-query checkins {:joins  [{:source-table $$venues
                                                               :alias        "v"
                                                               :condition    [:= $venue_id &v.venues.id]
                                                               :fields       :none}]
                                                     :fields [$id]
                                                     :limit  2})))))
             (testing "tables without an enforced sandbox are not affected"
               (is (=? {:status :completed}
                       (run (mt/mbql-query checkins {:fields [$id], :limit 2}))))))))))))
