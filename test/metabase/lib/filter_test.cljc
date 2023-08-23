(ns metabase.lib.filter-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.types.isa :as lib.types.isa]))

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
    (is (= "Name ends with \"t\""
           (lib/display-name
            lib.tu/venues-query
            [:ends-with
             {:lib/uuid "953597df-a96d-4453-a57b-665e845abc69"}
             [:field {:lib/uuid "be28f393-538a-406b-90da-bac5f8ef565e"} (meta/id :venues :name)]
             "t"]))) ))

(deftest ^:parallel filterable-columns
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
        text-operators [:= :!= :contains :does-not-contain :is-null :not-null :is-empty :not-empty :starts-with :ends-with]]
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
                                  "is-null" {:display-name "Is null", :long-display-name "Is null"}
                                  "is-empty" {:display-name "Is empty", :long-display-name "Is empty"}}
                 "LAST_LOGIN"    {"!=" {:display-name "≠", :long-display-name "Excludes"}
                                  ">"  {:display-name ">", :long-display-name "After"}}
                 "Venues__PRICE" {"="       {:display-name "=", :long-display-name "Equal to"}
                                  "is-null" {:display-name "Is empty", :long-display-name "Is empty"}}}
                display-info-by-type-and-op))))))

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
                                  :between (lib/filter-clause op col 123 456)
                                  (:contains :does-not-contain :starts-with :ends-with) (lib/filter-clause op col "123")
                                  (:is-null :not-null :is-empty :not-empty) (lib/filter-clause op col)
                                  :inside (lib/filter-clause op col 12 34 56 78 90)
                                  (lib/filter-clause op col 123))]]
      (testing (str (:short op) " with " (lib.types.isa/field-type col))
        (is (= op
               (lib/filter-operator query filter-clause)))))))

(deftest ^:parallel filter-parts-test
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
                                  :between (lib/filter-clause op col 123 456)
                                  (:contains :does-not-contain :starts-with :ends-with) (lib/filter-clause op col "123")
                                  (:is-null :not-null :is-empty :not-empty) (lib/filter-clause op col)
                                  :inside (lib/filter-clause op col 12 34 56 78 90)
                                  (lib/filter-clause op col 123))]]
      (testing (str (:short op) " with " (lib.types.isa/field-type col))
        (let [parts (lib/filter-parts query filter-clause)]
          (is (=? {:lib/type :mbql/filter-parts
                   :operator op}
                  parts))
          (is (=? {:lib/type :metadata/column
                   :operators (comp vector? not-empty)}
                  (:column parts)))
          (is (vector? (:args parts))))))))

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
