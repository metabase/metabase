(ns metabase-enterprise.sandbox.api.dataset-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query   {:namespaces [metabase-enterprise.sandbox.api.dataset-test]}
                                                            metabase.test.data/native-query {:namespaces [metabase-enterprise.sandbox.api.dataset-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]))

(deftest dataset-parameter-test
  (testing "POST /api/dataset/parameter/values should respect sandboxing"
    (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (testing "with values_source_type=card"
        (mt/with-temp
          [:model/Card {source-card-id :id} {:database_id   (mt/id)
                                             :table_id      (mt/id :categories)
                                             :dataset_query (mt/mbql-query categories)}]
          (testing "when getting values"
            (let [get-values (fn [user]
                               (mt/user-http-request user :post 200 "/dataset/parameter/values"
                                                     {:parameter {:id                   "abc"
                                                                  :type                 "category"
                                                                  :name                 "CATEGORY"
                                                                  :values_source_type   "card"
                                                                  :values_source_config {:card_id     source-card-id
                                                                                         :value_field (mt/$ids $categories.name)}}}))]
              ;; returns much more if not sandboxed
              (is (> (-> (get-values :crowberto) :values count) 3))
              (is (=? {:values          [["African"] ["American"] ["Artisan"]]
                       :has_more_values false}
                      (get-values :rasta)))))
          (testing "when searching values"
            (let [search (fn [user]
                           (mt/user-http-request user :post 200 "/dataset/parameter/search/BBQ"
                                                 {:parameter {:id                   "abc"
                                                              :type                 "category"
                                                              :name                 "CATEGORY"
                                                              :values_source_type   "card"
                                                              :values_source_config {:card_id     source-card-id
                                                                                     :value_field (mt/$ids $categories.name)}}}))]
              ;; returns `BBQ` if not sandboxed
              (is (=? {:values          [["BBQ"]]
                       :has_more_values false}
                      (search :crowberto)))
              (is (=? {:values          []
                       :has_more_values false}
                      (search :rasta)))))))
      (testing "values_source_type=nil (values from fields)"
        (testing "when getting values"
          (let [get-values (fn [user]
                             (mt/user-http-request user :post 200 "/dataset/parameter/values"
                                                   {:parameter {:id                 "abc"
                                                                :type               "category"
                                                                :name               "CATEGORY"
                                                                :values_source_type nil}
                                                    :field_ids [(mt/id :categories :name)]}))]
            ;; returns much more if not sandboxed
            (is (> (-> (get-values :crowberto) :values count) 3))
            (is (=? {:values          [["Artisan"] ["African"] ["American"]]
                     :has_more_values false}
                    (get-values :rasta)))))
        (testing "when searching values"
          (let [search (fn [user]
                         (mt/user-http-request user :post 200 "/dataset/parameter/search/BBQ"
                                               {:parameter {:id                 "abc"
                                                            :type               "category"
                                                            :name               "CATEGORY"
                                                            :values_source_type nil}
                                                :field_ids [(mt/id :categories :name)]}))]
            ;; returns `BBQ` if not sandboxed
            (is (=? {:values [["BBQ"]]}
                    (search :crowberto)))
            (is (=? {:values          []}
                    (search :rasta)))))))))

(defn- mbql-queries
  "Every MBQL query (a map with `:stages`) nested anywhere in `x`."
  [x]
  (filter #(and (map? %) (contains? % :stages))
          (tree-seq coll? seq x)))

(deftest sandboxed-query-error-response-test
  (testing "A failed POST /api/dataset doesn't return the sandboxed query, sandbox Card SQL, or attribute values to a sandboxed user"
    ;; sandbox defs are thunks so `mt/id` resolves against the DB copy `with-gtaps-for-user!` creates
    (doseq [[sandbox-type sandbox-thunk attributes secrets]
            [[:remapping
              (fn []
                {:remappings {"price" ["variable" [:field (mt/id :venues :price) nil]]}})
              {"price" "1"}
              []]
             [:card
              (fn []
                {:query      (mt/native-query
                              {:query         (str "SELECT * FROM VENUES WHERE NAME <> {{secret_attr}} "
                                                   "AND 'SANDBOX-SQL-MARKER' <> ''")
                               :template-tags {"secret_attr" {:name         "secret_attr"
                                                              :display-name "secret_attr"
                                                              :type         "text"
                                                              :required     true
                                                              :id           "11111111-1111-1111-1111-111111111111"}}})
                 :remappings {"secret_attr" ["variable" ["template-tag" "secret_attr"]]}})
              {"secret_attr" "SECRET-ATTRIBUTE-VALUE"}
              ["SANDBOX-SQL-MARKER" "SECRET-ATTRIBUTE-VALUE"]]]]
      (testing sandbox-type
        (met/with-gtaps-for-user! :rasta
          {:gtaps      {:venues (sandbox-thunk)}
           :attributes attributes}
          (doseq [[failure-type query]
                  ;; H2 doesn't support full joins, so this fails in `check-features`, after sandboxing is applied
                  {:preprocessing (mt/mbql-query venues {:joins [{:source-table $$categories
                                                                  :alias        "c"
                                                                  :strategy     :full-join
                                                                  :condition    [:= $category_id &c.categories.id]}]})
                   ;; fails in the database, after the sandboxed query is compiled
                   :execution     (mt/mbql-query venues {:filter [:= [:+ $name 1] 2]})}]
            (testing failure-type
              (let [response (mt/user-http-request :rasta :post "dataset" query)]
                (is (= "failed" (:status response)))
                (is (not (contains? response :preprocessed)))
                (is (nil? (:native response)))
                (testing "the only query in the response is the one the user submitted"
                  (is (empty? (mbql-queries (dissoc response :json_query)))))
                (is (not-any? #(some (set (keys (:ex-data %))) [:query :sql :params])
                              (cons response (:via response))))
                (doseq [secret secrets]
                  (is (not (str/includes? (pr-str response) secret))))))))))))
