(ns metabase.lib.order-by-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.lib :as lib]
      [metabase.lib.test-metadata :as meta])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.lib :as lib]
      [metabase.lib.test-metadata :as meta])]))

(t/deftest ^:parallel order-by-test
  (t/is (=? {:database (meta/id)
             :type     :query
             :query    {:source-table (meta/id :venues)
                        :order-by     [[:asc
                                        {:lib/uuid string?}
                                        [:field (meta/id :venues :id) nil]]]}}
            (-> (lib/query meta/metadata "VENUES")
                (lib/append (lib/order-by (lib/field "VENUES" "ID")))))))

(t/deftest ^:parallel threading-test
  (t/is (=? {:database (meta/id)
             :type     :query
             :query    {:source-table (meta/id :venues)
                        :order-by     [[:asc
                                        {:lib/uuid string?}
                                        [:field (meta/id :venues :id) nil]]]}}
            (-> (lib/query meta/metadata "VENUES")
                (lib/order-by (lib/field "VENUES" "ID"))))))

(t/deftest ^:parallel threading-with-direction-test
  (t/is (=? {:database (meta/id)
             :type     :query
             :query    {:source-table (meta/id :venues)
                        :order-by     [[:desc
                                        {:lib/uuid string?}
                                        [:field (meta/id :venues :id) nil]]]}}
            (-> (lib/query meta/metadata "VENUES")
                (lib/order-by (lib/field "VENUES" "ID") :desc)))))

(t/deftest ^:parallel order-bys-test
  (t/is (=? [[:asc
              {:lib/uuid string?}
              [:field 400 nil]]]
            (-> (lib/query meta/metadata "VENUES"
                 )
                (lib/append (lib/order-by (lib/field "VENUES" "ID")))
                lib/order-bys))))
