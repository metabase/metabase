(ns metabase.lib.join.metadata-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.composed-provider
    :as lib.metadata.composed-provider]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel col-info-implicit-join-test
  (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk-field-id` "
                "info about the source Field")
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.convert/->pMBQL
                  {:database (meta/id)
                   :type     :query
                   :query    {:source-table (meta/id :venues)
                              :fields       [[:field (meta/id :categories :name) {:source-field (meta/id :venues :category-id)}]]}}))]
      (is (=? [{:name        "NAME"
                :id          (meta/id :categories :name)
                :fk-field-id (meta/id :venues :category-id)
                :lib/source  :source/fields}]
              (lib.metadata.calculation/returned-columns query -1 query))))))

(deftest ^:parallel col-info-explicit-join-test
  (testing "Display name for a joined field should include a nice name for the join; include other info like :source-alias"
    (let [query {:lib/type     :mbql/query
                 :stages       [{:lib/type     :mbql.stage/mbql
                                 :lib/options  {:lib/uuid "fdcfaa06-8e65-471d-be5a-f1e821022482"}
                                 :source-table (meta/id :venues)
                                 :fields       [[:field
                                                 {:join-alias "CATEGORIES__via__CATEGORY_ID"
                                                  :lib/uuid   "8704e09b-496e-4045-8148-1eef28e96b51"}
                                                 (meta/id :categories :name)]]
                                 :joins        [{:lib/type    :mbql/join
                                                 :lib/options {:lib/uuid "490a5abb-54c2-4e62-9196-7e9e99e8d291"}
                                                 :alias       "CATEGORIES__via__CATEGORY_ID"
                                                 :conditions  [[:=
                                                                {:lib/uuid "cc5f6c43-1acb-49c2-aeb5-e3ff9c70541f"}
                                                                (lib.tu/field-clause :venues :category-id)
                                                                (lib.tu/field-clause :categories :id {:join-alias "CATEGORIES__via__CATEGORY_ID"})]]
                                                 :strategy    :left-join
                                                 :fk-field-id (meta/id :venues :category-id)
                                                 :stages      [{:lib/type     :mbql.stage/mbql
                                                                :lib/options  {:lib/uuid "bbbae500-c972-4550-b100-e0584eb72c4d"}
                                                                :source-table (meta/id :categories)}]}]}]
                 :database     (meta/id)
                 :lib/metadata meta/metadata-provider}]
      (let [metadata (lib.metadata.calculation/returned-columns query)]
        (is (=? [(merge (meta/field-metadata :categories :name)
                        {:display-name         "Name"
                         :lib/source           :source/fields
                         ::lib.join/join-alias "CATEGORIES__via__CATEGORY_ID"})]
                metadata))
        (is (=? "CATEGORIES__via__CATEGORY_ID"
                (lib.join/current-join-alias (first metadata))))
        (is (=? [:field
                 {:lib/uuid string?, :join-alias "CATEGORIES__via__CATEGORY_ID"}
                 (meta/id :categories :name)]
                (lib/ref (first metadata))))))))

(deftest ^:parallel join-against-source-card-metadata-test
  (let [card-1            {:name          "My Card"
                           :id            1
                           :dataset-query {:database (meta/id)
                                           :type     :query
                                           :query    {:source-table (meta/id :checkins)
                                                      :aggregation  [[:count]]
                                                      :breakout     [[:field (meta/id :checkins :user-id) nil]]}}}
        metadata-provider (lib.metadata.composed-provider/composed-metadata-provider
                           meta/metadata-provider
                           (lib.tu/mock-metadata-provider
                            {:cards [card-1]}))
        join              {:lib/type    :mbql/join
                           :lib/options {:lib/uuid "d7ebb6bd-e7ac-411a-9d09-d8b18329ad46"}
                           :stages      [{:lib/type    :mbql.stage/mbql
                                          :source-card 1}]
                           :alias       "checkins_by_user"
                           :conditions  [[:=
                                          {:lib/uuid "1cb124b0-757f-4717-b8ee-9cf12a7c3f62"}
                                          [:field
                                           {:lib/uuid "a2eb96a0-420b-4465-817d-f3c9f789eff4"}
                                           (meta/id :users :id)]
                                          [:field
                                           {:base-type  :type/Integer
                                            :join-alias "checkins_by_user"
                                            :lib/uuid   "b23a769d-774a-4eb5-8fb8-1f6a33c9a8d5"}
                                           "USER_ID"]]]
                           :fields      :all}
        query             {:lib/type     :mbql/query
                           :lib/metadata metadata-provider
                           :database     (meta/id)
                           :stages       [{:lib/type     :mbql.stage/mbql
                                           :source-table (meta/id :checkins)
                                           :joins        [join]}]}]
    (is (=? [{:id                       (meta/id :checkins :user-id)
              :name                     "USER_ID"
              :lib/source               :source/joins
              :lib/source-column-alias  "USER_ID"
              :lib/desired-column-alias "checkins_by_user__USER_ID"}
             {:name                     "count"
              :lib/source               :source/joins
              :lib/source-column-alias  "count"
              :lib/desired-column-alias "checkins_by_user__count"}]
            (lib.metadata.calculation/returned-columns query -1 join)))
    (is (= (assoc card-1 :lib/type :metadata/card)
           (lib.join/joined-thing query join)))))

(deftest ^:parallel joins-source-and-desired-aliases-test
  (let [query (-> lib.tu/venues-query
                  (lib/join (-> (lib/join-clause
                                 (meta/table-metadata :categories)
                                 [(lib/=
                                   (meta/field-metadata :venues :category-id)
                                   (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                                (lib/with-join-alias "Cat")
                                (lib/with-join-fields :all)))
                  (lib/with-fields [(meta/field-metadata :venues :id)
                                    (lib/with-join-alias (meta/field-metadata :categories :id) "Cat")]))]
    (is (=? [{:name                     "ID"
              :lib/source-column-alias  "ID"
              :lib/desired-column-alias "ID"
              :lib/source               :source/fields}
             {:name                     "ID"
              :lib/source-column-alias  "ID"
              :lib/desired-column-alias "Cat__ID"
              ::lib.join/join-alias     "Cat"
              :lib/source               :source/fields}
             {:name                     "NAME"
              :lib/source-column-alias  "NAME"
              :lib/desired-column-alias "Cat__NAME"
              ::lib.join/join-alias     "Cat"
              :lib/source               :source/joins}]
            (lib.metadata.calculation/returned-columns query)))
    (is (=? {:lib/type :metadata/table
             :db-id (meta/id)
             :name "CATEGORIES"
             :id (meta/id :categories)
             :display-name "Categories"}
            (lib.join/joined-thing query (first (lib/joins query)))))
    (is (=? [{:table             {:name              "VENUES"
                                  :display-name      "Venues"
                                  :long-display-name "Venues"
                                  :is-source-table   true}
              :effective-type    :type/BigInteger
              :long-display-name "ID"
              :display-name      "ID"}
             {:table             {:name              "CATEGORIES"
                                  :display-name      "Categories"
                                  :long-display-name "Categories"
                                  :is-source-table   false}
              :effective-type    :type/BigInteger
              :long-display-name "Cat → ID"
              :display-name      "ID"}
             {:table             {:name              "CATEGORIES"
                                  :display-name      "Categories"
                                  :long-display-name "Categories"
                                  :is-source-table   false}
              :effective-type    :type/Text
              :long-display-name "Cat → Name"
              :display-name      "Name"}]
            (map #(lib/display-info query %)
                 (lib.metadata.calculation/returned-columns query))))
    (testing "Introduce a new stage"
      (let [query' (lib/append-stage query)]
        (is (=? [{:name                     "ID"
                  :lib/source-column-alias  "ID"
                  :lib/desired-column-alias "ID"
                  :lib/source               :source/previous-stage}
                 {:name                     "ID"
                  :lib/source-column-alias  "Cat__ID"
                  :lib/desired-column-alias "Cat__ID"
                  :lib/source               :source/previous-stage}
                 {:name                     "NAME"
                  :lib/source-column-alias  "Cat__NAME"
                  :lib/desired-column-alias "Cat__NAME"
                  :lib/source               :source/previous-stage}]
                (lib.metadata.calculation/returned-columns query')))))))

(deftest ^:parallel default-columns-added-by-joins-deduplicate-names-test
  (let [join-alias "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        query      {:lib/type     :mbql/query
                    :lib/metadata meta/metadata-provider
                    :database     (meta/id)
                    :stages       [{:lib/type     :mbql.stage/mbql
                                    :source-table (meta/id :categories)
                                    :joins        [{:lib/type    :mbql/join
                                                    :lib/options {:lib/uuid "10ee93eb-6749-41ed-a48b-93c66427eb49"}
                                                    :alias       join-alias
                                                    :fields      [[:field
                                                                   {:join-alias join-alias
                                                                    :lib/uuid   "87ad4bf3-a00b-462a-b9cc-3dde44945d66"}
                                                                   (meta/id :categories :id)]]
                                                    :conditions  [[:=
                                                                   {:lib/uuid "dc8e675c-dc5f-43a1-a0c9-ff7f0a222fdc"}
                                                                   [:field
                                                                    {:lib/uuid "a2220121-04e0-4df0-8c67-7d17530e90e9"}
                                                                    (meta/id :categories :id)]
                                                                   [:field
                                                                    {:lib/uuid "c5203ef8-d56d-474c-b176-2853a3f017b0"}
                                                                    (meta/id :categories :id)]]]
                                                    :stages      [{:lib/type     :mbql.stage/mbql
                                                                   :lib/options  {:lib/uuid "e8888108-22a7-4f97-8315-ff63503634d7"}
                                                                   :source-table (meta/id :categories)}]}]}]}]
    (is (=? [{:name                     "ID"
              :display-name             "ID"
              :lib/source-column-alias  "ID"
              :lib/desired-column-alias "ID"}
             {:name                     "NAME"
              :display-name             "Name"
              :lib/source-column-alias  "NAME"
              :lib/desired-column-alias "NAME"}
             {:name                     "ID"
              :display-name             "ID"
              :lib/source-column-alias  "ID"
              :lib/desired-column-alias "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY_bfaf4e7b"}]
            (lib.metadata.calculation/returned-columns query)))))

(deftest ^:parallel joinable-columns-test
  (are [table-or-card] (=? [{:lib/type :metadata/column, :name "ID"}
                            {:lib/type :metadata/column, :name "NAME"}
                            {:lib/type :metadata/column, :name "CATEGORY_ID"}
                            {:lib/type :metadata/column, :name "LATITUDE"}
                            {:lib/type :metadata/column, :name "LONGITUDE"}
                            {:lib/type :metadata/column, :name "PRICE"}]
                           (lib/joinable-columns lib.tu/venues-query -1 table-or-card))
    (meta/table-metadata :venues)
    meta/saved-question-CardMetadata))

(deftest ^:parallel joinable-columns-join-test
  (let [query           lib.tu/query-with-join
        [original-join] (lib/joins query)]
    (is (=? {:lib/type :mbql/join, :alias "Cat", :fields :all}
            original-join))
    (doseq [{:keys [fields id-selected? name-selected?]} [{:fields         :all
                                                           :id-selected?   true
                                                           :name-selected? true}
                                                          {:fields         :none
                                                           :id-selected?   false
                                                           :name-selected? false}
                                                          {:fields         nil
                                                           :id-selected?   false
                                                           :name-selected? false}
                                                          {:fields         [[:field {:lib/uuid   (str (random-uuid))
                                                                                     :join-alias "Cat"}
                                                                             (meta/id :categories :id)]]
                                                           :id-selected?   true
                                                           :name-selected? false}]]
      (testing (str "fields = " (pr-str fields))
        (let [join  (lib/with-join-fields original-join fields)
              ;; FIXME -- joins replacement broken -- #32026
              ;; query (lib/replace-clause query original-join join)
              query (assoc-in query [:stages 0 :joins] [join])
              cols  (lib/joinable-columns query -1 join)]
          (is (=? [{:name                         "ID"
                    :metabase.lib.join/join-alias "Cat"
                    :lib/source-column-alias      "ID"
                    :lib/desired-column-alias     "Cat__ID"
                    :selected?                    id-selected?}
                   {:name                         "NAME"
                    :metabase.lib.join/join-alias "Cat"
                    :lib/source-column-alias      "NAME"
                    :lib/desired-column-alias     "Cat__NAME"
                    :selected?                    name-selected?}]
                  cols))
          (testing `lib/display-info
            (is (=? [{:display-name "ID", :long-display-name "Cat → ID", :selected id-selected?}
                     {:display-name "Name", :long-display-name "Cat → Name", :selected name-selected?}]
                    (map (partial lib/display-info query) cols))))
          (testing `lib/with-join-fields
            (is (=? {:lib/type :mbql/join
                     ;; TODO -- these should probably be using string names rather than integer IDs, see #29763. Okay for
                     ;; now since the QP will do the right thing.
                     :fields   [[:field
                                 {:lib/uuid string?, :join-alias "Cat"}
                                 (meta/id :categories :id)]
                                [:field
                                 {:lib/uuid string?, :join-alias "Cat"}
                                 (meta/id :categories :name)]]}
                    (lib/with-join-fields join cols)))))))))

(deftest ^:parallel join-lhs-display-name-test
  (doseq [[source-table? query]                {true  lib.tu/venues-query
                                                false lib.tu/query-with-source-card}
          [num-existing-joins query]           {0 query
                                                1 (lib.tu/add-joins query "J1")
                                                2 (lib.tu/add-joins query "J1" "J2")}
          [first-join? join? join-or-joinable] (list*
                                                [(zero? num-existing-joins) false (meta/table-metadata :venues)]
                                                [(zero? num-existing-joins) false meta/saved-question-CardMetadata]
                                                [(zero? num-existing-joins) false nil]
                                                (when-let [[first-join & more] (not-empty (lib/joins query))]
                                                  (cons [true true first-join]
                                                        (for [join more]
                                                          [false true join]))))
          [num-stages query]                   {1 query
                                                2 (lib/append-stage query)}]
    (testing (str "query w/ source table?" source-table?                                              \newline
                  "num-existing-joins = "  num-existing-joins                                         \newline
                  "num-stages = "          num-stages                                                 \newline
                  "join =\n"               (u/pprint-to-str join-or-joinable)                         \newline
                  "existing joins = "      (u/pprint-to-str (map lib.options/uuid (lib/joins query))) \newline
                  "first join? "           first-join?)
      (testing "When passing an explicit LHS column, use display name for its `:table`"
        (is (= "Orders"
               (lib/join-lhs-display-name query join-or-joinable (meta/field-metadata :orders :product-id)))))
      (testing "existing join should use the display name for condition LHS"
        (when join?
          (is (= "Venues"
                 (lib/join-lhs-display-name query join-or-joinable)))))
      (testing "The first join should use the display name of the query `:source-table` without explicit LHS"
        (when (and source-table?
                   (= num-stages 1)
                   first-join?)
          (is (= "Venues"
                 (lib/join-lhs-display-name query join-or-joinable)))))
      (testing "When *building* a join that is not the first join, if query does not use `:source-table`, use 'Previous results'"
        (when (and (not join?)
                   (or (not source-table?)
                       (not first-join?)
                       (> num-stages 1)))
          (is (= "Previous results"
                 (lib/join-lhs-display-name query join-or-joinable))))))))
