(ns metabase.query-processor.model-test
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]))

(deftest ^:parallel join-in-model-display-name-test
  (let [mp       (mt/metadata-provider)
        mp       (lib.tu/mock-metadata-provider
                  mp
                  {:cards [{:id            1
                            :dataset-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                               ;; I guess this join is named `Reviews`
                                               (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                                                              [(lib/=
                                                                                (lib.metadata/field mp (mt/id :products :id))
                                                                                (lib.metadata/field mp (mt/id :reviews :product_id)))])
                                                             (lib/with-join-fields :all))))
                            :database-id   (mt/id)
                            :name          "Products+Reviews"
                            :type          :model}]})
        question (binding [lib.metadata.calculation/*display-name-style* :long]
                   (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                     (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                        (lib/breakoutable-columns $q))
                                          (lib/with-temporal-bucket :month)))
                     (lib/aggregate $q (lib/avg (->> $q
                                                     lib/available-aggregation-operators
                                                     (m/find-first (comp #{:avg} :short))
                                                     :columns
                                                     (m/find-first (comp #{"Rating"} :display-name)))))))]
    (is (= ["Reviews → Created At: Month"
            "Average of Rating"]
           (mapv :display_name (qp.preprocess/query->expected-cols question))))))

;;; see also [[metabase.lib.field-test/model-self-join-test-display-name-test]]
(deftest ^:parallel model-self-join-test
  (testing "Field references from model joined a second time can be resolved (#48639)"
    (let [mp       (mt/metadata-provider)
          mp       (lib.tu/mock-metadata-provider
                    mp
                    {:cards [{:id            1
                              :dataset-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                                 ;; I guess this join is named `Reviews`
                                                 (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                                                                [(lib/=
                                                                                  (lib.metadata/field mp (mt/id :products :id))
                                                                                  (lib.metadata/field mp (mt/id :reviews :product_id)))])
                                                               (lib/with-join-fields :all))))
                              :database-id   (mt/id)
                              :name          "Products+Reviews"
                              :type          :model}]})
          mp       (lib.tu/mock-metadata-provider
                    mp
                    {:cards [{:id            2
                              :dataset-query (binding [lib.metadata.calculation/*display-name-style* :long]
                                               (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                                                 (lib/aggregate $q (lib/sum (->> $q
                                                                                 lib/available-aggregation-operators
                                                                                 (m/find-first (comp #{:sum} :short))
                                                                                 :columns
                                                                                 (m/find-first (comp #{"Price"} :display-name)))))
                                                 (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                                                    (lib/breakoutable-columns $q))
                                                                      (lib/with-temporal-bucket :month)))))
                              :database-id   (mt/id)
                              :name          "Products+Reviews Summary"
                              :type          :model}]})
          question (binding [lib.metadata.calculation/*display-name-style* :long]
                     (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                       (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                          (lib/breakoutable-columns $q))
                                            (lib/with-temporal-bucket :month)))
                       (lib/aggregate $q (lib/avg (->> $q
                                                       lib/available-aggregation-operators
                                                       (m/find-first (comp #{:avg} :short))
                                                       :columns
                                                       (m/find-first (comp #{"Rating"} :display-name)))))
                       (lib/append-stage $q)
                       (letfn [(find-col [query display-name]
                                 (or (m/find-first #(= (:display-name %) display-name)
                                                   (lib/breakoutable-columns query))
                                     (throw (ex-info "Failed to find column with display name"
                                                     {:display-name display-name
                                                      :found        (map :display-name (lib/breakoutable-columns query))}))))]
                         (lib/join $q (-> (lib/join-clause (lib.metadata/card mp 2)
                                                           [(lib/=
                                                             (lib/with-temporal-bucket (find-col $q "Reviews → Created At: Month")
                                                               :month)
                                                             (lib/with-temporal-bucket (find-col
                                                                                        (lib/query mp (lib.metadata/card mp 2))
                                                                                        "Reviews → Created At: Month")
                                                               :month))])
                                          (lib/with-join-fields :all))))))]
      (is (= ["Reviews → Created At: Month"
              "Average of Rating"
              ;; the 'correct' display name here seems to change any time we touch anything. Some previous values:
              #_"Products+Reviews Summary - Reviews → Created At: Month → Reviews → Created At: Month"
              #_"Products+Reviews Summary - Reviews → Created At: Month → Created At"
              "Products+Reviews Summary - Reviews → Created At: Month → Created At: Month"
              "Products+Reviews Summary - Reviews → Created At: Month → Sum of Price"]
             (mapv :display_name (qp.preprocess/query->expected-cols question)))))))

(defn- read-metadata [filename]
  (->> filename
       slurp
       (edn/read-string {:readers {'id (fn [id]
                                         (apply mt/id (map keyword (str/split (name id) #"\."))))}})))

(deftest ^:parallel preserve-model-display-names-test
  (testing "Edited display names for columns in Models should get preserved (#65532)"
    ;; 1. Create a Model of ORDERS joining PRODUCTS
    ;;
    ;; 2. Edit display name for "Products → ID", change to "[RENAMED]"
    ;;
    ;; 3. Create a new Saved Question using the first Model as its source
    ;;
    ;; 4. Run the Saved Question; results metadata incorrectly returns "Products → [RENAMED]"
    ;;
    ;; Note that the metadata here was captured from following these repro steps in the GUI in 0.55.0; the issue does
    ;; not seem to reproduce with newly created metadata. NOTE THAT THE METADATA CAPTURED FROM 55 IS WRONG! THE
    ;; METADATA FOR THE SECOND CARD INCORRECTLY USES the `:id` of `orders.id` for the `products.id` column. We need to
    ;; work around this 😢
    (let [model-metadata-55    (read-metadata "test/metabase/query_processor/model_test/preserve-model-display-names-test-metadata-1.edn")
          bad-card-metadata-55 (read-metadata "test/metabase/query_processor/model_test/preserve-model-display-names-test-metadata-2.edn")
          returned-col         (fn [query]
                                 (m/find-first (fn [col]
                                                 (and (= (:table-id col) (mt/id :products))
                                                      ;; the column `:id` in `bad-card-metadata-55` is WRONG, we
                                                      ;; should be stripping it out; look for a match based on the
                                                      ;; source column alias instead. Note the 55 metadata will have
                                                      ;; `ID_2` instead of `Products__ID`
                                                      (#{"Products__ID" "ID_2"} (:lib/source-column-alias col))))
                                               (lib.metadata.result-metadata/returned-columns query)))
          mp                   (mt/metadata-provider)
          model-query          (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                   (lib/join (lib.metadata/table mp (mt/id :products))))
          model-new-metadata   (mapv (fn [col]
                                       (cond-> col
                                         (= (:display-name col) "Products → ID")
                                         (assoc :display-name "[RENAMED]")))
                                     (lib.metadata.result-metadata/returned-columns model-query))]
      (doseq [with-55-model-metadata?    [true false]
              with-bad-55-card-metadata? [true false]]
        (testing (format "with-55-model-metadata? = %b; with-bad-55-card-metadata? = %b"
                         with-55-model-metadata?
                         with-bad-55-card-metadata?)
          (let [mp    (as-> mp $mp
                        (lib.tu/mock-metadata-provider
                         $mp
                         {:cards [{:id              1
                                   :type            :model
                                   :dataset-query   model-query
                                   :result-metadata (if with-55-model-metadata?
                                                      model-metadata-55
                                                      model-new-metadata)}]})
                        (lib.tu/mock-metadata-provider
                         $mp
                         {:cards [(let [query (lib/query $mp (lib.metadata/card $mp 1))]
                                    (merge
                                     {:id             2
                                      :dataset-query  query
                                      :source-card-id 1}
                                     (when with-bad-55-card-metadata?
                                       {:result-metadata bad-card-metadata-55})))]}))
                query (lib/query mp (lib.metadata/card mp 2))]
            (is (=? {:display-name "[RENAMED]"
                     :id           (if with-bad-55-card-metadata?
                                     (symbol "nil #_\"key is not present.\"") ; ID should be stripped
                                     (mt/id :products :id))}
                    (returned-col query)))
            ;; the bug only seems to trigger if we preprocess the query first
            (testing "preprocessed query should have the same returned display name"
              (is (=? {:display-name "[RENAMED]"
                       :id           (mt/id :products :id)}
                      (returned-col (qp.preprocess/preprocess query)))))))))))
