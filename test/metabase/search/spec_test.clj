(ns metabase.search.spec-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.spec :as search.spec]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel test-qualify-column
  (is (= [:table.column :column] (#'search.spec/qualify-column :table :column)))
  (is (= :qualified.column (#'search.spec/qualify-column :table :qualified.column)))
  (is (= [:table.column :alias] (#'search.spec/qualify-column :table [:column :alias])))
  (is (= [:qualified.column :alias] (#'search.spec/qualify-column :table [:qualified.column :alias]))))

(deftest ^:parallel test-qualify-columns
  (is (= [[:table.column :column]
          :qualified.column
          [:table.column :alias]
          [:qualified.column :alias]]
         (search.spec/qualify-columns :table
                                      [:column
                                       :qualified.column
                                       [:column :alias]
                                       [:qualified.column :alias]]))))

(deftest ^:parallel test-has-table?
  (is (#'search.spec/has-table? :table :table.column))
  (is (not (#'search.spec/has-table? :table :column)))
  (is (#'search.spec/has-table? nil :column))
  (is (not (#'search.spec/has-table? nil :table.column)))
  (is (not (#'search.spec/has-table? :table :qualified.column))))

(def ^:private example-spec
  {:model        :model/MadeUp
   :attrs        {:collection-id true
                  :db-id         :this.db_id
                  :table-id      :related.table_id}
   :search-terms [:this.name :description]
   :render-terms {:related-field [:lower :related.field]
                  :funky-field   :%now}})

(deftest ^:parallel test-find-fields
  (is (= {:this    #{:name :description :collection_id :db_id}
          :related #{:field :table_id}}
         (#'search.spec/find-fields example-spec))))

(deftest ^:parallel replace-qualification-test
  (is (= :column (#'search.spec/replace-qualification :column :table :sable)))
  (is (= :sable.column (#'search.spec/replace-qualification :table.column :table :sable)))
  (is (= :table.column (#'search.spec/replace-qualification :table.column :cable :sable)))
  (is (= [:and :c.x [:or :c.y [:= :%now :b.z :c.xx]]]
         (#'search.spec/replace-qualification [:and :a.x [:or :a.y [:= :%now :b.z :a.xx]]] :a :c))))

(deftest ^:parallel search-model-hooks-test
  ;; TODO replace real specs with frozen test ones once things have stabilized
  (is (= #:model{:Card             #{{:search-model "card",
                                      :fields       #{:id
                                                      :description
                                                      :archived
                                                      :archived_directly
                                                      :collection_position
                                                      :collection_id
                                                      :creator_id
                                                      :dashboard_id
                                                      :database_id
                                                      :dataset_query
                                                      :display
                                                      :document_id
                                                      :last_used_at
                                                      :name
                                                      :query_type
                                                      :type
                                                      :view_count
                                                      :created_at
                                                      :updated_at},
                                      :where        [:= :updated.id :this.id]}},
                 :Collection       #{{:search-model "card",
                                      :fields       #{:authority_level :name :namespace :type :location},
                                      :where        [:= :updated.id :this.collection_id]}},
                 :Revision         #{{:search-model "card",
                                      :fields       #{:user_id :timestamp},
                                      :where        [:and
                                                     [:= :updated.model_id :this.id]
                                                     [:= :updated.most_recent true]
                                                     [:= :updated.model "Card"]]}},
                 :ModerationReview #{{:search-model "card",
                                      :fields       #{:status},
                                      :where        [:and
                                                     [:= :updated.moderated_item_type "card"]
                                                     [:= :updated.moderated_item_id :this.id]
                                                     [:= :updated.most_recent true]]}}
                 ;; Disabled for performance reasons, see spec for :model/Card
                 #_#_:DashboardCard    #{{:search-model "card"
                                          :fields       nil
                                          :where        [:= :updated.card_id :this.id]}}}
         (#'search.spec/search-model-hooks (search.spec/spec "card")))))

(deftest ^:parallel search-model-hooks-test-2
  ;; TODO replace real specs with frozen test ones once things have stabilized
  (is (= #:model{:Table      #{{:search-model "segment",
                                :fields       #{:description :schema :name :db_id :display_name}
                                :where        [:= :updated.id :this.table_id]}
                               {:search-model "table",
                                :fields
                                #{:active :description :schema :name :id :db_id :initial_sync_status :display_name
                                  :visibility_type :view_count :created_at :updated_at :collection_id :is_published
                                  :data_layer :data_authority}
                                :where        [:= :updated.id :this.id]}},
                 :Database   #{{:search-model "table"
                                :fields #{:name :router_database_id}
                                :where [:= :updated.id :this.db_id]}}
                 :Segment    #{{:search-model "segment"
                                :fields       #{:description :archived :table_id :name :id :updated_at}
                                :where        [:= :updated.id :this.id]}}
                 :Collection #{{:search-model "collection"
                                :fields       #{:authority_level :archived :description :name :type :id
                                                :archived_directly :location :namespace :created_at}
                                :where        [:= :updated.id :this.id]}
                               {:search-model "table"
                                :fields       #{:authority_level :name :type :location}
                                :where        [:and [:= :this.is_published true] [:= :updated.id :this.collection_id]]}}}
         (#'search.spec/merge-hooks
          [(#'search.spec/search-model-hooks (search.spec/spec "table"))
           (#'search.spec/search-model-hooks (search.spec/spec "segment"))
           (#'search.spec/search-model-hooks (search.spec/spec "collection"))]))))

(deftest ^:parallel search-models-to-update-test
  (is (= #{}
         (search.spec/search-models-to-update (t2/instance :model/Database {}))))
  (is (= #{["table" [:= 123 :this.db_id]]
           ["database" [:= 123 :this.id]]}
         (search.spec/search-models-to-update (t2/instance :model/Database {:id 123 :name "databass"}))))
  (is (= #{["measure" [:= 321 :this.table_id]]
           ["segment" [:= 321 :this.table_id]]
           ["table" [:= 321 :this.id]]}
         (search.spec/search-models-to-update (t2/instance :model/Table {:id 321 :name "turn-tables"})))))

(deftest ^:parallel search-index-model-test
  (testing "All the required models descend from :hook/search-index\n"
    ;; TODO restore hooks to ModelIndex when toucan issue is resolved
    (let [expected-models (keys (dissoc (#'search.spec/model-hooks) :model/ModelIndex :model/ModelIndexValue))
          ;; Some models have submodels, so absorb those too
          expected-models (into (set expected-models) (mapcat descendants) expected-models)
          actual-models   (set (descendants :hook/search-index))]
      (doseq [em (sort-by name expected-models)]
        (testing (str "- " em)
          (is (actual-models em))))
      (testing "... and nothing else does"
        (is (empty? (sort-by name (remove expected-models actual-models))))))))

(deftest ^:synchronized model-hooks-cache-invalidates-on-spec-redefinition-test
  (testing "replacing a spec method invalidates the single-entry model-hooks cache"
    (let [spec-multifn search.spec/spec*]
      ;; Load lazily resolved models and warm the cache before replacing the method, which is the REPL/test-reload
      ;; path this guards.
      (search.spec/model-hooks)
      (let [original (get-method spec-multifn "card")]
        (try
          (.addMethod ^clojure.lang.MultiFn spec-multifn
                      "card"
                      (fn [_]
                        (update (original "card") :render-terms assoc :cache-probe :cache_probe)))
          (is (contains? (->> (get (search.spec/model-hooks) :model/Card)
                              (filter #(= "card" (:search-model %)))
                              first
                              :fields)
                         :cache_probe))
          (finally
            (.addMethod ^clojure.lang.MultiFn spec-multifn "card" original)
            ;; Do not leave the private cache holding the temporary method table for later tests.
            (search.spec/model-hooks)))))))

(deftest ^:synchronized model-hooks-cache-records-post-resolution-methods-test
  (testing "model hooks are cached only after collection sees one stable post-resolution method table"
    (let [original-specifications (mt/original-fn #'search.spec/specifications)
          spec-multifn            search.spec/spec*
          original-card           (get-method spec-multifn "card")
          calls                   (atom 0)
          redefined?              (atom false)]
      (try
        (mt/with-dynamic-fn-redefs [search.spec/specifications
                                    (fn []
                                      (swap! calls inc)
                                      (let [specs (original-specifications)]
                                        ;; Simulate a reload after the old card specification was read but before
                                        ;; the collection returns.
                                        (when (compare-and-set! redefined? false true)
                                          (.addMethod ^clojure.lang.MultiFn spec-multifn
                                                      "card"
                                                      (fn [_]
                                                        (update (original-card "card")
                                                                :render-terms assoc :cache-probe :cache_probe))))
                                        specs))]
          (reset! @#'search.spec/model-hooks-cache nil)
          (let [hooks (search.spec/model-hooks)]
            (is (contains? (->> (get hooks :model/Card)
                                (filter #(= "card" (:search-model %)))
                                first
                                :fields)
                           :cache_probe))
            (is (identical? hooks (search.spec/model-hooks)))
            (is (= 2 @calls))))
        (finally
          (.addMethod ^clojure.lang.MultiFn spec-multifn "card" original-card)
          (reset! @#'search.spec/model-hooks-cache nil)
          (search.spec/model-hooks))))))

(deftest ^:parallel direct-hook-where-fields-test
  (testing "single-key :id joins collapse to #{:id}"
    (is (= #{:id} (search.spec/hook-where-fields :model/Collection)))
    (is (= #{:id} (search.spec/hook-where-fields :model/Card)))
    (is (= #{:id} (search.spec/hook-where-fields :model/Table)))
    (is (= #{:id} (search.spec/hook-where-fields :model/Database)))))

(deftest ^:parallel joined-hook-where-fields-test
  (testing "multi-clause joins collect every :updated-qualified column referenced in the where"
    (is (= #{:most_recent :model_id :model} (search.spec/hook-where-fields :model/Revision)))
    (is (= #{:most_recent :moderated_item_id :moderated_item_type}
           (search.spec/hook-where-fields :model/ModerationReview)))))

(deftest ^:parallel model-without-hooks-has-no-where-fields-test
  (testing "a model that feeds no search-model hooks has nothing to capture"
    (is (nil? (search.spec/hook-where-fields :model/User)))))

(deftest ^:parallel index-version-hash-test
  (testing "index-version-hash returns a consistent value"
    (let [hash1 (search.spec/index-version-hash)
          hash2 (search.spec/index-version-hash)]
      (is (string? hash1))
      (is (= 64 (count hash1)) "SHA-256 hex string should be 64 characters")
      (is (= hash1 hash2) "Hash should be deterministic"))))
