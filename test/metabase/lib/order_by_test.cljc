(ns metabase.lib.order-by-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.lib.append :as lib.append]
      [metabase.lib.field :as lib.field]
      [metabase.lib.order-by :as lib.order-by]
      [metabase.lib.query :as lib.query]
      [metabase.lib.test-metadata :as lib.test-metadata])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.lib.append :as lib.append]
      [metabase.lib.field :as lib.field]
      [metabase.lib.order-by :as lib.order-by]
      [metabase.lib.query :as lib.query]
      [metabase.lib.test-metadata :as lib.test-metadata])]))

(t/deftest ^:parallel order-by-test
  (t/is (=? {:database (lib.test-metadata/id)
             :type     :query
             :query    {:source-table (lib.test-metadata/id :venues)
                        :order-by     [[:asc [:field (lib.test-metadata/id :venues :id) nil]]]}}
            (-> (lib.query/query lib.test-metadata/metadata "VENUES")
                (lib.append/append (lib.order-by/order-by (lib.field/field "VENUES" "ID")))))))

(t/deftest ^:parallel order-bys-test
  (t/is (=? [{:type      :metabase.lib.order-by/order-by
              :direction :asc
              :ref       {:type       :metabase.lib.field/field
                          :table-name "VENUES"
                          :field-name "ID"}}]
            (-> (lib.query/query lib.test-metadata/metadata "VENUES")
                (lib.append/append (lib.order-by/order-by (lib.field/field "VENUES" "ID")))
                lib.order-by/order-bys))))
