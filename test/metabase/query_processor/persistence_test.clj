(ns metabase.query-processor.persistence-test
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [clojure.test :refer [deftest is testing]]
            [metabase.models :refer [Card PersistedInfo]]
            [metabase.models.persisted-info :as persisted-info]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- fake-persist-card! [card]
  (let [persisted-info (persisted-info/make-ready! (mt/user->id :rasta) card)]
    (db/update-where! PersistedInfo {:card_id (u/the-id card)}
                      :definition (json/encode
                                    (persisted-info/metadata->definition
                                      (:result_metadata card)
                                      (:table_name persisted-info)))
                      :active true
                      :state "persisted"
                      :query_hash (persisted-info/query-hash (:dataset_query card)))))

(deftest expand-mbql-top-level-params-test
  (mt/with-model-cleanup [PersistedInfo]
    (testing "Queries from cache if not sandboxed"
      (mt/with-current-user
        (mt/user->id :rasta)
        (mt/with-temp*
          [Card [card {:dataset_query (mt/mbql-query venues)
                       :dataset true
                       :database_id (mt/id)}]]
          (fake-persist-card! card)
          (is (str/includes?
                (:query (qp/compile

                          {:database (mt/id)
                           :query {:source-table (str "card__" (u/the-id card))}
                           :type :query}))
                "metabase_cache")))))
    (testing "Queries from source if sandboxed"
      (mt/with-gtaps
        {:gtaps {:venues {:query (mt/mbql-query venues)
                          :remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
         :attributes {"cat" 50}}
        (mt/with-temp*
          [Card [card {:dataset_query (mt/mbql-query venues)
                       :dataset true
                       :database_id (mt/id)}]]
          (fake-persist-card! card)
          (is (not (str/includes?
                     (:query (qp/compile
                               {:database (mt/id)
                                :query {:source-table (str "card__" (u/the-id card))}
                                :type :query}))
                     "metabase_cache"))))))))
