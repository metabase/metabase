(ns metabase.query-processor.middleware.resolve-joined-tables-test
  (:require [expectations :refer :all]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.middleware.resolve-joined-tables :as resolve-joined-tables]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data :as data]))

(expect
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [[:field-id (data/id :venues :name)]
                             [:fk->
                              [:field-id (data/id :venues :category_id)]
                              [:field-id (data/id :categories :name)]]]
              :join-tables  [{:join-alias  "CATEGORIES__via__CATEGORY_ID"
                              :table-id    (data/id :categories)
                              :fk-field-id (data/id :venues :category_id)
                              :pk-field-id (data/id :categories :id)}]}}
  (qp.store/with-store
    (qp.store/store-table! (Table (data/id :venues)))
    (doseq [field-id [(data/id :venues :name)
                      (data/id :categories :name)
                      (data/id :venues :category_id)]]
      (qp.store/store-field! (Field field-id)))
    ((resolve-joined-tables/resolve-joined-tables identity)
     {:database (data/id)
      :type     :query
      :query    {:source-table (data/id :venues)
                 :fields       [[:field-id (data/id :venues :name)]
                                [:fk->
                                 [:field-id (data/id :venues :category_id)]
                                 [:field-id (data/id :categories :name)]]]}})))
