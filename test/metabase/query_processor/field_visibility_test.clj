(ns ^:mb/driver-tests metabase.query-processor.field-visibility-test
  "Tests for behavior of fields with different visibility settings."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.field-visibility-test]}
                                                            metabase.test.data/run-mbql-query {:namespaces [metabase.query-processor.field-visibility-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   ;; binds mock metadata providers via the ambient store, which the code under test reads
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]))

;; make sure that rows where visibility_type = details-only are included and properly marked up
(defn- venues-cols-from-query []
  (-> (mt/run-mbql-query venues
        {:order-by [[:asc $id]]
         :limit    1})
      mt/cols
      set))

(deftest details-only-fields-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "sanity check -- everything should be returned before making changes"
      (is (=? (m/index-by :id (qp.test-util/expected-cols :venues))
              (m/index-by :id (venues-cols-from-query)))))
    (testing ":details-only fields should not be returned in normal queries"
      (tu/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:visibility_type :details-only}
        (is (=? (m/index-by :id (for [col (qp.test-util/expected-cols :venues)]
                                  (if (= (mt/id :venues :price) (u/the-id col))
                                    (assoc col :visibility_type :details-only)
                                    col)))
                (m/index-by :id (venues-cols-from-query))))))))

(deftest ^:parallel sensitive-fields-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Make sure :sensitive information fields are never returned by the QP"
      (is (=? {:cols (qp.test-util/expected-cols :users [:id :name :last_login])
               :rows [[1 "Plato Yeshua"]
                      [2 "Felipinho Asklepios"]
                      [3 "Kaneonuskatew Eiran"]
                      [4 "Simcha Yan"]
                      [5 "Quentin Sören"]
                      [6 "Shad Ferdynand"]
                      [7 "Conchúr Tihomir"]
                      [8 "Szymon Theutrich"]
                      [9 "Nils Gotam"]
                      [10 "Frans Hevel"]
                      [11 "Spiros Teofil"]
                      [12 "Kfir Caj"]
                      [13 "Dwight Gresham"]
                      [14 "Broen Olujimi"]
                      [15 "Rüstem Hebel"]]}
              ;; Filter out the timestamps from the results since they're hard to test :/
              (mt/format-rows-by
               [int identity]
               (qp.test-util/rows-and-cols
                (mt/run-mbql-query users
                  {:order-by [[:asc $id]]}))))))))

(deftest ^:parallel sensitive-field-hidden-in-model-query-test
  (testing "a model whose stored result_metadata still lists a field made :sensitive after creation drops that column (#45919)"
    (mt/test-drivers (mt/normal-drivers)
      (mt/dataset test-data
        ;; the model's result-metadata is computed while PASSWORD is still visible, then the field is flipped to
        ;; :sensitive -- reproducing a field made sensitive after the model was created
        (let [mp0     (mt/metadata-provider)
              base-mp (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                       [(lib/query mp0 (lib.metadata/table mp0 (mt/id :people)))])
              mp      (lib.tu/merged-mock-metadata-provider
                       base-mp
                       {:cards  [{:id 1, :type :model}]
                        :fields [{:id (mt/id :people :password), :visibility-type :sensitive}]})]
          (qp.store/with-metadata-provider mp
            (let [col-names (into #{}
                                  (map (comp u/lower-case-en :name))
                                  (mt/cols (qp/process-query (-> (lib/query mp (lib.metadata/card mp 1))
                                                                 (lib/limit 1)))))]
              (testing "the sensitive PASSWORD column is dropped"
                (is (not (contains? col-names "password"))))
              (testing "a normal column (EMAIL) is still returned"
                (is (contains? col-names "email"))))))))))
