(ns metabase.query-processor-test.model-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(comment
  (let [mp   (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        base (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                 (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                                [(lib/=
                                                  (lib.metadata/field mp (mt/id :products :id))
                                                  (lib.metadata/field mp (mt/id :reviews :product_id)))])
                               (lib/with-join-fields :all))))
        mp2  (metabase.lib.test-util/metadata-provider-with-card-from-query
              mp 1200 base {:type :model})]
    (-> (lib/query mp2 (metabase.lib.metadata/card mp2 1200))
        lib/->legacy-MBQL
        metabase.query-processor.compile/compile
        #_(metabase.query-processor.preprocess/query->expected-cols)
        #_(metabase.query-processor.metadata/result-metadata))))

(comment
  (let [mp] (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                               [(lib/=
                                                 (lib.metadata/field mp (mt/id :products :id))
                                                 (lib.metadata/field mp (mt/id :reviews :product_id)))])
                              (lib/with-join-fields :all)))
                lib.convert/->legacy-MBQL)))

(deftest ^:parallel model-self-join-test
  (testing "Field references from model joined a second time can be resolved (#48639)"
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
      (mt/with-temp [:model/Card base-model
                     {:dataset_query
                      (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                          (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                                         [(lib/=
                                                           (lib.metadata/field mp (mt/id :products :id))
                                                           (lib.metadata/field mp (mt/id :reviews :product_id)))])
                                        (lib/with-join-fields :all)))
                          lib.convert/->legacy-MBQL)
                      :database_id (mt/id)
                      :name "Products+Reviews"
                      :type :model}
                     :model/Card consumer-model
                     {:dataset_query
                      (as-> (lib/query mp (lib.metadata/card mp (:id base-model))) $q
                        (lib/aggregate $q (lib/sum (->> $q
                                                        lib/available-aggregation-operators
                                                        (m/find-first (comp #{:sum} :short))
                                                        :columns
                                                        (m/find-first (comp #{"Price"} :display-name)))))
                        (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                           (lib/breakoutable-columns $q))
                                             (lib/with-temporal-bucket :month)))
                        (lib.convert/->legacy-MBQL $q))
                      :database_id (mt/id)
                      :name "Products+Reviews Summary"
                      :type :model}]
        (let [question (as-> (lib/query mp (lib.metadata/card mp (:id base-model))) $q
                         (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                            (lib/breakoutable-columns $q))
                                              (lib/with-temporal-bucket :month)))
                         (lib/aggregate $q (lib/avg (->> $q
                                                         lib/available-aggregation-operators
                                                         (m/find-first (comp #{:avg} :short))
                                                         :columns
                                                         (m/find-first (comp #{"Rating"} :display-name)))))
                         (lib/append-stage $q)
                         ;; XXX: START HERE: This one is failing to match the RHS column - something is busted with the
                         ;; display names and possibly more. Bodging the display name to "Reviews Created At 2: Month"
                         ;; is still busted; that generates bad SQL. Take a closer look at this crazy query and figure
                         ;; out the right way to reference it.
                         (lib/join $q (-> (lib/join-clause (lib.metadata/card mp (:id consumer-model))
                                                           [(lib/=
                                                             (-> (m/find-first (comp #{"Reviews → Created At: Month"} :display-name)
                                                                               (lib/breakoutable-columns $q))
                                                                 (lib/with-temporal-bucket :month))
                                                             (-> (m/find-first (comp #{"Reviews → Created At: Month"} :display-name)
                                                                               (lib/breakoutable-columns
                                                                                (lib/query mp (lib.metadata/card mp (:id consumer-model)))))
                                                                 (lib/with-temporal-bucket :month)))])
                                          (lib/with-join-fields :all)))
                         (lib/->legacy-MBQL $q))]
          (is (= ["Reviews → Created At: Month"
                  "Average of Rating"
                  "Products+Reviews Summary - Reviews → Created At: Month → Reviews → Created At: Month"
                  "Products+Reviews Summary - Reviews → Created At: Month → Sum"]
                 (->> (qp/process-query question)
                      mt/cols
                      (mapv :display_name)))))))))

; SELECT
;   "source"."Reviews__CREATED_AT_2" AS "Reviews__CREATED_AT_2",
;   "source"."avg" AS "avg",
;   "Products+Reviews Summary - Reviews → Created At: Month"."Reviews__CREATED_AT_2"
;     AS "Products+Reviews Summary - Reviews → Created At: _fb3e6a27",
;   "Products+Reviews Summary - Reviews → Created At: Month"."sum"
;     AS "Products+Reviews Summary - Reviews → Created At: _c0c62c4e"
; FROM (
;       SELECT
;         DATE_TRUNC('month', "source"."Reviews__CREATED_AT_2") AS "Reviews__CREATED_AT_2",
;         AVG("source"."RATING") AS "avg"
;       FROM (
;             SELECT
;               "PUBLIC"."PRODUCTS"."ID" AS "ID",
;               "PUBLIC"."PRODUCTS"."EAN" AS "EAN",
;               "PUBLIC"."PRODUCTS"."TITLE" AS "TITLE",
;               "PUBLIC"."PRODUCTS"."CATEGORY" AS "CATEGORY",
;               "PUBLIC"."PRODUCTS"."VENDOR" AS "VENDOR",
;               "PUBLIC"."PRODUCTS"."PRICE" AS "PRICE",
;               "PUBLIC"."PRODUCTS"."RATING" AS "RATING",
;               "PUBLIC"."PRODUCTS"."CREATED_AT" AS "CREATED_AT",
;               "Reviews_2"."ID" AS "Reviews_2__ID",
;               "Reviews_2"."PRODUCT_ID" AS "Reviews_2__PRODUCT_ID",
;               "Reviews_2"."REVIEWER" AS "Reviews_2__REVIEWER",
;               "Reviews_2"."RATING" AS "Reviews_2__RATING",
;               "Reviews_2"."BODY" AS "Reviews_2__BODY",
;               "Reviews_2"."CREATED_AT" AS "Reviews_2__CREATED_AT"
;             FROM "PUBLIC"."PRODUCTS"
;             LEFT JOIN "PUBLIC"."REVIEWS" AS "Reviews_2"
;               ON "PUBLIC"."PRODUCTS"."ID" = "Reviews_2"."PRODUCT_ID"
;           ) AS "source"
;       GROUP BY DATE_TRUNC('month', "source"."Reviews__CREATED_AT_2")
;       ORDER BY DATE_TRUNC('month', "source"."Reviews__CREATED_AT_2") ASC
;     ) AS "source"
; LEFT JOIN (
;            SELECT
;              DATE_TRUNC('month', "source"."Reviews__CREATED_AT_2") AS "Reviews__CREATED_AT_2",
;              SUM("source"."PRICE") AS "sum"
;            FROM (
;                  SELECT
;                    "PUBLIC"."PRODUCTS"."ID" AS "ID",
;                    "PUBLIC"."PRODUCTS"."EAN" AS "EAN",
;                    "PUBLIC"."PRODUCTS"."TITLE" AS "TITLE",
;
;                    "PUBLIC"."PRODUCTS"."CATEGORY" AS "CATEGORY",
;                    "PUBLIC"."PRODUCTS"."VENDOR" AS "VENDOR",
;                    "PUBLIC"."PRODUCTS"."PRICE" AS "PRICE",
;                    "PUBLIC"."PRODUCTS"."RATING" AS "RATING",
;                    "PUBLIC"."PRODUCTS"."CREATED_AT" AS "CREATED_AT",
;                    "Reviews"."ID" AS "Reviews__ID",
;                    "Reviews"."PRODUCT_ID" AS "Reviews__PRODUCT_ID",
;                    "Reviews"."REVIEWER" AS "Reviews__REVIEWER",
;                    "Reviews"."RATING" AS "Reviews__RATING",
;                    "Reviews"."BODY" AS "Reviews__BODY",
;                    "Reviews"."CREATED_AT" AS "Reviews__CREATED_AT"
;                  FROM "PUBLIC"."PRODUCTS"
;                  LEFT JOIN "PUBLIC"."REVIEWS" AS "Reviews"
;                  ON "PUBLIC"."PRODUCTS"."ID" = "Reviews"."PRODUCT_ID"
;                 ) AS "source"
;            GROUP BY DATE_TRUNC('month', "source"."Reviews__CREATED_AT_2")
;            ORDER BY DATE_TRUNC('month', "source"."Reviews__CREATED_AT_2") ASC
;           ) AS "Products+Reviews Summary - Reviews → Created At: Month"
; ON   DATE_TRUNC('month', "source"."Reviews__CREATED_AT_2")
;    = DATE_TRUNC('month', "Products+Reviews Summary - Reviews → Created At: Month"."Reviews__CREATED_AT_2")
; LIMIT 1048575 [42122-214]

; SELECT
;   "source"."ID" AS "ID",
;   "source"."EAN" AS "EAN",
;   "source"."TITLE" AS "TITLE",
;   "source"."CATEGORY" AS "CATEGORY",
;   "source"."VENDOR" AS "VENDOR",
;   "source"."PRICE" AS "PRICE",
;   "source"."RATING" AS "RATING",
;   "source"."CREATED_AT" AS "CREATED_AT",
;   "source"."Reviews__ID" AS "Reviews__ID",
;   "source"."Reviews__PRODUCT_ID" AS "Reviews__PRODUCT_ID",
;   "source"."Reviews__REVIEWER" AS "Reviews__REVIEWER",
;   "source"."Reviews__RATING" AS "Reviews__RATING",
;   "source"."Reviews__BODY" AS "Reviews__BODY",
;   "source"."Reviews__CREATED_AT" AS "Reviews__CREATED_AT"
; FROM (SELECT
;         "PUBLIC"."PRODUCTS"."ID" AS "ID",
;         "PUBLIC"."PRODUCTS"."EAN" AS "EAN",
;         "PUBLIC"."PRODUCTS"."TITLE" AS "TITLE",
;         "PUBLIC"."PRODUCTS"."CATEGORY" AS "CATEGORY",
;         "PUBLIC"."PRODUCTS"."VENDOR" AS "VENDOR",
;         "PUBLIC"."PRODUCTS"."PRICE" AS "PRICE",
;         "PUBLIC"."PRODUCTS"."RATING" AS "RATING",
;         "PUBLIC"."PRODUCTS"."CREATED_AT" AS "CREATED_AT",
;         "Reviews"."ID" AS "Reviews__ID",
;         "Reviews"."PRODUCT_ID" AS "Reviews__PRODUCT_ID",
;         "Reviews"."REVIEWER" AS "Reviews__REVIEWER",
;         "Reviews"."RATING" AS "Reviews__RATING",
;         "Reviews"."BODY" AS "Reviews__BODY",
;         "Reviews"."CREATED_AT" AS "Reviews__CREATED_AT"
;       FROM "PUBLIC"."PRODUCTS"
;       LEFT JOIN "PUBLIC"."REVIEWS" AS "Reviews"
;       ON "PUBLIC"."PRODUCTS"."ID" = "Reviews"."PRODUCT_ID"
;     ) AS "source"
; LIMIT 1048575
