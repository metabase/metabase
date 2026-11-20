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

(deftest inactive-or-sensitive-column-test
  (testing (str "A column that is inactive, or \"Do not include\" and not returned by the sandbox, is dropped from a"
                " projection and refused elsewhere, including inside a saved question")
    (doseq [[state field-props] {:inactive  {:active false}
                                 :sensitive {:visibility-type :sensitive}}]
      (testing state
        (do-with-each-policy!
         (fn [_]
           (let [base         (mt/metadata-provider)
                 venues       (lib.metadata/table base (mt/id :venues))
                 id-col       (lib.metadata/field base (mt/id :venues :id))
                 price        (lib.metadata/field base (mt/id :venues :price))
                 fields-query (-> (lib/query base venues)
                                  (lib/with-fields [id-col price])
                                  (lib/order-by id-col)
                                  (lib/limit 2))
                 filter-query (-> (lib/query base venues)
                                  (lib/aggregate (lib/count))
                                  (lib/filter (lib/> price 2)))
                 mp           (as-> base mp
                                (lib.tu/metadata-provider-with-card-from-query mp 1 fields-query)
                                (lib.tu/metadata-provider-with-card-from-query mp 2 filter-query)
                                (lib.tu/merged-mock-metadata-provider
                                 mp {:fields [(merge {:id (mt/id :venues :price)} field-props)]}))
                 card-query   #(lib/query mp (lib.metadata/card mp %))]
             (doseq [[shape query] (cond-> {:saved-question (card-query 1)}
                                     ;; an ad-hoc ref to a sensitive column is refused before sandboxing runs
                                     (= state :inactive) (assoc :ad-hoc (assoc fields-query :lib/metadata mp)))]
               (testing shape
                 (let [result (run query)]
                   (is (=? {:status :completed} result))
                   (is (= ["ID"] (col-names result))))))
             (testing "in a filter of a saved question"
               (is (=? refused-hidden-column (run (card-query 2)))))
             (testing "in an ad-hoc filter"
               (is (=? {:status :failed} (run (assoc filter-query :lib/metadata mp))))))))))))

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
                           ;; an id no real Card has, so it cannot stand in for the sandbox's own Card
                           base Integer/MAX_VALUE (lib/query base (lib.metadata/table base (mt/id :venues))) {:type card-type})
                   result (run (lib/query mp (lib.metadata/card mp Integer/MAX_VALUE)))]
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

(defn- saved-question
  "A query whose source is a saved question with `legacy-query` as its query."
  [legacy-query]
  (let [base (mt/metadata-provider)
        mp   (lib.tu/metadata-provider-with-mock-card
              base
              {:lib/type      :metadata/card
               :id            Integer/MAX_VALUE
               :database-id   (mt/id)
               :name          "Legacy question"
               :dataset-query legacy-query})]
    (lib/query mp (lib.metadata/card mp Integer/MAX_VALUE))))

(deftest bad-field-id-ref-to-joined-sandboxed-table-test
  (testing (str "A field id ref to an explicitly joined sandboxed table that lacks its join alias (which"
                " `fix-bad-field-id-refs` repairs) works like the repaired ref")
    (do-with-each-policy!
     (fn [{:keys [hides-columns?]}]
       (let [join          {:source-table (mt/id :venues)
                            :alias        "v"
                            :condition    [:= [:field (mt/id :checkins :venue_id) nil]
                                           [:field (mt/id :venues :id) {:join-alias "v"}]]
                            :fields       :none}
             latitude      [:field (mt/id :venues :latitude) nil]
             price         [:field (mt/id :venues :price) nil]
             fields-query  (mt/mbql-query checkins {:joins    [join]
                                                    :fields   [$id latitude]
                                                    :order-by [[:asc $id]]
                                                    :limit    3})
             filter-query  (mt/mbql-query checkins {:joins       [join]
                                                    :aggregation [[:count]]
                                                    :filter      [:> latitude 0]})
             fixed-query   (mt/mbql-query checkins {:joins    [join]
                                                    :fields   [$id [:field (mt/id :venues :latitude) {:join-alias "v"}]]
                                                    :order-by [[:asc $id]]
                                                    :limit    3})]
         (testing "admin: the ref is repaired"
           (is (= (mt/rows (run-as-admin fixed-query))
                  (mt/rows (run-as-admin fields-query)))))
         (doseq [[shape wrap] {:ad-hoc identity, :saved-question saved-question}]
           (testing shape
             (testing "exposed column in :fields"
               (let [result (run (wrap fields-query))]
                 (is (=? {:status :completed} result))
                 (is (= (mt/rows (run fixed-query))
                        (mt/rows result)))))
             (testing "exposed column in a filter"
               (is (=? {:status :completed} (run (wrap filter-query)))))
             (testing "hidden column in :fields"
               (let [result (run (wrap (assoc-in fields-query [:query :fields] [[:field (mt/id :checkins :id) nil] price])))]
                 (is (=? {:status :completed} result))
                 (is (= (if hides-columns? ["ID"] ["ID" "PRICE"])
                        (col-names result)))))
             (testing "hidden column in a filter"
               (let [result (run (wrap (assoc-in filter-query [:query :filter] [:> price 2])))]
                 (if hides-columns?
                   (is (=? refused-hidden-column result))
                   (is (=? {:status :completed} result))))))))))))

(deftest bad-field-id-ref-to-source-query-join-test
  (testing (str "A field id ref in a later stage to a column of a sandboxed table joined in the source query (which"
                " `fix-bad-field-id-refs` repairs into a name ref) works like the repaired ref")
    (do-with-each-policy!
     (fn [{:keys [hides-columns?]}]
       (let [source  {:source-table (mt/id :checkins)
                      :joins        [{:source-table (mt/id :venues)
                                      :alias        "v"
                                      :condition    [:= [:field (mt/id :checkins :venue_id) nil]
                                                     [:field (mt/id :venues :id) {:join-alias "v"}]]
                                      :fields       :all}]}
             query   (mt/mbql-query nil {:source-query source
                                         :aggregation  [[:count]]
                                         :breakout     [[:field (mt/id :venues :latitude) nil]]
                                         :order-by     [[:asc [:field (mt/id :venues :latitude) nil]]]
                                         :limit        3})
             hidden  (mt/mbql-query nil {:source-query source
                                         :aggregation  [[:count]]
                                         :breakout     [[:field (mt/id :venues :price) nil]]})]
         (testing "admin"
           (is (=? {:status :completed} (run-as-admin query))))
         (doseq [[shape wrap] {:ad-hoc identity, :saved-question saved-question}]
           (testing shape
             (testing "exposed column"
               (is (=? {:status :completed} (run (wrap query)))))
             (testing "hidden column"
               (if hides-columns?
                 (is (=? {:status :failed} (run (wrap hidden))))
                 (is (=? {:status :completed} (run (wrap hidden)))))))))))))

(defn- venue-names
  "Every VENUES.NAME value the current user gets from VENUES (all of them for an admin)."
  []
  (into #{} (map first) (mt/rows (run (mt/mbql-query venues {:fields [$name]})))))

(deftest external-remap-to-hidden-column-test
  (testing "An FK whose external remap targets a sandboxed table never returns values the sandbox hides"
    (do-with-each-policy!
     (fn [{:keys [hides-columns?]}]
       (let [mp        (lib.tu/remap-metadata-provider (mt/metadata-provider)
                                                       (mt/id :checkins :venue_id)
                                                       (mt/id :venues :name))
             all-names (request/as-admin (venue-names))]
         (doseq [[shape query] {:fields   (mt/mbql-query checkins {:fields   [$id $venue_id]
                                                                   :order-by [[:asc $id]]
                                                                   :limit    3})
                                :breakout (mt/mbql-query checkins {:aggregation [[:count]]
                                                                   :breakout    [$venue_id]
                                                                   :limit       3})
                                :order-by (mt/mbql-query checkins {:fields   [$id $venue_id]
                                                                   :order-by [[:asc $venue_id] [:asc $id]]
                                                                   :limit    3})}]
           (testing shape
             (testing "admin gets the remapped column"
               (let [result (run-as-admin (lib/query mp query))]
                 (is (=? {:status :completed} result))
                 (is (some all-names (mapcat identity (mt/rows result))))))
             (let [result (run (lib/query mp query))
                   values (set (mapcat identity (get-in result [:data :rows])))]
               (if hides-columns?
                 ;; the query fails here (on master too); ideally it would run without the remap
                 (testing "no value of the hidden column comes back"
                   (is (not-any? all-names values)))
                 (testing "the remap only shows names of venues the sandbox returns"
                   (is (=? {:status :completed} result))
                   (is (some #{"NAME"} (col-names result)))
                   (is (empty? (remove (venue-names) (filter all-names values))))))))))))))

(deftest external-remap-of-hidden-fk-column-test
  (testing "A column the sandbox hides that has an external remap is not remapped, so neither it nor its remap comes back"
    (do-with-each-policy!
     (fn [{:keys [hides-columns?]}]
       (let [mp    (-> (mt/metadata-provider)
                       (lib.tu/merged-mock-metadata-provider
                        {:fields [{:id                 (mt/id :venues :price)
                                   :semantic-type      :type/FK
                                   :fk-target-field-id (mt/id :categories :id)}]})
                       (lib.tu/remap-metadata-provider (mt/id :venues :price) (mt/id :categories :name)))
             query (mt/mbql-query venues {:fields [$id $price], :order-by [[:asc $id]], :limit 3})]
         (testing "admin gets the remapped column"
           (is (= ["ID" "PRICE" "NAME"] (col-names (run-as-admin (lib/query mp query))))))
         (let [result (run (lib/query mp query))]
           (is (=? {:status :completed} result))
           ;; the remapped column comes back as NAME_2 for a sandboxed user
           (is (=? (if hides-columns? ["ID"] ["ID" "PRICE" #"NAME.*"])
                   (col-names result)))))))))
