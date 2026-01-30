(ns ^:mb/driver-tests metabase.query-processor.native-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.date-time-zone-functions-test :as dt-fn-test]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest ^:parallel native-test
  (is (=? {:rows
           [["Plato Yeshua"]
            ["Felipinho Asklepios"]
            ["Kaneonuskatew Eiran"]
            ["Simcha Yan"]
            ["Quentin Sören"]
            ["Shad Ferdynand"]
            ["Conchúr Tihomir"]
            ["Szymon Theutrich"]
            ["Nils Gotam"]
            ["Frans Hevel"]
            ["Spiros Teofil"]
            ["Kfir Caj"]
            ["Dwight Gresham"]
            ["Broen Olujimi"]
            ["Rüstem Hebel"]]
           :cols
           [{:display_name "NAME"
             :source       :native
             :field_ref    [:field "NAME" {:base-type :type/Text}]
             :name         "NAME"
             :base_type    :type/Text}]}
          (qp.test-util/rows-and-cols
           (qp/process-query
            (mt/native-query
             {:query "select name from users;"}))))))

(deftest ^:parallel native-with-duplicate-column-names-test
  (testing "Should be able to run native query referring a question referring a question (#25988)"
    ;; TODO (Cam 10/7/25) -- this should be updated to run against all the SQL drivers, at least all the ones that
    ;; allow duplicate column names in the `SELECT` list (all of them, I think?). That was the original intention of
    ;; this test but because of a coding error it only ever ran against H2. I updated it to run against PG as well
    ;; until we can verify it works on other drivers without issue.
    #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
    (mt/test-drivers #{:h2 :postgres}
      (let [mp (lib.tu/mock-metadata-provider
                (mt/metadata-provider)
                {:cards [{:id              1
                          :dataset-query   {:native   {:query "select id, id from orders limit 1"}
                                            :database (mt/id)
                                            :type     :native}
                          :result-metadata [{:base_type      :type/BigInteger
                                             :display_name   "ID"
                                             :effective_type :type/BigInteger
                                             :field_ref      [:field "ID" {:base-type :type/BigInteger}]
                                             :fingerprint    nil
                                             :name           "ID"
                                             :semantic_type  :type/PK}
                                            {:base_type      :type/BigInteger
                                             :display_name   "ID"
                                             :effective_type :type/BigInteger
                                             :field_ref      [:field "ID_2" {:base-type :type/BigInteger}]
                                             :fingerprint    nil
                                             :name           "ID"
                                             :semantic_type  :type/PK}]}]})
            query (lib/query
                   mp
                   {:query    {:source-table "card__1"
                               :fields       [[:field "ID" {:base-type :type/Integer}]
                                              [:field "ID_2" {:base-type :type/Integer}]]}
                    :database (mt/id)
                    :type     :query})]
        (is (=? ["ID" "ID_2"]
                (map :name (mt/cols (qp/process-query query)))))))))

(deftest ^:parallel native-referring-question-referring-question-test
  (testing "Should be able to run native query referring a question referring a question (#25988)"
    (mt/with-driver :h2
      (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                        (mt/metadata-provider)
                                        {:cards [{:id            1
                                                  :dataset-query (mt/mbql-query products)}
                                                 {:id            2
                                                  :dataset-query {:query    {:source-table "card__1"}
                                                                  :database (u/the-id (mt/db))
                                                                  :type     :query}}]})
        (let [card-tag "#2"
              query    {:query         (format "SELECT CATEGORY, VENDOR FROM {{%s}} ORDER BY ID LIMIT 1" card-tag)
                        :template-tags {card-tag
                                        {:id           "afd1bf85-61d0-258c-99a7-a5b448728308"
                                         :name         card-tag
                                         :display-name card-tag
                                         :type         :card
                                         :card-id      2}}}]
          (is (= [["Gizmo" "Swaniawski, Casper and Hilll"]]
                 (mt/rows (qp/process-query (mt/native-query query))))))))))

(deftest convert-timezone-in-case-with-default-test
  (testing "convert-timezone inside case with a default value should not double-convert (#68712)"
    (mt/test-drivers (mt/normal-drivers-with-feature :convert-timezone)
      (mt/with-report-timezone-id! "UTC"
        (mt/dataset dt-fn-test/times-mixed
          (let [mp (mt/metadata-provider)
                query (lib/query mp (lib.metadata/table mp (mt/id :times)))
                dt-tz-col (lib.metadata/field mp (mt/id :times :dt_tz))
                index-col (lib.metadata/field mp (mt/id :times :index))
                convert-tz (fn [col]
                             (lib.options/ensure-uuid
                              [:convert-timezone {} col "Asia/Seoul"]))
                without-default (lib/case [[(lib/= index-col 1) (convert-tz dt-tz-col)]])
                q (-> query
                      (lib/expression "without-default" without-default)
                      (lib/filter (lib/= index-col 1))
                      (as-> q (lib/with-fields q [index-col
                                                  (lib/expression-ref q "without-default")])))
                results (qp/process-query q)
                [_idx original-without-default-val] (first (mt/rows results))]
            (testing "MBQL: case with and without default should produce the same result for matching rows"
              ;; Should not have a timezone
              (is (not (str/ends-with? original-without-default-val "Z"))))
            (mt/test-drivers (disj (mt/normal-drivers-with-feature :convert-timezone)
                                   ;; Don't test bigquery because it can't do the case with a default. It requires all
                                   ;; case branches to return the same type while others will coerce if they can.
                                   ;; The assertion above should be enough for BigQuery.
                                   #_:clj-kondo/ignore
                                   :bigquery-cloud-sdk)
              (let [mp (mt/metadata-provider)
                    query (lib/query mp (lib.metadata/table mp (mt/id :times)))
                    dt-tz-col (lib.metadata/field mp (mt/id :times :dt_tz))
                    index-col (lib.metadata/field mp (mt/id :times :index))
                    convert-tz (fn [col]
                                 (lib.options/ensure-uuid
                                  [:convert-timezone {} col "Asia/Seoul"]))
                    with-default (lib/case [[(lib/= index-col 1) (convert-tz dt-tz-col)]]
                                   dt-tz-col)
                    without-default (lib/case [[(lib/= index-col 1) (convert-tz dt-tz-col)]])
                    q (-> query
                          (lib/expression "with-default" with-default)
                          (lib/expression "without-default" without-default)
                          (lib/filter (lib/= index-col 1))
                          (as-> q (lib/with-fields q [index-col
                                                      (lib/expression-ref q "with-default")
                                                      (lib/expression-ref q "without-default")])))
                    results (qp/process-query q)
                    [_idx with-default-val without-default-val] (first (mt/rows results))]
                (testing "MBQL: case with and without default should produce the same result for matching rows"
                  (is (= without-default-val with-default-val original-without-default-val)))))))))))
