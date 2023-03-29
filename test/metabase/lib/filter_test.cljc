(ns metabase.lib.filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(defn- test-clause [result-filter f & args]
  (testing "return a function for later resolution"
    (let [f' (apply f args)]
      (is (fn? f'))
      (is (=? result-filter
              (f' {:lib/metadata meta/metadata} -1))))))

(deftest ^:parallel filter-clause-test
  (let [q1                          (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
        q2                          (lib/saved-question-query meta/metadata-provider meta/saved-question)
        q3                          (lib/query-for-table-name meta/metadata-provider "CHECKINS")
        venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
        venues-name-metadata        (lib.metadata/field q1 nil "VENUES" "NAME")
        venues-latitude-metadata    (lib.metadata/field q1 nil "VENUES" "LATITUDE")
        venues-longitude-metadata   (lib.metadata/field q1 nil "VENUES" "LONGITUDE")
        categories-id-metadata      (lib.metadata/stage-column q2 -1 "ID")
        checkins-date-metadata      (lib.metadata/field q3 nil "CHECKINS" "DATE")]
    (testing "comparisons"
      (doseq [[op f] [[:=  lib/=]
                      [:!= lib/!=]
                      [:<  lib/<]
                      [:<= lib/<=]
                      [:>  lib/>]
                      [:>= lib/>=]]]
        (test-clause
         {:operator op
          :args [[:field {:lib/uuid string?} (meta/id :venues :category-id)]
                 [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]}
         f
         venues-category-id-metadata
         categories-id-metadata)))

    (testing "between"
      (test-clause
       {:operator :between
        :args [[:field {:lib/uuid string?} (meta/id :venues :category-id)]
               42
               [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]}
       lib/between
       venues-category-id-metadata
       42
       categories-id-metadata))

    (testing "inside"
      (test-clause
       {:operator :inside
        :args [[:field {:base-type :type/Float, :lib/uuid string?} (meta/id :venues :latitude)]
               [:field {:base-type :type/Float, :lib/uuid string?} (meta/id :venues :longitude)]
               42.7 13 4 27.3]}
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
         {:operator op
          :args [[:field {:lib/uuid string?} (meta/id :venues :name)]]}
         f
         venues-name-metadata)))

    (testing "string tests"
      (doseq [[op f] [[:starts-with      lib/starts-with]
                      [:ends-with        lib/ends-with]
                      [:contains         lib/contains]
                      [:does-not-contain lib/does-not-contain]]]
        (test-clause
         {:operator op
          :args [[:field {:lib/uuid string?} (meta/id :venues :name)]
                 "part"]}
         f
         venues-name-metadata
         "part")))

    (testing "time-interval"
      (test-clause
       {:operator :time-interval
        :args [[:field {:base-type :type/Date, :lib/uuid string?} (meta/id :checkins :date)]
               3
               :day]}
       lib/time-interval
       checkins-date-metadata
       3
       :day))

    (testing "segment"
      (doseq [id [7 "6"]]
        (test-clause
         {:operator :segment
          :args [id]}
         lib/segment
         id)))))

(deftest ^:parallel filter-test
  (let [q1                          (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
        q2                          (lib/saved-question-query meta/metadata-provider meta/saved-question)
        venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
        original-filter
        [:between
         {:lib/uuid string?}
         [:field {:base-type :type/Integer :lib/uuid string?} (meta/id :venues :category-id)]
         42
         100]
        simple-filtered-query
        {:lib/type :mbql/query
         :database (meta/id)
         :type :pipeline
         :stages [{:lib/type :mbql.stage/mbql
                   :source-table (meta/id :categories)
                   :lib/options {:lib/uuid string?}
                   :filter original-filter}]}]
    (testing "no filter"
      (is (nil? (lib/current-filter q1)))
      (is (= [] (lib/current-filters q2))))

    (testing "setting a simple filter via the helper function"
      (let [result-query
            (lib/filter q1 (lib/between venues-category-id-metadata 42 100))
            result-filter {:operator (-> original-filter first name)
                          :options (second original-filter)
                          :args (subvec original-filter 2)}]
       (is (=? simple-filtered-query
               (dissoc result-query :lib/metadata)))
       (testing "and getting the current filter"
         (is (=? result-filter
                 (lib/current-filter result-query)))
         (is (=? [result-filter]
                 (lib/current-filters result-query))))))

    (testing "setting a simple filter expression"
      (is (=? simple-filtered-query
              (-> q1
                  (lib/filter {:operator :between
                               :args [(lib.field/field q1 venues-category-id-metadata) 42 100]})
                  (dissoc :lib/metadata)))))))

(deftest ^:parallel add-filter-test
  (let [simple-query         (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
        venues-name-metadata (lib.metadata/field simple-query nil "VENUES" "NAME")
        first-filter
        [:between
         {:lib/uuid string?}
         [:field
          {:base-type :type/Integer, :lib/uuid string?}
          (meta/id :venues :category-id)]
         42
         100]
        first-result-filter
        {:operator (-> first-filter first name)
         :options (second first-filter)
         :args (subvec first-filter 2)}
        second-filter
        [:starts-with
         {:lib/uuid string?}
         [:field {:base-type :type/Text, :lib/uuid string?} (meta/id :venues :name)]
         "prefix"]
        second-result-filter
        {:operator (-> second-filter first name)
         :options (second second-filter)
         :args (subvec second-filter 2)}
        third-filter
        [:contains
         {:lib/uuid string?}
         [:field {:base-type :type/Text, :lib/uuid string?} (meta/id :venues :name)]
         "part"]
        third-result-filter
        {:operator (-> third-filter first name)
         :options (second third-filter)
         :args (subvec third-filter 2)}
        first-add
        (lib/add-filter simple-query
                        (lib/between
                         (lib/field "VENUES" "CATEGORY_ID")
                         42
                         100))
        filtered-query
        (assoc-in simple-query [:stages 0 :filter] first-filter)
        second-add
        (lib/add-filter first-add {:operator "starts-with"
                                   :args [(lib.field/field simple-query venues-name-metadata) "prefix"]})
        and-query
        (assoc-in filtered-query
                  [:stages 0 :filter]
                  [:and {:lib/uuid string?} first-filter second-filter])
        third-add
        (lib/add-filter second-add {:operator :contains
                                    :args [(lib.field/field simple-query venues-name-metadata) "part"]})
        extended-and-query
        (assoc-in filtered-query
                  [:stages 0 :filter]
                  [:and
                   {:lib/uuid string?}
                   first-filter
                   second-filter
                   [:contains
                    {:lib/uuid string?}
                    [:field {:base-type :type/Text, :lib/uuid string?} (meta/id :venues :name)]
                    "part"]])]
    (testing "adding an initial filter"
      (is (=? filtered-query first-add))
      (is (=? [first-result-filter]
              (lib/current-filters first-add))))
    (testing "conjoining to filter"
      (is (=? and-query second-add))
      (is (=? [first-result-filter second-result-filter]
              (lib/current-filters second-add))))
    (testing "conjoining to conjunction filter"
      (is (=? extended-and-query third-add))
      (is (=? [first-result-filter second-result-filter third-result-filter]
              (lib/current-filters third-add))))))
