(ns metabase.lib.convert.metadata-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.convert.metadata :as lib.convert.metadata]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel legacy-column-metadata-test
  (is (= {:description       nil
          :database_type     "TIMESTAMP WITH TIME ZONE"
          :semantic_type     :type/CreationTimestamp
          :table_id          (meta/id :orders)
          :coercion_strategy nil
          :name              "CREATED_AT"
          :settings          nil
          :effective_type    :type/DateTimeWithLocalTZ
          :nfc_path          nil
          :parent_id         nil
          :id                (meta/id :orders :created-at)
          :visibility_type   :normal
          :display_name      #_ "J → Created At" "J → Created At: Default" ; FIXME
          :fingerprint       {:global {:distinct-count 200, :nil% 0.0}
                              :type   #:type{:DateTime {:earliest "2016-04-26T19:29:55.147Z", :latest "2019-04-15T13:34:19.931Z"}}}
          :base_type         :type/DateTimeWithLocalTZ
          :field_ref         [:field
                              (meta/id :orders :created-at)
                              {:base-type :type/DateTimeWithLocalTZ, :temporal-unit :default, :join-alias "J"}]
          :source_alias      "J"}
         (lib.convert.metadata/->legacy-column-metadata
          (lib/query meta/metadata-provider (meta/table-metadata :orders))
          {:description                      nil
           :lib/type                         :metadata/column
           :base-type                        :type/DateTimeWithLocalTZ
           :semantic-type                    :type/CreationTimestamp
           :table-id                         (meta/id :orders)
           :name                             "CREATED_AT"
           :coercion-strategy                nil
           :lib/source                       :source/fields
           :lib/source-column-alias          "CREATED_AT"
           :settings                         nil
           :lib/source-uuid                  "d24ffced-8bf0-4d3a-8ffa-0314bfc0beae"
           :nfc-path                         nil
           :database-type                    "TIMESTAMP WITH TIME ZONE"
           :effective-type                   :type/DateTimeWithLocalTZ
           :id                               (meta/id :orders :created-at)
           :parent-id                        nil
           :visibility-type                  :normal
           :lib/desired-column-alias         "CREATED_AT"
           :metabase.lib.field/temporal-unit :default
           :display-name                     "Created At: Default"
           :fingerprint                      {:global {:distinct-count 200, :nil% 0.0}
                                              :type   #:type{:DateTime {:earliest "2016-04-26T19:29:55.147Z"
                                                                        :latest   "2019-04-15T13:34:19.931Z"}}}
           :metabase.lib.join/join-alias     "J"}))))

(deftest ^:parallel aggregation-ref-test
  (let [query (-> lib.tu/venues-query
                  (lib/aggregate (lib/count)))
        [ag]  (lib/returned-columns query)]
    (is (=? {:name "count"}
            ag))
    (is (= {:base_type      :type/Integer
            :semantic_type  :type/Quantity
            :name           "count"
            :source         :aggregation
            :effective_type :type/Integer
            :display_name   "Count"
            :field_ref      [:aggregation 0]}
           (lib.convert.metadata/->legacy-column-metadata query ag)))))
