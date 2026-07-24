(ns metabase-enterprise.data-studio.api.usage-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.measures.test-util :as measures.tu]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.candidates :as candidates]
   [metabase.usage-metadata.insights :as insights]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- candidate-row
  ([run-id]
   (candidate-row run-id {}))
  ([run-id overrides]
   (merge
    {:run_id                 run-id
     :candidate_type         :segment
     :table_id               (mt/id :orders)
     :signature_version      candidates/signature-version
     :signature_hash         (apply str (repeat 64 "b"))
     :signature              "[\"segment-api\"]"
     :definition             {:lib/type :mbql/query}
     :semantic_details       {:atom-count 1}
     :suggested_name         "Recent orders"
     :suggested_description  "Recent orders on Orders"
     :modeling_status        :missing
     :verified_source_count  1
     :official_source_count  0
     :popular_source_count   1
     :distinct_source_count  1
     :total_view_count       10
     :complexity             1}
    overrides)))

(defn- definition-signature
  [candidate-type table-id definition]
  (case candidate-type
    :measure
    (insights/canonical-signature
     [table-id (insights/canonical-signature (first (lib/aggregations definition 0)))])

    :segment
    (insights/canonical-signature
     [table-id
      (->> (lib/atomic-filters definition 0)
           (map insights/canonical-signature)
           sort
           vec)])))

(deftest superuser-list-and-dismiss-workflow-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate candidate (candidate-row (:id run))]
      (testing "instance-wide provenance is superuser-only"
        (mt/user-http-request :rasta :get 403 "ee/data-studio/usage-metadata/candidates"))
      (testing "list and detail expose the current snapshot"
        (is (=? {:total 1
                 :data [{:id (:id candidate)
                         :candidate_type "segment"
                         :modeling_status "missing"
                         :dismissed false}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates")))
        (is (=? {:id (:id candidate), :sources [], :matches []}
                (mt/user-http-request :crowberto :get 200
                                      (str "ee/data-studio/usage-metadata/candidates/" (:id candidate))))))
      (testing "table summaries use the same current snapshot"
        (is (=? {:total 1
                 :data [{:table {:id (mt/id :orders)}
                         :candidate_count 1
                         :counts {:segment {:missing 1}}}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/tables"))))
      (testing "dismiss and restore are global and immediately visible"
        (is (=? {:dismissed true}
                (mt/user-http-request :crowberto :post 200
                                      (str "ee/data-studio/usage-metadata/candidates/" (:id candidate) "/dismiss")
                                      {:reason "not useful"})))
        (is (= 0 (:total (mt/user-http-request :crowberto :get 200
                                               "ee/data-studio/usage-metadata/candidates"))))
        (is (=? {:dismissed false}
                (mt/user-http-request :crowberto :delete 200
                                      (str "ee/data-studio/usage-metadata/candidates/" (:id candidate) "/dismissal"))))))))

(deftest candidate-list-filtering-and-database-pagination-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate _first (candidate-row (:id run)
                                                                       {:suggested_name "Alpha"
                                                                        :signature_hash (apply str (repeat 64 "c"))
                                                                        :signature "[\"alpha\"]"})
                   :model/UsageMetadataCandidate second-candidate (candidate-row
                                                                   (:id run)
                                                                   {:candidate_type :measure
                                                                    :suggested_name "Zulu"
                                                                    :signature_hash (apply str (repeat 64 "d"))
                                                                    :signature "[\"zulu\"]"
                                                                    :verified_source_count 0
                                                                    :popular_source_count 0})]
      (testing "limit and offset are applied after deterministic database ordering"
        (is (=? {:total 2
                 :limit 1
                 :offset 1
                 :data [{:id (:id second-candidate), :suggested_name "Zulu"}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?sort=name&limit=1&offset=1"))))
      (testing "candidate type and search filters are applied before pagination"
        (is (=? {:total 1
                 :data [{:id (:id second-candidate), :candidate_type "measure"}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?candidate-type=measure&search=zulu")))))))

(deftest create-candidate-is-idempotent-test
  (mt/with-premium-features #{:library}
    (mt/with-model-cleanup [:model/Measure :model/Segment]
      (let [table-id           (mt/id :orders)
            measure-definition (measures.tu/measure-definition table-id (mt/id :orders :subtotal))
            segment-definition (measures.tu/segment-definition table-id (mt/id :orders :total) 100)
            measure-signature  (definition-signature :measure table-id measure-definition)
            segment-signature  (definition-signature :segment table-id segment-definition)]
        (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                             :trigger           :manual
                                                             :algorithm_version 1
                                                             :source_config     {}
                                                             :finished_at       (mi/now)}
                       :model/UsageMetadataCandidate measure-candidate
                       (candidate-row (:id run)
                                      {:candidate_type        :measure
                                       :signature_hash        (apply str (repeat 64 "e"))
                                       :signature             measure-signature
                                       :definition            measure-definition
                                       :suggested_name        "Mined order subtotal"
                                       :suggested_description "A persisted Measure candidate"})
                       :model/UsageMetadataCandidate segment-candidate
                       (candidate-row (:id run)
                                      {:signature_hash        (apply str (repeat 64 "f"))
                                       :signature             segment-signature
                                       :definition            segment-definition
                                       :suggested_name        "Mined large orders"
                                       :suggested_description "A persisted Segment candidate"})]
          (mt/with-temp-vals-in-db :model/Table table-id {:is_published true}
            (doseq [[candidate model expected-name]
                    [[measure-candidate :model/Measure "Created order subtotal"]
                     [segment-candidate :model/Segment "Created large orders"]]]
              (testing (str "creates " (name (:candidate_type candidate)) " from its persisted definition")
                (let [path     (str "ee/data-studio/usage-metadata/candidates/" (:id candidate) "/create")
                      response (mt/user-http-request :crowberto :post 200 path
                                                     {:name expected-name
                                                      :description "Admin override"})
                      entity   (:entity response)]
                  (is (= expected-name (:name entity)))
                  (is (= "Admin override" (:description entity)))
                  (is (= (:definition candidate) (:definition entity)))
                  (is (= "modeled" (get-in response [:candidate :modeling_status])))
                  (is (= 1 (count (get-in response [:candidate :matches]))))
                  (is (= (:id entity)
                         (get-in (mt/user-http-request :crowberto :post 200 path {}) [:entity :id])))
                  (is (= 1 (t2/count model :name expected-name))))))))))))
