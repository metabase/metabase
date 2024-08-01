(ns metabase.lib.filter-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.operator :as lib.filter.operator]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.matrix :as matrix]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- test-clause [result-filter f & args]
  (is (=? result-filter
          (apply f args))))

(deftest ^:parallel general-filter-clause-test
  (let [q2                          (lib.tu/query-with-stage-metadata-from-card meta/metadata-provider (:venues lib.tu/mock-cards))
        venues-category-id-metadata (meta/field-metadata :venues :category-id)
        venues-name-metadata        (meta/field-metadata :venues :name)
        venues-latitude-metadata    (meta/field-metadata :venues :latitude)
        venues-longitude-metadata   (meta/field-metadata :venues :longitude)
        categories-id-metadata      (lib.metadata/stage-column q2 -1 "ID")
        checkins-date-metadata      (meta/field-metadata :checkins :date)]
    (testing "comparisons"
      (doseq [[op f] [[:=  lib/=]
                      [:!= lib/!=]
                      [:<  lib/<]
                      [:<= lib/<=]
                      [:>  lib/>]
                      [:>= lib/>=]]]
        (test-clause
         [op
          {:lib/uuid string?}
          [:field {:lib/uuid string?} (meta/id :venues :category-id)]
          [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]
         f
         venues-category-id-metadata
         categories-id-metadata)))

    (testing "between"
      (test-clause
       [:between
        {:lib/uuid string?}
        [:field {:lib/uuid string?} (meta/id :venues :category-id)]
        42
        [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]
       lib/between
       venues-category-id-metadata
       42
       categories-id-metadata))

    (testing "inside"
      (test-clause
       [:inside
        {:lib/uuid string?}
        [:field {:base-type :type/Float, :lib/uuid string?} (meta/id :venues :latitude)]
        [:field {:base-type :type/Float, :lib/uuid string?} (meta/id :venues :longitude)]
        42.7 13 4 27.3]
       lib/inside
       venues-latitude-metadata
       venues-longitude-metadata
       42.7 13 4 27.3))

    (testing "emptiness"
      (doseq [[op f] [[:is-null   lib/is-null]
                      [:not-null  lib/not-null]
                      [:is-empty  lib/is-empty]
                      [:not-empty lib/not-empty]]]
        (test-clause
         [op
          {:lib/uuid string?}
          [:field {:lib/uuid string?} (meta/id :venues :name)]]
         f
         venues-name-metadata)))

    (testing "string tests"
      (doseq [[op f] [[:starts-with      lib/starts-with]
                      [:ends-with        lib/ends-with]
                      [:contains         lib/contains]
                      [:does-not-contain lib/does-not-contain]]]
        (test-clause
         [op
          {:lib/uuid string?}
          [:field {:lib/uuid string?} (meta/id :venues :name)]
          "part"]
         f
         venues-name-metadata
         "part")))

    (testing "time-interval"
      (test-clause
       [:time-interval
        {:lib/uuid string?}
        [:field {:base-type :type/Date, :lib/uuid string?} (meta/id :checkins :date)]
        3
        :day]
       lib/time-interval
       checkins-date-metadata
       3
       :day))

    (testing "segment"
      (let [id 7]
        (test-clause
         [:segment {:lib/uuid string?} id]
         lib/segment
         id)))))

(deftest ^:parallel filter-test
  (let [q1                          (lib/query meta/metadata-provider (meta/table-metadata :categories))
        q2                          (lib.tu/query-with-stage-metadata-from-card meta/metadata-provider (:venues lib.tu/mock-cards))
        venues-category-id-metadata (meta/field-metadata :venues :category-id)
        original-filter
        [:between
         {:lib/uuid string?}
         [:field {:base-type :type/Integer :lib/uuid string?} (meta/id :venues :category-id)]
         42
         100]
        simple-filtered-query
        {:lib/type :mbql/query
         :database (meta/id)
         :stages [{:lib/type :mbql.stage/mbql
                   :source-table (meta/id :categories)
                   :filters [original-filter]}]}]
    (testing "no filter"
      (is (nil? (lib/filters q2))))

    (testing "setting a simple filter via the helper function"
      (let [result-query
            (lib/filter q1 (lib/between venues-category-id-metadata 42 100))
            result-filter original-filter]
        (is (=? simple-filtered-query
                (dissoc result-query :lib/metadata)))
        (testing "and getting the current filter"
          (is (=? [result-filter]
                  (lib/filters result-query))))))

    (testing "setting a simple filter expression"
      (is (=? simple-filtered-query
              (-> q1
                  (lib/filter {:operator :between
                               :lib/type :lib/external-op
                               :args [(lib/ref venues-category-id-metadata) 42 100]})
                  (dissoc :lib/metadata)))))))

(deftest ^:parallel add-filter-test
  (let [simple-query         (lib/query meta/metadata-provider (meta/table-metadata :categories))
        venues-name-metadata (meta/field-metadata :venues :name)
        first-filter         [:between
                              {:lib/uuid string?}
                              [:field
                               {:base-type :type/Integer, :lib/uuid string?}
                               (meta/id :venues :category-id)]
                              42
                              100]
        first-result-filter  first-filter
        second-filter        [:starts-with
                              {:lib/uuid string?}
                              [:field {:base-type :type/Text, :lib/uuid string?} (meta/id :venues :name)]
                              "prefix"]
        second-result-filter second-filter
        third-filter         [:contains
                              {:lib/uuid string?}
                              [:field {:base-type :type/Text, :lib/uuid string?} (meta/id :venues :name)]
                              "part"]
        third-result-filter  third-filter
        first-add            (lib/filter simple-query
                                         (lib/between
                                          (meta/field-metadata :venues :category-id)
                                          42
                                          100))
        filtered-query       (assoc-in simple-query [:stages 0 :filters] [first-filter])
        second-add           (lib/filter first-add {:operator "starts-with"
                                                    :lib/type :lib/external-op
                                                    :args [(lib/ref venues-name-metadata) "prefix"]})
        and-query            (assoc-in filtered-query
                                       [:stages 0 :filters]
                                       [first-filter second-filter])
        third-add            (lib/filter second-add {:operator :contains
                                                     :lib/type :lib/external-op
                                                     :args [(lib/ref venues-name-metadata) "part"]})
        extended-and-query   (assoc-in filtered-query
                                       [:stages 0 :filters]
                                       [first-filter
                                        second-filter
                                        [:contains
                                         {:lib/uuid string?}
                                         [:field {:base-type :type/Text, :lib/uuid string?} (meta/id :venues :name)]
                                         "part"]])]
    (testing "adding an initial filter"
      (is (=? filtered-query first-add))
      (is (=? [first-result-filter]
              (lib/filters first-add))))
    (testing "conjoining to filter"
      (is (=? and-query second-add))
      (is (=? [first-result-filter second-result-filter]
              (lib/filters second-add))))
    (testing "conjoining to conjunction filter"
      (is (=? extended-and-query third-add))
      (is (=? [first-result-filter second-result-filter third-result-filter]
              (lib/filters third-add))))))

(deftest ^:parallel ends-with-display-name-test
  (testing "#29947"
    (is (= "Name ends with t"
           (lib/display-name
            lib.tu/venues-query
            [:ends-with
             {:lib/uuid "953597df-a96d-4453-a57b-665e845abc69"}
             [:field {:lib/uuid "be28f393-538a-406b-90da-bac5f8ef565e"} (meta/id :venues :name)]
             "t"])))))

(deftest ^:parallel filterable-columns-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :users))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :checkins)
                                                 [(lib/=
                                                   (meta/field-metadata :checkins :user-id)
                                                   (meta/field-metadata :users :id))])
                                (lib/with-join-fields :all)))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :venues)
                                                 [(lib/=
                                                   (meta/field-metadata :checkins :venue-id)
                                                   (meta/field-metadata :venues :id))])
                                (lib/with-join-fields :all))))
        columns (lib/filterable-columns query)
        pk-operators [:= :!= :> :< :between :>= :<= :is-null :not-null]
        temporal-operators [:!= := :< :> :between :is-null :not-null]
        coordinate-operators [:= :!= :inside :> :< :between :>= :<=]
        text-operators [:= :!= :contains :does-not-contain :is-empty :not-empty :starts-with :ends-with]]
    (is (= ["ID"
            "NAME"
            "LAST_LOGIN"
            "Checkins__ID"
            "Checkins__DATE"
            "Checkins__USER_ID"
            "Checkins__VENUE_ID"
            "Venues__ID"
            "Venues__NAME"
            "Venues__CATEGORY_ID"
            "Venues__LATITUDE"
            "Venues__LONGITUDE"
            "Venues__PRICE"
            "CATEGORIES__via__CATEGORY_ID__ID"
            "CATEGORIES__via__CATEGORY_ID__NAME"]
           (map :lib/desired-column-alias columns)))
    (testing "Operators are attached to proper columns"
      (is (=? {"ID" pk-operators,
               "NAME" text-operators,
               "Venues__PRICE" pk-operators
               "Venues__LATITUDE" coordinate-operators
               "LAST_LOGIN" temporal-operators}
              (into {} (for [col columns]
                         [(:lib/desired-column-alias col) (mapv :short (lib/filterable-column-operators col))])))))
    (testing "Type specific display names"
      (let [display-info-by-type-and-op (->> columns
                                             (map (juxt :lib/desired-column-alias
                                                        (fn [col]
                                                          (->> col
                                                               lib/filterable-column-operators
                                                               (map (comp (juxt :short-name identity)
                                                                          #(lib/display-info query %)))
                                                               (into {})))))
                                             (into {}))]
        (is (=? {"ID"            {"="       {:display-name "=", :long-display-name "Is"}
                                  "is-null" {:display-name "Is empty", :long-display-name "Is empty"}
                                  ">"       {:display-name ">", :long-display-name "Greater than"}
                                  ">="      {:display-name "≥", :long-display-name "Greater than or equal to"},}
                 "NAME"          {"="        {:display-name "=", :long-display-name "Is"}
                                  "is-empty" {:display-name "Is empty", :long-display-name "Is empty"}}
                 "LAST_LOGIN"    {"!=" {:display-name "≠", :long-display-name "Excludes"}
                                  ">"  {:display-name ">", :long-display-name "After"}}
                 "Venues__PRICE" {"="       {:display-name "=", :long-display-name "Equal to"}
                                  "is-null" {:display-name "Is empty", :long-display-name "Is empty"}}}
                display-info-by-type-and-op))))))

(deftest ^:parallel filterable-columns-excludes-offset-expressions-test
  (testing "filterable-columns should exclude expressions which contain :offset"
    (let [query (-> lib.tu/venues-query
                    (lib/order-by (meta/field-metadata :venues :id) :asc)
                    (lib/expression "Offset col"    (lib/offset (meta/field-metadata :venues :price) -1))
                    (lib/expression "Nested Offset"
                                    (lib/* 100 (lib/offset (meta/field-metadata :venues :price) -1))))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:id (meta/id :categories :id) :name "ID"}
                 {:id (meta/id :categories :name) :name "NAME"}]
                (lib/filterable-columns query)))))))

(deftest ^:parallel filter-clause-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :users)))
        [first-col] (lib/filterable-columns query)
        new-filter (lib/filter-clause
                    (first (lib/filterable-column-operators first-col))
                    first-col
                    515)]
    (is (=? [[:= {} [:field {} (meta/id :users :id)] 515]]
            (-> query
                (lib/filter new-filter)
                lib/filters))))
  (testing "standalone clause"
    (let [query lib.tu/venues-query
          [id-col] (lib/filterable-columns query)
          [eq-op] (lib/filterable-column-operators id-col)
          filter-clause (lib/filter-clause eq-op id-col 123)]
      (is (=? [:= {} [:field {} (meta/id :venues :id)] 123]
              filter-clause)))))

(deftest ^:parallel filter-clause-support-keywords-and-strings-test
  (are [tag] (=? [:= {} [:field {} (meta/id :venues :id)] 1]
                 (lib/filter-clause tag (meta/field-metadata :venues :id) 1))
    :=
    "="))

(deftest ^:parallel filter-operator-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :users))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :checkins)
                                                 [(lib/=
                                                   (meta/field-metadata :checkins :user-id)
                                                   (meta/field-metadata :users :id))])
                                (lib/with-join-fields :all)))
                  (lib/join (-> (lib/join-clause (meta/table-metadata :venues)
                                                 [(lib/=
                                                   (meta/field-metadata :checkins :venue-id)
                                                   (meta/field-metadata :venues :id))])
                                (lib/with-join-fields :all))))]
    (doseq [col (lib/filterable-columns query)
            op (lib/filterable-column-operators col)
            :let [filter-clause (case (:short op)
                                  :between (lib/filter-clause op col col col)
                                  (:contains :does-not-contain :starts-with :ends-with) (lib/filter-clause op col "123")
                                  (:is-null :not-null :is-empty :not-empty) (lib/filter-clause op col)
                                  :inside (lib/filter-clause op col 12 34 56 78 90)
                                  (:< :>) (lib/filter-clause op col col)
                                  (lib/filter-clause op col 123))]]
      (testing (str (:short op) " with " (lib.types.isa/field-type col))
        (is (= op
               (lib/filter-operator query filter-clause)))))))

(deftest ^:parallel filter-operators-test
  (testing "Boolean category"
    (is (= [{:lib/type :operator/filter, :short :=, :display-name-variant :default}
            {:lib/type :operator/filter, :short :is-null, :display-name-variant :is-empty}
            {:lib/type :operator/filter, :short :not-null, :display-name-variant :not-empty}]
           (lib.filter.operator/filter-operators
             {:description nil,
              :lib/type :metadata/column,
              :base-type :type/Boolean,
              :semantic-type :type/Category,
              :table-id 7,
              :name "TRIAL_CONVERTED",
              :coercion-strategy nil,
              :lib/source :source/table-defaults,
              :lib/source-column-alias "TRIAL_CONVERTED",
              :settings nil,
              :lib/source-uuid "ad9a276f-3af8-4e5a-b17e-d8170273ec0a",
              :nfc-path nil,
              :database-type "BOOLEAN",
              :effective-type :type/Boolean,
              :fk-target-field-id nil,
              :id 14,
              :parent-id nil,
              :visibility-type :normal,
              :lib/desired-column-alias "TRIAL_CONVERTED",
              :display-name "Trial Converted",
              :position 10,
              :fingerprint {:global {:distinct-count 2, :nil% 0.0}}}))))
  (testing "should return text-like operators for text-like PKs and FKs"
    (doseq [semantic-type [:type/PK :type/FK]
            :let [column {:description nil,
                          :lib/type :metadata/column,
                          :base-type :type/MongoBSONID,
                          :semantic-type semantic-type
                          :table-id 7,
                          :name "ID",
                          :coercion-strategy nil,
                          :lib/source :source/table-defaults,
                          :lib/source-column-alias "ID",
                          :settings nil,
                          :lib/source-uuid "ad9a276f-3af8-4e5a-b17e-d8170273ec0a",
                          :nfc-path nil,
                          :database-type "STRING",
                          :effective-type :type/MongoBSONID,
                          :fk-target-field-id nil,
                          :id 14,
                          :parent-id nil,
                          :visibility-type :normal,
                          :lib/desired-column-alias "ID",
                          :display-name "ID",
                          :position 10}]]
        (is (= [:= :!= :is-empty :not-empty]
               (mapv :short (lib.filter.operator/filter-operators column)))))))

(deftest ^:parallel replace-filter-clause-test
  (testing "Make sure we are able to replace a filter clause using the lib functions for manipulating filters."
    (let [query           (lib/query meta/metadata-provider (meta/table-metadata :users))
          [first-col]     (lib/filterable-columns query)
          query           (lib/filter query (lib/filter-clause
                                              (first (lib/filterable-column-operators first-col))
                                              first-col
                                              515))
          [filter-clause] (lib/filters query)
          external-op     (lib/external-op filter-clause)]
      (is (=? {:stages [{:filters [[:= {} [:field {} (meta/id :users :id)] 515]]}]}
              query))
      (is (=? [:= {} [:field {} (meta/id :users :id)] 515]
              filter-clause))
      (is (=? {:operator "="
               :lib/type :lib/external-op
               :args     [[:field {} (meta/id :users :id)]
                          515]}
              external-op))
      (let [external-op' (assoc external-op :operator "!=")
            query'       (lib/replace-clause query filter-clause external-op')]
        (is (=? {:stages [{:filters [[:!= {} [:field {} (meta/id :users :id)] 515]]}]}
                query'))))))

(deftest ^:parallel find-filter-for-legacy-filter-test
  (testing "existing clauses"
    (let [query           (-> (lib/query meta/metadata-provider (meta/table-metadata :users))
                              (lib/expression "expr" (lib/absolute-datetime "2020" :month)))
          filterable-cols (lib/filterable-columns query)
          [first-col]     filterable-cols
          expr-col        (m/find-first #(= (:name %) "expr") (lib/filterable-columns query))
          first-filter    (lib/filter-clause
                           (first (lib/filterable-column-operators first-col))
                           first-col
                           515)
          query           (->  query
                               (lib/filter first-filter)
                               (lib/filter (lib/filter-clause
                                            (first (lib/filterable-column-operators expr-col))
                                            expr-col
                                            (meta/field-metadata :users :last-login))))
          filter-clauses  (lib/filters query)]
      (testing "existing clauses"
        (doseq [filter-clause filter-clauses
                :let          [legacy-clause (lib.convert/->legacy-MBQL filter-clause)]
                legacy-clause [legacy-clause
                               (update legacy-clause 0 u/qualified-name)]]
          (testing (pr-str legacy-clause)
            (is (= filter-clause
                   (lib/find-filter-for-legacy-filter query legacy-clause))))))
      (testing "missing clause"
        (let [filter-clause (assoc first-filter 2 43)]
          (is (nil? (lib/find-filter-for-legacy-filter query (lib.convert/->legacy-MBQL filter-clause))))))
      (testing "ambiguous match"
        ;; don't use lib/filter because it will ignore duplicate filters.
        (let [query (lib.util/update-query-stage query -1 update :filters conj (lib.util/fresh-uuids first-filter))]
          (is (thrown-with-msg?
               #?(:clj Exception :cljs :default) #"Multiple matching filters found"
               (lib/find-filter-for-legacy-filter query (lib.convert/->legacy-MBQL (first filter-clauses))))))))))

(deftest ^:parallel find-filterable-column-for-legacy-ref-test
  (let [query (lib/filter lib.tu/venues-query (lib/= (meta/field-metadata :venues :name) "BBQ"))]
    (are [legacy-ref] (=? {:name      "NAME"
                           :id        (meta/id :venues :name)
                           :operators seq}
                          (lib/find-filterable-column-for-legacy-ref query legacy-ref))
      [:field (meta/id :venues :name) nil]
      [:field (meta/id :venues :name) {}]
      ["field" (meta/id :venues :name) nil]
      #?@(:cljs
          [#js ["field" (meta/id :venues :name) nil]
           #js ["field" (meta/id :venues :name) #js {}]]))))

(def ^:private last-online-time
  (assoc (meta/field-metadata :people :birth-date)
         :display-name   "Last Online Time"
         :base-type      :type/Time
         :effective-type :type/Time
         :semantic-type  :type/Time))

(def ^:private is-active
  (assoc (meta/field-metadata :orders :discount)
         :display-name   "Is Active"
         :base-type      :type/Boolean
         :effective-type :type/Boolean
         :semantic-type  :type/Boolean))

(defn- check-display-names [tests]
  (let [metadata-provider (lib/composed-metadata-provider
                            (lib.tu/mock-metadata-provider
                              {:fields [last-online-time is-active]})
                            meta/metadata-provider)
        query (lib/query metadata-provider (meta/table-metadata :venues))]
    (doseq [{exp :name [op & args] :clause options :options} tests]
      (testing exp
        (is (= exp (lib/display-name
                     query -1
                     (lib/expression-clause op args options))))))))

(deftest ^:parallel truncate-frontend-filter-display-names-test
  (let [created-at (meta/field-metadata :products :created-at)
        created-at-with #(lib/with-temporal-bucket created-at %1)]
    (check-display-names
      [{:clause [:= (created-at-with :year) "2023-10-02T00:00:00.000Z"]
        :name "Created At is Jan 1 – Dec 31, 2023"}
       {:clause [:= (created-at-with :month) "2023-10-02T00:00:00.000Z"]
        :name "Created At is Oct 1–31, 2023"}
       {:clause [:= (created-at-with :day) "2023-10-02T00:00:00.000Z"]
        :name "Created At is Oct 2, 2023"}
       {:clause [:= (created-at-with :hour) "2023-10-02T00:00:00.000Z"]
        :name "Created At is Oct 2, 2023, 12:00 AM – 12:59 AM"}
       {:clause [:= (created-at-with :minute) "2023-10-02T00:00:00.000Z"]
        :name "Created At is Oct 2, 2023, 12:00 AM"}])))

(deftest ^:parallel exclude-date-frontend-filter-display-names-test
  (let [created-at (meta/field-metadata :products :created-at)
        created-at-with #(lib/with-temporal-bucket created-at %1)]
    (check-display-names
      [{:clause [:!= (created-at-with :day-of-week) "2023-10-02"],
        :name "Created At excludes Mondays"}
       {:clause [:!= (created-at-with :day-of-week) "2023-10-02" "2023-10-03" "2023-10-04"],
        :name "Created At excludes 3 day of week selections"}
       {:clause [:!= (created-at-with :month-of-year) "2023-01-01"],
        :name "Created At excludes each Jan"}
       {:clause [:!= (created-at-with :month-of-year) "2023-01-01" "2023-02-01" "2023-03-01"],
        :name "Created At excludes 3 month of year selections"}
       {:clause [:!= (created-at-with :quarter-of-year) "2023-01-03"],
        :name "Created At excludes Q1 each year"}
       {:clause [:!= (created-at-with :quarter-of-year) "2023-01-03" "2023-04-03" "2023-07-03"],
        :name "Created At excludes 3 quarter of year selections"}
       {:clause [:!= (created-at-with :hour-of-day) 0],
        :name "Created At excludes the hour of 12 AM"}
       {:clause [:!= (created-at-with :hour-of-day) 4],
        :name "Created At excludes the hour of 4 AM"}
       {:clause [:!= (created-at-with :hour-of-day) 12],
        :name "Created At excludes the hour of 12 PM"}
       {:clause [:!= (created-at-with :hour-of-day) 16],
        :name "Created At excludes the hour of 4 PM"}
       {:clause [:!= (created-at-with :hour-of-day) 0 1 2],
        :name "Created At excludes 3 hour of day selections"}
       {:clause [:is-null created-at],
        :name "Created At is empty"}
       {:clause [:not-null created-at],
        :name "Created At is not empty"}])))

(deftest ^:parallel time-frontend-filter-display-names-test
  (check-display-names
    [{:clause [:< last-online-time "00:00:00.000"], :name "Last Online Time is before 12:00 AM"}
     {:clause [:> last-online-time "12:00:00.000"], :name "Last Online Time is after 12:00 PM"}
     {:clause [:between last-online-time "12:00:00.000" "00:00:00.000"],
      :name "Last Online Time is 12:00 PM – 12:00 AM"}
     {:clause [:is-null last-online-time], :name "Last Online Time is empty"}
     {:clause [:not-null last-online-time], :name "Last Online Time is not empty"}]))

(deftest ^:parallel pk-frontend-filter-display-names-test
  (let [pk (meta/field-metadata :venues :id)]
    (check-display-names
      [{:clause [:= pk 1], :name "ID is 1"}
       {:clause [:= pk 4], :name "ID is 4"}
       {:clause [:= pk 1 2], :name "ID is 2 selections"}
       {:clause [:= pk 1 2 3], :name "ID is 3 selections"}
       {:clause [:!= pk 4], :name "ID is not 4"}
       {:clause [:!= pk 1 2], :name "ID is not 2 selections"}
       {:clause [:!= pk 2 3 5], :name "ID is not 3 selections"}
       {:clause [:> pk 1], :name "ID is greater than 1"}
       {:clause [:< pk 1], :name "ID is less than 1"}
       {:clause [:between pk 1 10], :name "ID is between 1 and 10"}
       {:clause [:>= pk 1], :name "ID is greater than or equal to 1"}
       {:clause [:<= pk 1], :name "ID is less than or equal to 1"}
       {:clause [:is-null pk], :name "ID is empty"}
       {:clause [:not-null pk], :name "ID is not empty"}])))

(deftest ^:parallel coordinate-frontend-filter-display-names-test
  (let [longitude (meta/field-metadata :venues :longitude)
        latitude (meta/field-metadata :venues :latitude)]
    (check-display-names
      [{:clause [:inside longitude latitude 1 2 3 4],
        :name "Longitude is between 3 and 1 and Latitude is between 2 and 4"}])))

(deftest ^:parallel fk-frontend-filter-display-names-test
  (let [fk (meta/field-metadata :orders :user-id)]
    (check-display-names
      [{:clause [:= fk 1], :name "User ID is 1"}
       {:clause [:= fk 11], :name "User ID is 11"}
       {:clause [:= fk 1 2], :name "User ID is 2 selections"}
       {:clause [:= fk 1 2 12], :name "User ID is 3 selections"}
       {:clause [:!= fk 1], :name "User ID is not 1"}
       {:clause [:!= fk 1 2], :name "User ID is not 2 selections"}
       {:clause [:!= fk 1 2 12], :name "User ID is not 3 selections"}
       {:clause [:> fk 1], :name "User ID is greater than 1"}
       {:clause [:< fk 1], :name "User ID is less than 1"}
       {:clause [:between fk 1 10], :name "User ID is between 1 and 10"}
       {:clause [:>= fk 1], :name "User ID is greater than or equal to 1"}
       {:clause [:<= fk 1], :name "User ID is less than or equal to 1"}
       {:clause [:is-null fk], :name "User ID is empty"}
       {:clause [:not-null fk], :name "User ID is not empty"}])))

(deftest ^:parallel string-frontend-filter-display-names-test
  (let [nam (meta/field-metadata :venues :name)]
    (check-display-names
      [{:clause [:= nam "ABC"], :name "Name is ABC"}
       {:clause [:= nam "A" "B"], :name "Name is 2 selections"}
       {:clause [:= nam "A" "B" "C"], :name "Name is 3 selections"}
       {:clause [:!= nam "ABC"], :name "Name is not ABC"}
       {:clause [:!= nam "A" "B"], :name "Name is not 2 selections"}
       {:clause [:!= nam "A" "B" "C"], :name "Name is not 3 selections"}
       {:clause [:contains nam "ABC"], :name "Name contains ABC"}
       {:clause [:contains nam "ABC"], :options {:case-sensitive true}, :name "Name contains ABC"}
       {:clause [:contains nam "ABC"], :options {:case-sensitive false}, :name "Name contains ABC"}
       {:clause [:contains nam "ABC" "HJK" "XYZ"], :name "Name contains 3 selections"}
       {:clause [:does-not-contain nam "ABC"], :name "Name does not contain ABC"}
       {:clause [:does-not-contain nam "ABC" "HJK" "XYZ"], :name "Name does not contain 3 selections"}
       {:clause [:is-empty nam], :name "Name is empty"}
       {:clause [:not-empty nam], :name "Name is not empty"}
       {:clause [:does-not-contain nam "ABC"], :name "Name does not contain ABC"}
       {:clause [:starts-with nam "ABC"], :name "Name starts with ABC"}
       {:clause [:starts-with nam "ABC" "HJK" "XYZ"], :name "Name starts with 3 selections"}
       {:clause [:ends-with nam "ABC"], :name "Name ends with ABC"}
       {:clause [:ends-with nam "ABC" "HJK" "XYZ"], :name "Name ends with 3 selections"}])))

(deftest ^:parallel boolean-frontend-filter-display-names-test
  (check-display-names
    [{:clause [:= is-active true], :name "Is Active is true"}
     {:clause [:= is-active false], :name "Is Active is false"}
     {:clause [:is-null is-active], :name "Is Active is empty"}
     {:clause [:not-null is-active], :name "Is Active is not empty"}]))

(deftest ^:parallel number-frontend-filter-display-names-test
  (let [tax (meta/field-metadata :orders :tax)]
    (check-display-names
      [{:clause [:= tax 1], :name "Tax is equal to 1"}
       {:clause [:= tax 7], :name "Tax is equal to 7"}
       {:clause [:= tax 7 10], :name "Tax is equal to 2 selections"}
       {:clause [:= tax 7 10 71], :name "Tax is equal to 3 selections"}
       {:clause [:!= tax 1], :name "Tax is not equal to 1"}
       {:clause [:!= tax 7], :name "Tax is not equal to 7"}
       {:clause [:!= tax 7 10], :name "Tax is not equal to 2 selections"}
       {:clause [:!= tax 7 10 71], :name "Tax is not equal to 3 selections"}
       {:clause [:> tax 7], :name "Tax is greater than 7"}
       {:clause [:< tax 7], :name "Tax is less than 7"}
       {:clause [:between tax 7 10], :name "Tax is between 7 and 10"}
       {:clause [:>= tax 1], :name "Tax is greater than or equal to 1"}
       {:clause [:<= tax 1], :name "Tax is less than or equal to 1"}
       {:clause [:is-null tax], :name "Tax is empty"}
       {:clause [:not-null tax], :name "Tax is not empty"}])))

(deftest ^:parallel relative-datetime-frontend-filter-display-names-test
  (let [created-at (meta/field-metadata :products :created-at)]
    (check-display-names
      [{:clause [:time-interval created-at -1 :minute], :name "Created At is in the previous minute"}
       {:clause [:time-interval created-at -3 :minute], :name "Created At is in the previous 3 minutes"}
       {:clause [:time-interval created-at -1 :hour], :name "Created At is in the previous hour"}
       {:clause [:time-interval created-at -3 :hour], :name "Created At is in the previous 3 hours"}
       {:clause [:time-interval created-at -1 :day], :name "Created At is yesterday"}
       {:clause [:time-interval created-at -3 :day], :name "Created At is in the previous 3 days"}
       {:clause [:time-interval created-at -1 :week], :name "Created At is in the previous week"}
       {:clause [:time-interval created-at -3 :week], :name "Created At is in the previous 3 weeks"}
       {:clause [:time-interval created-at -1 :month], :name "Created At is in the previous month"}
       {:clause [:time-interval created-at -3 :month], :name "Created At is in the previous 3 months"}
       {:clause [:time-interval created-at -1 :quarter], :name "Created At is in the previous quarter"}
       {:clause [:time-interval created-at -3 :quarter],
        :name "Created At is in the previous 3 quarters"}
       {:clause [:time-interval created-at -1 :year], :name "Created At is in the previous year"}
       {:clause [:time-interval created-at -3 :year], :name "Created At is in the previous 3 years"}
       {:clause [:between
                 (lib/expression-clause :+
                                        [created-at
                                         (lib/expression-clause :interval [1 :month] nil)] nil)
                 (lib/expression-clause :relative-datetime [-1 :month] nil)
                 (lib/expression-clause :relative-datetime [0 :month] nil)],
        :name "Created At is in the previous month, starting 1 month ago"}
       {:clause [:time-interval created-at :current :day], :name "Created At is today"}
       {:clause [:time-interval created-at :current :week], :name "Created At is this week"}
       {:clause [:time-interval created-at :current :month], :name "Created At is this month"}
       {:clause [:time-interval created-at :current :quarter],
        :name "Created At is this quarter"}
       {:clause [:time-interval created-at :current :year], :name "Created At is this year"}
       {:clause [:time-interval created-at 1 :minute], :name "Created At is in the next minute"}
       {:clause [:time-interval created-at 3 :minute], :name "Created At is in the next 3 minutes"}
       {:clause [:time-interval created-at 1 :hour], :name "Created At is in the next hour"}
       {:clause [:time-interval created-at 3 :hour], :name "Created At is in the next 3 hours"}
       {:clause [:time-interval created-at 1 :day], :name "Created At is tomorrow"}
       {:clause [:time-interval created-at 3 :day], :name "Created At is in the next 3 days"}
       {:clause [:time-interval created-at 1 :week], :name "Created At is in the next week"}
       {:clause [:time-interval created-at 3 :week], :name "Created At is in the next 3 weeks"}
       {:clause [:time-interval created-at 1 :month], :name "Created At is in the next month"}
       {:clause [:time-interval created-at 3 :month], :name "Created At is in the next 3 months"}
       {:clause [:time-interval created-at 1 :quarter], :name "Created At is in the next quarter"}
       {:clause [:time-interval created-at 3 :quarter], :name "Created At is in the next 3 quarters"}
       {:clause [:time-interval created-at 1 :year], :name "Created At is in the next year"}
       {:clause [:time-interval created-at 3 :year], :name "Created At is in the next 3 years"}
       {:clause [:between
                  (lib/expression-clause :+
                                         [created-at
                                          (lib/expression-clause :interval [-1 :month] nil)] nil)
                  (lib/expression-clause :relative-datetime [0 :month] nil)
                  (lib/expression-clause :relative-datetime [1 :month] nil)],
        :name "Created At is in the next month, starting 1 month from now"}
       {:clause [:relative-time-interval created-at 10 :week 10 :week]
        :name "Created At is in the next 10 weeks, starting 10 weeks from now"}
       {:clause [:relative-time-interval created-at -10 :week -10 :week]
        :name "Created At is in the previous 10 weeks, starting 10 weeks ago"}])))

(deftest ^:parallel specific-date-frontend-filter-display-names-test
  (let [created-at (meta/field-metadata :products :created-at)]
    (check-display-names
      [{:clause [:= created-at "2023-10-03"], :name "Created At is on Oct 3, 2023"}
       {:clause [:= created-at "2023-10-03T12:30:00"],
        :name "Created At is on Oct 3, 2023, 12:30 PM"}
       {:clause [:> created-at "2023-10-03"], :name "Created At is after Oct 3, 2023"}
       {:clause [:> created-at "2023-10-03T12:30:00"],
        :name "Created At is after Oct 3, 2023, 12:30 PM"}
       {:clause [:< created-at "2023-10-03"], :name "Created At is before Oct 3, 2023"}
       {:clause [:< created-at "2023-10-03T12:30:00"],
        :name "Created At is before Oct 3, 2023, 12:30 PM"}
       {:clause [:between created-at "2023-10-03" "2023-10-05"],
        :name "Created At is Oct 3–5, 2023"}
       {:clause [:between created-at "2023-10-03T01:00:00" "2023-10-03T14:00:00"],
        :name "Created At is Oct 3, 2023, 1:00 AM – 2:00 PM"}
       {:clause [:between created-at "2023-10-03T13:00:00" "2023-10-05T01:00:00"],
        :name "Created At is Oct 3, 1:00 PM – Oct 5, 2023, 1:00 AM"}
       {:clause [:between created-at "2023-09-03" "2023-10-03"],
        :name "Created At is Sep 3 – Oct 3, 2023"}
       {:clause [:between created-at "2023-09-03T13:00:00" "2023-10-03T13:00:00"],
        :name "Created At is Sep 3, 1:00 PM – Oct 3, 2023, 1:00 PM"}
       {:clause [:between created-at "2022-10-01" "2023-10-03"],
        :name "Created At is Oct 1, 2022 – Oct 3, 2023"}
       {:clause [:between created-at "2022-10-01T13:00:00" "2023-10-03T01:00:00"],
        :name "Created At is Oct 1, 2022, 1:00 PM – Oct 3, 2023, 1:00 AM"}
       {:clause [:between created-at "2022-09-01" "2023-10-03"],
        :name "Created At is Sep 1, 2022 – Oct 3, 2023"}
       {:clause [:between created-at "2022-09-01T13:00:00" "2023-10-03T01:00:00"],
        :name "Created At is Sep 1, 2022, 1:00 PM – Oct 3, 2023, 1:00 AM"}
       {:clause [:between
                 (lib/with-temporal-bucket created-at :week)
                 "2023-08-27T00:00:00-06:00"
                 "2023-11-27T00:00:00-06:00"],
        :name "Created At is Aug 27, 12:00 AM – Nov 27, 2023, 12:00 AM"}])))

(deftest ^:parallel filter-positions-test
  (let [base (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                 (lib/expression "expr" (lib/absolute-datetime "2020" :month)))
        base-cols (lib/breakoutable-columns base)
        base-col (fn [col-name] (m/find-first #(= (:name %) col-name) base-cols))
        query (-> base
                  (lib/breakout (base-col "ID"))
                  (lib/breakout (base-col "expr"))
                  (lib/aggregate (lib/count))
                  (lib/aggregate (lib/max (base-col "USER_ID")))
                  lib/append-stage)
        query-cols (lib/filterable-columns query)
        query-col (fn [col-name] (m/find-first #(= (:name %) col-name) query-cols))
        filtered-query (-> query
                           (lib/filter (lib/not-null (query-col "expr")))
                           (lib/filter (lib/>= (query-col "max") 7))
                           (lib/filter (lib/!= (query-col "ID") 42))
                           (lib/filter (lib/< (query-col "max") 17)))
        filtered-query-cols (lib/filterable-columns filtered-query)
        signature-fn (juxt :display-name :filter-positions)]
    (testing "no filters"
      (is (= [["ID" nil]
              ["expr" nil]
              ["Count" nil]
              ["Max of User ID" nil]]
             (map signature-fn query-cols))))
    (testing "with existing filter"
      (let [expected-signatures [["ID" [2]]
                                 ["expr" [0]]
                                 ["Count" nil]
                                 ["Max of User ID" [1 3]]]]
        (is (= expected-signatures
               (map signature-fn filtered-query-cols)))
        (testing "display-info"
          (is (= expected-signatures
                 (map (comp signature-fn
                            #(lib/display-info filtered-query %))
                      filtered-query-cols))))))))

(deftest ^:parallel matrix-can-filter
  (doseq [{:keys [column-type v]} #{{:column-type :type/DateTimeWithLocalTZ :v "2014-01-01"}
                                    {:column-type :type/Integer :v 1}
                                    {:column-type :type/Text :v "str"}
                                    {:column-type :type/Boolean :v true}
                                    {:column-type :type/Coordinate :v 1}}
          [query desired] (matrix/test-queries column-type)]
    (let [col (matrix/find-first desired (lib/filterable-columns query))
          query' (lib/filter query (lib/= col v))
          parts (lib/expression-parts query' (first (lib/filters query')))]
      (is (=? (lib.filter.operator/filter-operators {:lib/type :metadata/column :name "expected" :base-type column-type})
              (lib/filterable-column-operators col)))
      (is (=? [[:= {} (lib.options/update-options (lib/ref col) dissoc :lib/uuid) v]]
              (lib/filters query')))
      (is (=? {:operator :=
               :args [{:lib/type :metadata/column
                       :name (:name col)} v]}
              parts))
      (is (=? [:= {} (lib.options/update-options (lib/ref col) dissoc :lib/uuid) v]
              (lib/expression-clause (:operator parts) (:args parts) nil))))))

(deftest ^:parallel add-filters-to-stage-test
  (testing "Don't add empty :filters"
    (is (= {:lib/type :mbql.stage/mbql}
           (lib.filter/add-filters-to-stage {:lib/type :mbql.stage/mbql} nil)
           (lib.filter/add-filters-to-stage {:lib/type :mbql.stage/mbql} []))))
  (testing "Ignore duplicate filters"
    (is (= {:lib/type :mbql.stage/mbql
            :filters [[:=
                       {:lib/uuid "00000000-0000-0000-0000-000000000001"}
                       [:field {:lib/uuid "00000000-0000-0000-0000-000000000002"} 1]
                       1]
                      [:=
                       {:lib/uuid "00000000-0000-0000-0000-000000000003"}
                       [:field {:lib/uuid "00000000-0000-0000-0000-000000000004"} 1]
                       2]]}
           (lib.filter/add-filters-to-stage
            {:lib/type :mbql.stage/mbql
             :filters [[:=
                        {:lib/uuid "00000000-0000-0000-0000-000000000001"}
                        [:field {:lib/uuid "00000000-0000-0000-0000-000000000002"} 1]
                        1]
                       [:=
                        {:lib/uuid "00000000-0000-0000-0000-000000000003"}
                        [:field {:lib/uuid "00000000-0000-0000-0000-000000000004"} 1]
                        2]]}
            [[:=
              {:lib/uuid "00000000-0000-0000-0000-000000000005"}
              [:field {:lib/uuid "00000000-0000-0000-0000-000000000006"} 1]
              1]])))))

(deftest ^:parallel flatten-compound-filters-in-stage-test
  (is (= {:lib/type :mbql.stage/mbql
          :filters
          [[:= {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1 2]
           [:= {:lib/uuid "00000000-0000-0000-0000-000000000002"} 3 4]
           [:= {:lib/uuid "00000000-0000-0000-0000-000000000003"} 5 6]
           [:= {:lib/uuid "00000000-0000-0000-0000-000000000005"} 7 8]
           [:= {:lib/uuid "00000000-0000-0000-0000-000000000006"} 9 10]]}
         (lib.filter/flatten-compound-filters-in-stage
          {:lib/type :mbql.stage/mbql
           :filters  [[:= {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1 2]
                      [:and
                       {:lib/uuid "00000000-0000-0000-0000-000000000001"}
                       [:= {:lib/uuid "00000000-0000-0000-0000-000000000002"} 3 4]
                       [:= {:lib/uuid "00000000-0000-0000-0000-000000000003"} 5 6]
                       [:and
                        {:lib/uuid "00000000-0000-0000-0000-000000000004"}
                        [:= {:lib/uuid "00000000-0000-0000-0000-000000000005"} 7 8]
                        [:= {:lib/uuid "00000000-0000-0000-0000-000000000006"} 9 10]]]]}))))
