(ns metabase.search.spec-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :as models]
   [metabase.search.spec :as search.spec]
   [toucan2.core :as t2]))

(comment
  ;; Making sure we load the real specs for each model
  (models/keep-me))

(deftest test-qualify-column
  (is (= [:table.column :column] (#'search.spec/qualify-column :table :column)))
  (is (= :qualified.column (#'search.spec/qualify-column :table :qualified.column)))
  (is (= [:table.column :alias] (#'search.spec/qualify-column :table [:column :alias])))
  (is (= [:qualified.column :alias] (#'search.spec/qualify-column :table [:qualified.column :alias]))))

(deftest test-qualify-columns
  (is (= [[:table.column :column]
          :qualified.column
          [:table.column :alias]
          [:qualified.column :alias]]
         (search.spec/qualify-columns :table
                                      [:column
                                       :qualified.column
                                       [:column :alias]
                                       [:qualified.column :alias]]))))

(deftest test-has-table?
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

(deftest test-find-fields
  (is (= {:this    #{:name :description :collection_id :db_id}
          :related #{:field :table_id}}
         (#'search.spec/find-fields example-spec))))

(deftest replace-qualification-test
  (is (= :column (#'search.spec/replace-qualification :column :table :sable)))
  (is (= :sable.column (#'search.spec/replace-qualification :table.column :table :sable)))
  (is (= :table.column (#'search.spec/replace-qualification :table.column :cable :sable)))
  (is (= [:and :c.x [:or :c.y [:= :%now :b.z :c.xx]]]
         (#'search.spec/replace-qualification [:and :a.x [:or :a.y [:= :%now :b.z :a.xx]]] :a :c))))

(deftest search-model-hooks-test
  ;; TODO replace real specs with frozen test ones once things have stabilized

  (is (= #:model{:Card             #{{:search-model "card",
                                      :fields       #{:description
                                                      :archived
                                                      :archived_directly
                                                      :collection_position
                                                      :collection_id
                                                      :creator_id
                                                      :dataset_query
                                                      :display
                                                      :name
                                                      :type
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
                                                     [:= :updated.most_recent true]]}}}
         (#'search.spec/search-model-hooks (search.spec/spec "card"))))

  (is (= #:model{:Table      #{{:search-model "segment",
                                :fields       #{:description :schema :name :db_id}
                                :where        [:= :updated.id :this.table_id]}
                               {:search-model "table",
                                :fields
                                #{:active :description :schema :name :id :db_id :initial_sync_status :display_name
                                  :visibility_type :created_at :updated_at}
                                :where        [:= :updated.id :this.id]}},
                 :Database   #{{:search-model "table", :fields #{:name}, :where [:= :updated.id :this.db_id]}}
                 :Segment    #{{:search-model "segment"
                                :fields       #{:description :archived :table_id :name :id :created_at :updated_at}
                                :where        [:= :updated.id :this.id]}}
                 :Collection #{{:search-model "collection"
                                :fields       #{:authority_level :archived :description :name :type :id
                                                :archived_directly :location :namespace :created_at}
                                :where        [:= :updated.id :this.id]}}}
         (#'search.spec/merge-hooks
          [(#'search.spec/search-model-hooks (search.spec/spec "table"))
           (#'search.spec/search-model-hooks (search.spec/spec "segment"))
           (#'search.spec/search-model-hooks (search.spec/spec "collection"))]))))

(deftest search-models-to-update-test
  (is (= #{}
         (search.spec/search-models-to-update (t2/instance :model/Database {}))))
  (is (= #{["table" [:= 123 :this.db_id]]
           ["database" [:= 123 :this.id]]}
         (search.spec/search-models-to-update (t2/instance :model/Database {:id 123 :name "databass"}))))
  (is (= #{["segment" [:= 321 :this.table_id]]
           ["table" [:= 321 :this.id]]}
         (search.spec/search-models-to-update (t2/instance :model/Table {:id 321 :name "turn-tables"})))))
