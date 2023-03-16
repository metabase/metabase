(ns metabase.lib.filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(defn- test-clause [result-filter f ->f & args]
  (testing "with query/stage-number, return clause right away"
    (is (=? result-filter
            (apply f {:lib/metadata meta/metadata} -1 args))))
  (testing "without query/stage-number, return a function for later resolution"
    (let [f' (apply ->f args)]
      (is (fn? f'))
      (is (=? result-filter
              (f' {:lib/metadata meta/metadata} -1))))))

(deftest ^:parallel filter-test
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
      (doseq [[op f ->f] [[:= lib/= lib/->=]
                          [:!= lib/!= lib/->!=]
                          [:< lib/< lib/-><]
                          [:<= lib/<= lib/-><=]
                          [:> lib/> lib/->>]
                          [:>= lib/>=  lib/->>=]]]
        (test-clause
         [op
          {:lib/uuid string?}
          [:field {:lib/uuid string?} (meta/id :venues :category-id)]
          [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]
         f ->f
         venues-category-id-metadata
         categories-id-metadata)))

    (testing "between"
      (test-clause
       [:between
        {:lib/uuid string?}
        [:field {:lib/uuid string?} (meta/id :venues :category-id)]
        42
        [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]
       lib/between lib/->between
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
       lib/inside lib/->inside
       venues-latitude-metadata
       venues-longitude-metadata
       42.7 13 4 27.3))

    (testing "emptiness"
      (doseq [[op f ->f] [[:is-null lib/is-null  lib/->is-null]
                          [:not-null lib/not-null lib/->not-null]
                          [:is-empty lib/is-empty lib/->is-empty]
                          [:not-empty lib/not-empty lib/->not-empty]]]
        (test-clause
         [op
          {:lib/uuid string?}
          [:field {:lib/uuid string?} (meta/id :venues :name)]]
         f ->f
         venues-name-metadata)))

    (testing "string tests"
      (doseq [[op f ->f] [[:starts-with lib/starts-with  lib/->starts-with]
                          [:ends-with lib/ends-with lib/->ends-with]
                          [:contains lib/contains lib/->contains]
                          [:does-not-contain lib/does-not-contain lib/->does-not-contain]]]
        (test-clause
         [op
          {:lib/uuid string?}
          [:field {:lib/uuid string?} (meta/id :venues :name)]
          "part"]
         f ->f
         venues-name-metadata
         "part")))

    (testing "time-interval"
      (test-clause
       [:time-interval
        {:lib/uuid string?}
        [:field {:base-type :type/Date, :lib/uuid string?} (meta/id :checkins :date)]
        3
        :day]
       lib/time-interval lib/->time-interval
       checkins-date-metadata
       3
       :day))

    (testing "segment"
      (doseq [id [7 "6"]]
        (test-clause
         [:segment {:lib/uuid string?} id]
         lib/segment lib/->segment
         id)))))

(deftest ^:parallel filter-test
  (let [q1                          (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
        q2                          (lib/saved-question-query meta/metadata-provider meta/saved-question)
        q3                          (lib/query-for-table-name meta/metadata-provider "CHECKINS")
        venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
        venues-name-metadata        (lib.metadata/field q1 nil "VENUES" "NAME")
        venues-latitude-metadata    (lib.metadata/field q1 nil "VENUES" "LATITUDE")
        venues-longitude-metadata   (lib.metadata/field q1 nil "VENUES" "LONGITUDE")
        categories-id-metadata      (lib.metadata/stage-column q2 -1 "ID")
        checkins-date-metadata      (lib.metadata/field q3 nil "CHECKINS" "DATE")
        simple-filtered-query
        {:lib/type :mbql/query,
         :database (meta/id)
         :type :pipeline
         :stages [{:lib/type :mbql.stage/mbql
                   :source-table (meta/id :categories)
                   :lib/options {:lib/uuid string?},
                   :filter [:between
                            {:lib/uuid string?}
                            [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]
                            42
                            100]}]}]
    (testing "setting a simple filter"
      (is (=? simple-filtered-query
              (-> q1
                  (lib/filter (lib/between {:lib/metadata meta/metadata} -1 venues-category-id-metadata 42 100))
                  (dissoc :lib/metadata)))))

    (testing "setting a simple filter thunk"
      (is (=? simple-filtered-query
              (-> q1
                  (lib/filter (lib/->between venues-category-id-metadata 42 100))
                  (dissoc :lib/metadata)))))

    (testing "setting a simple filter expression"
      (is (=? simple-filtered-query
              (-> q1
                  (lib/filter [:between venues-category-id-metadata 42 100])
                  (dissoc :lib/metadata)))))

    (testing "setting a nested filter expression"
      (is (=? {:lib/type :mbql/query,
               :database (meta/id),
               :type :pipeline,
               :stages
               [{:lib/type :mbql.stage/mbql,
                 :source-table (meta/id :categories)
                 :lib/options #:lib{:uuid string?}
                 :filter
                 [:or
                  #:lib{:uuid string?}
                  [:between
                   #:lib{:uuid string?}
                   [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]
                   42
                   100]
                  [:and
                   #:lib{:uuid string?}
                   [:=
                    #:lib{:uuid string?}
                    [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]
                    242
                    [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]
                   [:contains
                    #:lib{:uuid string?}
                    [:field {:base-type :type/Text, :lib/uuid string?} (meta/id :venues :name)]
                    "part"]]]}]}
              (-> q1
                  (lib/filter [:or
                               [:between venues-category-id-metadata 42 100]
                               [:and
                                [:= venues-category-id-metadata 242 categories-id-metadata]
                                [:contains venues-name-metadata "part"]]])
                  (dissoc :lib/metadata)))))))
