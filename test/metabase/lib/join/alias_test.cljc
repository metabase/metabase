(ns metabase.lib.join.alias-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel with-join-alias-update-fields-test
  (testing "with-join-alias should update the alias of columns in :fields"
    (let [query  lib.tu/query-with-join-with-explicit-fields
          [join] (lib/joins query)]
      (is (=? {:alias  "Cat"
               :fields [[:field {:join-alias "Cat"} (meta/id :categories :name)]]}
              join))
      (let [join' (lib/with-join-alias join "New Alias")]
        (is (=? {:alias  "New Alias"
                 :fields [[:field {:join-alias "New Alias"} (meta/id :categories :name)]]}
                join'))))))

(deftest ^:parallel with-join-alias-update-condition-rhs-test
  (testing "with-join-alias should update the alias of the RHS column(s) in the condition(s)"
    (let [query  lib.tu/query-with-join
          [join] (lib/joins query)]
      (is (=? {:conditions [[:= {}
                             [:field {} (meta/id :venues :category-id)]
                             [:field {:join-alias "Cat"} (meta/id :categories :id)]]]
               :alias      "Cat"}
              join))
      (let [join' (lib/with-join-alias join "New Alias")]
        (is (=? {:conditions [[:= {}
                               [:field {} (meta/id :venues :category-id)]
                               [:field {:join-alias "New Alias"} (meta/id :categories :id)]]]
                 :alias      "New Alias"}
                join'))))))

(deftest ^:parallel with-join-alias-update-condition-rhs-set-alias-for-first-time-test
  (testing "with-join-alias should set the alias of the RHS column(s) when setting the alias for the first time"
    (let [query  lib.tu/query-with-join
          [join] (lib/joins query)
          join   (-> join
                     (dissoc :alias)
                     (update :conditions (fn [conditions]
                                           (mapv (fn [[operator opts lhs rhs :as _condition]]
                                                   [operator opts lhs (lib/with-join-alias rhs nil)])
                                                 conditions))))]
      (is (=? {:conditions [[:= {}
                             [:field {} (meta/id :venues :category-id)]
                             [:field {:join-alias (symbol "nil #_\"key is not present.\"")} (meta/id :categories :id)]]]
               :alias      (symbol "nil #_\"key is not present.\"")}
              join))
      (let [join' (lib/with-join-alias join "New Alias")]
        (is (=? {:conditions [[:= {}
                               [:field {} (meta/id :venues :category-id)]
                               [:field {:join-alias "New Alias"} (meta/id :categories :id)]]]
                 :alias      "New Alias"}
                join'))))))

(deftest ^:parallel join-alias-single-table-multiple-times-test
  (testing "joining the same table twice results in different join aliases"
    (is (=? [{:alias "Checkins"}
             {:alias "Checkins_2"}]
            (-> (lib/query meta/metadata-provider (meta/table-metadata :users))
                (lib/join (-> (lib/join-clause (meta/table-metadata :checkins)
                                               [(lib/=
                                                 (meta/field-metadata :users :id)
                                                 (meta/field-metadata :checkins :user-id))])))
                (lib/join (-> (lib/join-clause (meta/table-metadata :checkins)
                                               [(lib/=
                                                 (meta/field-metadata :users :id)
                                                 (meta/field-metadata :checkins :user-id))])))
                :stages first :joins)))))

(deftest ^:parallel add-default-alias-test
  (testing "calculate a good name if we have no conditions yet"
    (is (=? {:alias "Products"}
            (lib.join/add-default-alias
             (lib/query meta/metadata-provider (meta/table-metadata :orders))
             -1
             (lib/join-clause (meta/table-metadata :products)))))))
