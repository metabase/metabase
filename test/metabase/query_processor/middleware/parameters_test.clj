(ns metabase.query-processor.middleware.parameters-test
  (:require [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.mbql.normalize :as normalize]
            [metabase.query-processor.middleware.parameters :as parameters]
            [metabase.test.data :as data]))

(expect
  {:type   :native
   :native {:query "WOW", :parameters ["My Param"]}}
  (#'parameters/move-top-level-params-to-inner-query {:type :native, :native {:query "WOW"}, :parameters ["My Param"]}))

(defn- subsitute-params [query]
  (driver/with-driver :h2
    ((parameters/substitute-parameters identity) (normalize/normalize query))))

;; can we expand MBQL params if they are specified at the top level?
(expect
  (data/mbql-query venues
    {:aggregation [[:count]]
     :filter      [:= $price 1]})
  (subsitute-params
   (data/mbql-query venues
     {:aggregation [[:count]]
      :parameters  [{:name "price", :type :category, :target $price, :value 1}]})))

;; can we expand native params if they are specified at the top level?
(expect
  (data/query nil
    {:type   :native
     :native {:query "SELECT * FROM venues WHERE price = 1;", :params []}})
  (subsitute-params
   (data/query nil
     {:type       :native
      :native     {:query         "SELECT * FROM venues WHERE price = {{price}};"
                   :template-tags {"price" {:name "price", :display-name "Price", :type :number}}}
      :parameters [{:type "category", :target [:variable [:template-tag "price"]], :value "1"}]})))

;; can we expand MBQL params in a source query?
(expect
  (data/mbql-query venues
    {:source-query {:source-table $$venues
                    :filter       [:= $price 1]}
     :aggregation  [[:count]]})
  (subsitute-params
   (data/mbql-query venues
     {:source-query {:source-table $$venues
                     :parameters   [{:name "price", :type :category, :target $price, :value 1}]}
      :aggregation  [[:count]]})))

;; can we expand native params if in a source query?
(expect
  (data/mbql-query nil
    {:source-query {:native "SELECT * FROM categories WHERE name = ?;"
                    :params ["BBQ"]}})
  (subsitute-params
   (data/mbql-query nil
     {:source-query {:native         "SELECT * FROM categories WHERE name = {{cat}};"
                     :template-tags {"cat" {:name "cat", :display-name "Category", :type :text}}
                     :parameters    [{:type "category", :target [:variable [:template-tag "cat"]], :value "BBQ"}]}})))

;; can we expand MBQL params in a JOIN?
(expect
  (data/mbql-query venues
    {:aggregation [[:count]]
     :joins       [{:source-query {:source-table $$categories
                                   :filter       [:= $categories.name "BBQ"]}
                    :alias        "c"
                    :condition    [:= $category_id &c.categories.id]}]})
  (subsitute-params
   (data/mbql-query venues
     {:aggregation [[:count]]
      :joins       [{:source-table $$categories
                     :alias        "c"
                     :condition    [:= $category_id &c.categories.id]
                     :parameters   [{:type "category", :target $categories.name, :value "BBQ"}]}]})))

;; can we expand native params in a JOIN?
(expect
  (data/mbql-query venues
    {:aggregation [[:count]]
     :joins       [{:source-query {:native "SELECT * FROM categories WHERE name = ?;"
                                   :params ["BBQ"]}
                    :alias        "c"
                    :condition    [:= $category_id &c.*categories.id]}]})
  (subsitute-params
   (data/mbql-query venues
     {:aggregation [[:count]]
      :joins       [{:source-query {:native        "SELECT * FROM categories WHERE name = {{cat}};"
                                    :template-tags {"cat" {:name "cat", :display-name "Category", :type :text}}
                                    :parameters    [{:type "category", :target [:variable [:template-tag "cat"]], :value "BBQ"}]}
                     :alias        "c"
                     :condition    [:= $category_id &c.*categories.id]}]})))

;; can we expand multiple sets of MBQL params?
(expect
  (data/mbql-query venues
    {:source-query {:source-table $$venues
                    :filter       [:= $price 1]}
     :aggregation  [[:count]]
     :joins        [{:source-query {:source-table $$categories
                                    :filter       [:= $categories.name "BBQ"]}
                     :alias        "c"
                     :condition    [:= $category_id &c.categories.id]}]})
  (subsitute-params
   (data/mbql-query venues
     {:source-query {:source-table $$venues
                     :parameters   [{:name "price", :type :category, :target $price, :value 1}]}
      :aggregation  [[:count]]
      :joins        [{:source-table $$categories
                      :alias        "c"
                      :condition    [:= $category_id &c.categories.id]
                      :parameters   [{:type "category", :target $categories.name, :value "BBQ"}]}]})))

;; ...with params in a join and the join's source query (This is dumb. Hopefully no one is creating queries like this.
;; The `:parameters` should go in the source query instead of in the join.)
(expect
  (data/mbql-query venues
    {:aggregation [[:count]]
     :joins       [{:source-query {:source-table $$categories
                                   :filter       [:and
                                                  [:= $categories.name "BBQ"]
                                                  [:= $categories.id 5]]}
                    :alias        "c"
                    :condition    [:= $category_id &c.categories.id]}]})
  (subsitute-params
   (data/mbql-query venues
     {:aggregation [[:count]]
      :joins       [{:source-query {:source-table $$categories
                                    :parameters   [{:name "id", :type :category, :target $categories.id, :value 5}]}
                     :alias        "c"
                     :condition    [:= $category_id &c.categories.id]
                     :parameters   [{:type "category", :target $categories.name, :value "BBQ"}]}]})))
