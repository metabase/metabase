(ns metabase.query-permissions.impl-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-permissions.impl-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log.capture :as log.capture]
   [metabase.util.malli.fn :as mu.fn]
   [toucan2.core :as t2]))

;;; ---------------------------------------------- Permissions Checking ----------------------------------------------

(defn- card []
  {:dataset_query {:database (mt/id), :type :native, :native {:query "SELECT 1;"}}})

(defn- card-in-collection [collection-or-id]
  (assoc (card) :collection_id (u/the-id collection-or-id)))

(deftest card-in-collection-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection collection {}
                   :model/Collection other      {}
                   :model/Card       root-card  (card)
                   :model/Card       card       (card-in-collection collection)]
      (letfn [(can-read? [card]  (mi/can-read? (t2/hydrate card :can_read)))
              (can-write? [card] (mi/can-write? (t2/hydrate card :can_write)))]
        (mt/with-test-user :rasta
          (testing "without permissions, neither Card is readable"
            (is (false? (can-read? root-card)))
            (is (false? (can-read? card))))
          (testing "permissions for other Collection give nothing"
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) other)
            (is (false? (can-read? root-card)))
            (is (false? (can-read? card)))
            (is (false? (can-write? root-card)))
            (is (false? (can-write? card))))
          (testing "root Collection read permissions make root Card readable, not writable, and not Card in Collection"
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection/root-collection)
            (is (true? (can-read? root-card)))
            (is (false? (can-write? root-card)))
            (is (false? (can-read? card))))
          (testing "root Collection write permissions make root Card writable, and not Card in Collection"
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection/root-collection)
            (is (true? (can-write? root-card)))
            (is (false? (can-write? card))))
          (testing "Collection read permissions make its Card readable, not writable"
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (is (true? (can-read? card)))
            (is (false? (can-write? card))))
          (testing "Collection write permissions make its Card writable"
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection)
            (is (true? (can-write? card)))))))))

(defn- native [query]
  {:database (mt/id)
   :type     :native
   :native   {:query query}})

(deftest ^:parallel native-query-perms-test
  (is (= {:perms/create-queries :query-builder-and-native
          :perms/view-data :unrestricted}
         (query-perms/required-perms-for-query
          (native "SELECT count(*) FROM toucan_sightings;")))))

(deftest ^:parallel mbql-query-test
  (is (= {:perms/view-data      {(mt/id :venues) :unrestricted}
          :perms/create-queries {(mt/id :venues) :query-builder}}
         (query-perms/required-perms-for-query (mt/mbql-query venues))))
  (is (= {:perms/view-data      {(mt/id :venues) :unrestricted}
          :perms/create-queries {(mt/id :venues) :query-builder}}
         (query-perms/required-perms-for-query
          {:query    {:source-table (mt/id :venues)
                      :filter       [:> [:field (mt/id :venues :id) nil] 10]}
           :type     :query
           :database (mt/id)}))))

(deftest mbql-query-test-2
  (testing "if current user is bound, we should ignore that for purposes of calculating query permissions"
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (u/the-id db) :schema nil}
                   :model/Field    _     {:table_id (u/the-id table)}]
      (mt/with-no-data-perms-for-all-users!
        (mt/with-current-user (mt/user->id :rasta)
          (is (= {:perms/view-data      {(u/the-id table) :unrestricted}
                  :perms/create-queries {(u/the-id table) :query-builder}}
                 (query-perms/required-perms-for-query
                  {:database (u/the-id db)
                   :type     :query
                   :query    {:source-table (u/the-id table)}}))))))))

(deftest ^:parallel mbql-query-test-3
  (testing "should be able to calculate permissions of a query before normalization"
    (is (= {:perms/view-data      {(mt/id :venues) :unrestricted}
            :perms/create-queries {(mt/id :venues) :query-builder}}
           (query-perms/required-perms-for-query
            {:query    {"SOURCE_TABLE" (mt/id :venues)
                        "FILTER"       [">" (mt/id :venues :id) 10]}
             :type     :query
             :database (mt/id)})))))

(deftest ^:parallel mbql-query-with-join-test
  (testing "you should need perms for both tables if you include a JOIN"
    (is (= {:perms/view-data      {(mt/id :venues) :unrestricted
                                   (mt/id :checkins) :unrestricted}
            :perms/create-queries {(mt/id :venues) :query-builder
                                   (mt/id :checkins) :query-builder}}
           (query-perms/required-perms-for-query
            (mt/mbql-query checkins
              {:order-by [[:asc $checkins.venue_id->venues.name]]}))))))

(defn- query-with-source-card [card]
  {:database lib.schema.id/saved-questions-virtual-database-id, :type "query", :query {:source-table (str "card__" (u/the-id card))}})

(deftest ^:parallel nested-query-test
  (testing "if source card is *not* in a Collection, we require Root Collection read perms"
    (mt/with-temp [:model/Card card {:dataset_query {:database (mt/id)
                                                     :type     :query
                                                     :query    {:source-table (mt/id :venues)}}}]
      (is (= {:source-card-ids #{(u/the-id card)}}
             (query-perms/required-perms-for-query
              (query-with-source-card card)))))))

(deftest ^:parallel nested-query-test-2
  (testing "if source Card *is* in a Collection, we require read perms for that Collection"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (u/the-id collection)
                                     :dataset_query {:database (mt/id)
                                                     :type     :query
                                                     :query    {:source-table (mt/id :venues)}}}]
      (is (= {:source-card-ids #{(u/the-id card)}}
             (query-perms/required-perms-for-query
              (query-with-source-card card)))))))

(deftest ^:parallel nested-query-with-join-test
  (testing (str "If you run a query that uses a Card as its source query, and the source query has a JOIN, then you "
                "should still only need Permissions for the Collection that Card is in.")
    (mt/with-temp [:model/Card card {:dataset_query
                                     {:database (mt/id)
                                      :type     :query
                                      :query    {:source-table (mt/id :checkins)
                                                 :order-by     [[:asc [:field (mt/id :users :id) {:source-field (mt/id :checkins :user_id)}]]]}}}]
      (is (= {:source-card-ids #{(u/the-id card)}}
             (query-perms/required-perms-for-query
              (query-with-source-card card)))))))

(deftest ^:parallel nested-native-query-test
  (testing (str "doesn't matter if it's a NATIVE query as the source; you should still just need read perms for the "
                "Card's collection")
    (mt/with-temp [:model/Card card {:dataset_query {:database (mt/id)
                                                     :type     :native
                                                     :native   {:query "SELECT * FROM CHECKINS"}}}]
      (is (= {:source-card-ids #{(u/the-id card)}}
             (query-perms/required-perms-for-query
              (query-with-source-card card)))))))

(deftest ^:parallel nested-native-query-test-2
  (testing (str "However if you just pass in the same query directly as a `:source-query` you will still require "
                "READWRITE permissions to save the query since we can't verify that it belongs to a Card that you can view.")
    (is (= {:perms/view-data :unrestricted
            :perms/create-queries :query-builder-and-native}
           (query-perms/required-perms-for-query
            {:database (mt/id)
             :type     :query
             :query    {:source-query {:native "SELECT * FROM CHECKINS"}}}
            :throw-exceptions? true)))))

(deftest ^:parallel invalid-queries-test
  (testing "invalid/legacy queries should return perms for something that doesn't exist so no one gets to see it"
    (is (= {:perms/create-queries {0 :query-builder}}
           (query-perms/required-perms-for-query
            (assoc-in (lib/query (mt/metadata-provider) (mt/mbql-query venues))
                      [:stages 0 :filters]
                      [[:WOW {:lib/uuid (str (random-uuid))} 100 200]]))))))

(deftest ^:parallel query-that-cannot-be-normalized-test
  (testing "a query that cannot be converted to MBQL 5 is refused, even for an admin, with or without schemas"
    ;; written out by hand because they must not be valid queries
    (doseq [query    [{:database (mt/id), :type :native, :native {:query "SELECT 1"}, :stages []}
                      {:lib/type "mbql/query", :database (mt/id), :type "native"
                       :stages   [{:lib/type "mbql.stage/native", :native "SELECT 1"}]}
                      {:type :native, :native {:query "SELECT 1"}}
                      {:database (mt/id)}
                      {:database (mt/id), :type :internal, :fn "x"}]
            enforce? [true false]]
      (testing (pr-str query enforce?)
        (binding [mu.fn/*enforce* enforce?]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot be normalized"
                                (query-perms/required-perms-for-query query)))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot be normalized"
                                (query-perms/query->source-ids query)))
          (mt/with-test-user :crowberto
            (is (false? (query-perms/can-run-query? query)))
            (is (false? (query-perms/can-run-query-with-resolved-source-ids? query {:table-ids #{(mt/id :venues)}})))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot be normalized"
                                  (query-perms/can-run-query? query false true)))))))))

(deftest ^:parallel joins-test
  (testing "Are permissions calculated correctly for JOINs?"
    (mt/with-temp [:model/Card {card-id :id} (qp.test-util/card-with-source-metadata-for-query
                                              (mt/mbql-query checkins
                                                {:aggregation [[:sum $id]]
                                                 :breakout    [$user_id]}))]
      (is (= {:card-ids             #{card-id}
              :perms/view-data      {(mt/id :users) :unrestricted
                                     (mt/id :checkins) :unrestricted}
              :perms/create-queries {(mt/id :users) :query-builder}}
             (query-perms/required-perms-for-query
              (mt/mbql-query users
                {:joins [{:fields       :all
                          :alias        "__alias__"
                          :source-table (str "card__" card-id)
                          :condition    [:=
                                         $id
                                         [:field "USER_ID" {:base-type :type/Integer, :join-alias "__alias__"}]]}]
                 :limit 10})
              :throw-exceptions? true)))
      (is (= {:perms/view-data      {(mt/id :users) :unrestricted
                                     (mt/id :checkins) :unrestricted}
              :perms/create-queries {(mt/id :users) :query-builder
                                     (mt/id :checkins) :query-builder}}
             (query-perms/required-perms-for-query
              (mt/mbql-query users
                {:joins [{:alias        "c"
                          :source-table $$checkins
                          :condition    [:= $id &c.*USER_ID/Integer]}]})
              :throw-exceptions? true))))))

(deftest ^:parallel query->source-ids-join-cards-test
  (testing "query->source-ids should return both card IDs when joining one card to another"
    (mt/with-temp [:model/Card {card-1-id :id} (qp.test-util/card-with-source-metadata-for-query
                                                (mt/mbql-query venues
                                                  {:aggregation [[:count]]
                                                   :breakout    [$id]}))
                   :model/Card {card-2-id :id} (qp.test-util/card-with-source-metadata-for-query
                                                (mt/mbql-query checkins
                                                  {:aggregation [[:sum $id]]
                                                   :breakout    [$venue_id]}))]
      (let [query {:database (mt/id)
                   :type     :query
                   :query    {:source-table (str "card__" card-1-id)
                              :joins        [{:fields       :all
                                              :alias        "joined_card"
                                              :source-table (str "card__" card-2-id)
                                              :condition    [:=
                                                             [:field "ID" {:base-type :type/Integer}]
                                                             [:field "VENUE_ID" {:base-type :type/Integer, :join-alias "joined_card"}]]}]}}]
        (is (= #{card-1-id card-2-id}
               (:card-ids
                (query-perms/query->source-ids
                 (qp.preprocess/preprocess
                  query)))))))))

(defn- orders-joining-products-query
  "An MBQL 5 query of the ORDERS Table of the mock metadata provider, with a join against its PRODUCTS Table."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/join (lib/join-clause (meta/table-metadata :products)
                                 [(lib/= (meta/field-metadata :orders :product-id)
                                         (meta/field-metadata :products :id))]))))

(defn- native-orders-query
  "A native MBQL 5 query against the mock metadata provider."
  []
  (lib/native-query meta/metadata-provider "SELECT * FROM ORDERS"))

(def ^:private first-stage [:stages 0])

(def ^:private second-stage [:stages 1])

(def ^:private join-stage
  "The path of the stage of the join in [[orders-joining-products-query]]."
  [:stages 0 :joins 0 :stages 0])

(defn- from-card
  "`query` with the stage at `stage-path` marked as a stage of the Card with `card-id`, the way preprocessing marks
  the stages it puts in place of a `:source-card`."
  [query stage-path card-id]
  (assoc-in query (conj stage-path :qp/stage-is-from-source-card) card-id))

(defn- sandboxed
  "`query` with the stage at `stage-path` marked as a sandboxed stage for the Table with `table-id`, the way
  sandboxing marks the stages it puts in place of a read of that Table."
  [query stage-path table-id]
  (assoc-in query (conj stage-path :query-permissions/sandboxed-table) table-id))

(defn- joining-native-products
  "`query`, an [[orders-joining-products-query]], with the join reading a native query in place of PRODUCTS."
  [query]
  (assoc-in query
            [:stages 0 :joins 0 :stages]
            (:stages (lib/native-query meta/metadata-provider "SELECT * FROM PRODUCTS"))))

(deftest ^:parallel query->source-ids-ad-hoc-test
  (testing "an ad-hoc query needs query permissions for every Table it reads, the ones it joins included"
    (is (= {:table-ids       #{(meta/id :orders) (meta/id :products)}
            :table-query-ids #{(meta/id :orders) (meta/id :products)}}
           (query-perms/query->source-ids (orders-joining-products-query)))))
  (testing "a `:source-card` that preprocessing has not resolved adds no source IDs"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:cards [{:id            1
                        :name          "Orders"
                        :database-id   (meta/id)
                        :dataset-query (lib/query meta/metadata-provider (meta/table-metadata :orders))}]})]
      (is (nil? (query-perms/query->source-ids (lib/query mp (lib.metadata/card mp 1))))))))

(deftest ^:parallel query->source-ids-card-test
  (testing "a stage of a Card is read with the permissions of the Card"
    (testing "and so is a join inside it"
      (is (= {:card-ids  #{1}
              :table-ids #{(meta/id :orders) (meta/id :products)}}
             (query-perms/query->source-ids
              (from-card (orders-joining-products-query) first-stage 1)))))
    (testing "and so is a stage that feeds into it"
      (is (= {:card-ids  #{1}
              :table-ids #{(meta/id :orders) (meta/id :products)}}
             (query-perms/query->source-ids
              (-> (orders-joining-products-query)
                  lib/append-stage
                  (from-card second-stage 1))))))
    (testing "but not a join in a later stage, which is ad hoc"
      (is (= {:card-ids        #{1}
              :table-ids       #{(meta/id :orders) (meta/id :products) (meta/id :people)}
              :table-query-ids #{(meta/id :people)}}
             (query-perms/query->source-ids
              (-> (orders-joining-products-query)
                  (from-card first-stage 1)
                  lib/append-stage
                  (lib/join -1 (lib/join-clause (meta/table-metadata :people)
                                                [(lib/= (meta/field-metadata :orders :user-id)
                                                        (meta/field-metadata :people :id))])))))))
    (testing "a Card joined to an ad-hoc query does not cover the Table the query reads"
      (is (= {:card-ids        #{1}
              :table-ids       #{(meta/id :orders) (meta/id :products)}
              :table-query-ids #{(meta/id :orders)}}
             (query-perms/query->source-ids
              (from-card (orders-joining-products-query) join-stage 1)))))))

(deftest ^:parallel query->source-ids-sandbox-test
  (testing "a sandboxed stage needs query permissions for the sandboxed Table, not for the Table the Sandbox reads"
    (is (= {:table-ids       #{(meta/id :orders) (meta/id :products)}
            :table-query-ids #{(meta/id :orders)}}
           (query-perms/query->source-ids
            (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                (sandboxed first-stage (meta/id :orders))
                lib/append-stage)))))
  (testing "a stage that feeds into a sandboxed stage is part of the Sandbox"
    (is (= {:table-ids       #{(meta/id :orders) (meta/id :products)}
            :table-query-ids #{(meta/id :orders)}}
           (query-perms/query->source-ids
            (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                lib/append-stage
                (sandboxed second-stage (meta/id :orders))))))
    (testing "even when it is a sandboxed stage of the same Sandbox itself"
      (is (= {:table-ids       #{(meta/id :orders) (meta/id :products)}
              :table-query-ids #{(meta/id :orders)}}
             (query-perms/query->source-ids
              (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                  lib/append-stage
                  (sandboxed first-stage (meta/id :orders))
                  (sandboxed second-stage (meta/id :orders))
                  lib/append-stage))))))
  (testing "a native Sandbox does not need native permissions"
    (is (= {:table-ids       #{(meta/id :orders)}
            :table-query-ids #{(meta/id :orders)}}
           (query-perms/query->source-ids
            (-> (native-orders-query)
                (sandboxed first-stage (meta/id :orders))
                lib/append-stage)))))
  (testing "a sandboxed stage of a Card is read with the permissions of the Card"
    (is (= {:card-ids  #{1}
            :table-ids #{(meta/id :orders)}}
           (query-perms/query->source-ids
            (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                (sandboxed first-stage (meta/id :orders))
                lib/append-stage
                (from-card second-stage 1)))))))

(deftest ^:parallel query->source-ids-sandbox-and-join-test
  (testing "a join of a sandboxed stage feeds into it, so it is part of the Sandbox"
    (is (= {:table-ids       #{(meta/id :orders) (meta/id :products) (meta/id :people)}
            :table-query-ids #{(meta/id :people)}}
           (query-perms/query->source-ids
            (sandboxed (orders-joining-products-query) first-stage (meta/id :people)))))
    (testing "but a native query it joins is still one the user would need native permissions for"
      (is (= {:table-ids       #{(meta/id :orders) (meta/id :people)}
              :table-query-ids #{(meta/id :people)}
              :native?         true}
             (query-perms/query->source-ids
              (-> (orders-joining-products-query)
                  joining-native-products
                  (sandboxed first-stage (meta/id :people))))))))
  (testing "a sandboxed stage in a join needs query permissions for the sandboxed Table"
    (testing "next to the Table an ad-hoc query reads"
      (is (= {:table-ids       #{(meta/id :orders) (meta/id :products) (meta/id :people)}
              :table-query-ids #{(meta/id :orders) (meta/id :people)}}
             (query-perms/query->source-ids
              (sandboxed (orders-joining-products-query) join-stage (meta/id :people))))))
    (testing "but not when the join is inside a stage of a Card"
      (is (= {:card-ids  #{1}
              :table-ids #{(meta/id :orders) (meta/id :products) (meta/id :people)}}
             (query-perms/query->source-ids
              (-> (orders-joining-products-query)
                  (sandboxed join-stage (meta/id :people))
                  (from-card first-stage 1))))))))

(deftest ^:parallel query->source-ids-native-test
  (testing "a native query needs native permissions"
    (is (= {:native? true}
           (query-perms/query->source-ids (native-orders-query)))))
  (testing "and so does an MBQL query on top of a native stage"
    (is (= {:native? true}
           (query-perms/query->source-ids (lib/append-stage (native-orders-query))))))
  (testing "and so does a query joining a native stage"
    (is (= {:table-ids       #{(meta/id :orders)}
            :table-query-ids #{(meta/id :orders)}
            :native?         true}
           (query-perms/query->source-ids
            (joining-native-products (orders-joining-products-query))))))
  (testing "the native query of a Card is read with the permissions of the Card"
    (is (= {:card-ids #{1}}
           (query-perms/query->source-ids
            (lib/append-stage (from-card (native-orders-query) first-stage 1)))))
    (testing "when it feeds into a stage of the Card"
      (is (= {:card-ids #{1}}
             (query-perms/query->source-ids
              (-> (native-orders-query)
                  lib/append-stage
                  (from-card second-stage 1))))))
    (testing "when a stage of the Card joins it"
      (is (= {:card-ids  #{1}
              :table-ids #{(meta/id :orders)}}
             (query-perms/query->source-ids
              (-> (orders-joining-products-query)
                  joining-native-products
                  (from-card first-stage 1))))))))

(deftest ^:parallel query->source-ids-native-only-query-test
  (testing "a query that is one native stage and nothing else needs native permissions whatever keys the stage has"
    (doseq [query [(from-card (native-orders-query) first-stage 1)
                   (sandboxed (native-orders-query) first-stage (meta/id :orders))]]
      (is (=? {:native? true}
              (query-perms/query->source-ids query)))
      (is (=? {:perms/create-queries :query-builder-and-native, :perms/view-data :unrestricted}
              (query-perms/required-perms-for-query query :already-preprocessed? true))))))

(deftest ^:parallel native-query-that-cannot-be-preprocessed-test
  (testing (str "a query with a native stage that cannot be preprocessed, such as one with a template tag that has no "
                "value, still requires native permissions")
    (doseq [query [{:database (mt/id)
                    :type     :native
                    :native   {:query         "SELECT * FROM venues WHERE id = {{id}}"
                               :template-tags {"id" {:name "id", :display-name "ID", :type :text}}}}
                   (lib/append-stage (lib/native-query (mt/metadata-provider) "SELECT * FROM venues WHERE id = {{id}}"))]]
      (testing (pr-str query)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Error calculating permissions"
                              (query-perms/required-perms-for-query query :throw-exceptions? true)))
        (is (= {:perms/create-queries :query-builder-and-native
                :perms/view-data      :unrestricted}
               (query-perms/required-perms-for-query query)))))))

(defn- native-queries-that-cannot-be-preprocessed
  [stage-key]
  (let [mp       (mt/metadata-provider)
        unfilled (lib/native-query mp "SELECT * FROM venues WHERE id = {{id}}")]
    [(assoc-in unfilled [:stages 0 stage-key] 1)
     (assoc-in (lib/append-stage unfilled) [:stages 0 stage-key] 1)
     (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
         (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :checkins)) [(lib/= 1 1)]))
         (assoc-in [:stages 0 :joins 0 :stages] (:stages (lib/native-query mp "SELECT * FROM checkins")))
         (assoc-in [:stages 0 :joins 0 :stages 0 stage-key] 1)
         (assoc-in [:stages 0 :source-table] Integer/MAX_VALUE))
     ;; written out by hand because it has to be legacy MBQL
     {:database (mt/id)
      :type     :native
      :native   {:query         "SELECT * FROM venues WHERE id = {{id}}"
                 :template-tags {"id" {:name "id", :display-name "ID", :type :text}}
                 stage-key      1}}]))

(deftest ^:parallel native-query-with-keys-only-the-qp-sets-that-cannot-be-preprocessed-test
  (testing "the native stage of a query that cannot be preprocessed requires native permissions whatever keys it has"
    (doseq [stage-key [:qp/stage-is-from-source-card :query-permissions/sandboxed-table]
            query     (native-queries-that-cannot-be-preprocessed stage-key)
            enforce?  [true false]]
      (testing (pr-str stage-key enforce? (dissoc query :lib/metadata))
        (binding [mu.fn/*enforce* enforce?]
          (is (= {:perms/create-queries :query-builder-and-native
                  :perms/view-data      :unrestricted}
                 (query-perms/required-perms-for-query query))))))))

(deftest native-query-with-keys-only-the-qp-sets-needs-native-permission-test
  (testing "a key that only the QP sets does not let a user run or save a native query that cannot be preprocessed"
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
      (let [grant! #(perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries %)]
        (mt/with-test-user :rasta
          (doseq [stage-key [:qp/stage-is-from-source-card :query-permissions/sandboxed-table]
                  query     (native-queries-that-cannot-be-preprocessed stage-key)]
            (testing (pr-str stage-key (dissoc query :lib/metadata))
              (grant! :query-builder)
              (is (false? (query-perms/can-run-query? query)))
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot save this Question"
                                    (query-perms/check-run-permissions-for-query query)))
              (grant! :query-builder-and-native)
              (is (true? (query-perms/can-run-query? query)))
              (is (nil? (query-perms/check-run-permissions-for-query query))))))))))

(deftest ^:parallel query->resolved-source-ids-test
  (testing "table-sourced queries resolve to their source table"
    (is (= #{(mt/id :venues)}
           (:table-ids (query-perms/query->resolved-source-ids (mt/mbql-query venues))))))
  (testing "card-sourced queries resolve to the card's underlying source table"
    (mt/with-temp [:model/Card card {:dataset_query {:database (mt/id)
                                                     :type     :query
                                                     :query    {:source-table (mt/id :venues)}}}]
      (is (= #{(mt/id :venues)}
             (:table-ids (query-perms/query->resolved-source-ids (query-with-source-card card))))))))

(deftest ^:parallel query->resolved-source-ids-nested-cards-test
  (testing "card-on-card chains resolve recursively down to the physical table"
    (mt/with-temp [:model/Card {card-a-id :id} {:dataset_query {:database (mt/id)
                                                                :type     :query
                                                                :query    {:source-table (mt/id :venues)}}}
                   :model/Card card-b {:dataset_query {:database (mt/id)
                                                       :type     :query
                                                       :query    {:source-table (str "card__" card-a-id)}}}]
      (is (= #{(mt/id :venues)}
             (:table-ids (query-perms/query->resolved-source-ids (query-with-source-card card-b))))))))

(deftest ^:parallel query->resolved-source-ids-join-test
  (testing "a card-sourced JOIN contributes the card's underlying table too"
    (mt/with-temp [:model/Card {card-id :id} (qp.test-util/card-with-source-metadata-for-query
                                              (mt/mbql-query venues
                                                {:aggregation [[:count]]
                                                 :breakout    [$id]}))]
      (let [query (mt/mbql-query checkins
                    {:joins [{:fields       :all
                              :alias        "v"
                              :source-table (str "card__" card-id)
                              :condition    [:= $venue_id [:field "ID" {:base-type :type/Integer, :join-alias "v"}]]}]})]
        (is (= #{(mt/id :checkins) (mt/id :venues)}
               (:table-ids (query-perms/query->resolved-source-ids query))))))))

(deftest ^:parallel query->resolved-source-ids-missing-card-test
  (testing "an unresolvable source-card chain THROWS (fail closed) rather than yielding no tables"
    (is (thrown? Exception
                 (query-perms/query->resolved-source-ids
                  {:database (mt/id)
                   :type     :query
                   :query    {:source-table (str "card__" Integer/MAX_VALUE)}})))))

(deftest empty-resolved-source-ids-deny-test
  (testing "empty resolved source ids deny before the data-perms check"
    (mt/with-current-user (mt/user->id :rasta)
      (let [query (mt/mbql-query venues)]
        (is (true? (query-perms/can-run-query-with-resolved-source-ids?
                    query (query-perms/query->resolved-source-ids query))))
        (log.capture/with-log-messages-for-level [messages [metabase.query-permissions.impl :debug]]
          (is (false? (query-perms/can-run-query-with-resolved-source-ids? query {})))
          (is (some #(= "Empty resolved source ids; denying" (:message %)) (messages))
              "denied as empty, not by a later check tripping over the absent ids"))))))

(deftest ^:parallel mbql5-query-test
  (testing "Should be able to calculate permissions for a MBQL 5 query (#39024)"
    (let [metadata-provider (mt/metadata-provider)
          venues            (lib.metadata/table metadata-provider (mt/id :venues))
          query             (lib/query metadata-provider venues)]
      (is (= {:perms/view-data      {(mt/id :venues) :unrestricted}
              :perms/create-queries {(mt/id :venues) :query-builder}}
             (query-perms/required-perms-for-query query))))))

(deftest ^:parallel mbql5-native-query-test
  (testing "Should be able to calculate permissions for a MBQL 5 native query (#39024)"
    (let [metadata-provider (mt/metadata-provider)
          query             (lib/query metadata-provider {:lib/type :mbql.stage/native
                                                          :native   "SELECT *;"})]
      (is (= {:perms/view-data :unrestricted
              :perms/create-queries :query-builder-and-native}
             (query-perms/required-perms-for-query query))))))

(deftest ^:parallel native-query-referenced-card-permissions-test
  (testing (str "Check permissions for native query card reference parameters"
                " (the `:query-permissions/referenced-card-ids` key(s))")
    (mt/with-temp [:model/Collection {collection-1-id :id} {}
                   :model/Collection {collection-2-id :id} {}
                   :model/Card       {card-1-id :id}       {:collection_id collection-1-id}
                   :model/Card       {card-2-id :id}       {:collection_id collection-2-id}]
      (testing "native query"
        (is (= {:perms/create-queries :query-builder-and-native
                :perms/view-data      :unrestricted
                :card-ids             #{card-1-id card-2-id}
                :source-card-ids      #{card-1-id card-2-id}}
               (query-perms/required-perms-for-query
                {:database                              (mt/id)
                 :type                                  :native
                 :native                                {:query "SELECT * FROM (SELECT * FROM whatever);"}
                 :query-permissions/referenced-card-ids #{card-1-id card-2-id}}
                :already-preprocessed? true))))
      (testing "MBQL query with native source queries"
        (let [native-query {:database (mt/id)
                            :type     :query
                            :query    {:source-query {:native "SELECT * FROM (SELECT * FROM whatever);"
                                                      :query-permissions/referenced-card-ids #{card-1-id}}
                                       :joins        [{:alias        "J"
                                                       :source-query {:native "SELECT * FROM (SELECT * FROM whatever);"
                                                                      :query-permissions/referenced-card-ids #{card-2-id}}
                                                       :condition    [:= true false]}]}}]
          (is (= {:perms/create-queries :query-builder-and-native
                  :perms/view-data      :unrestricted
                  :card-ids             #{card-1-id card-2-id}
                  :source-card-ids      #{card-1-id card-2-id}}
                 (query-perms/required-perms-for-query native-query :already-preprocessed? true)))
          (testing "MBQL 5 query"
            (is (= {:perms/create-queries :query-builder-and-native
                    :perms/view-data      :unrestricted
                    :card-ids             #{card-1-id card-2-id}
                    :source-card-ids      #{card-1-id card-2-id}}
                   (query-perms/required-perms-for-query
                    (lib/query (mt/metadata-provider)
                               (lib/->mbql5 native-query))
                    :already-preprocessed? true)))))))))

(deftest ^:parallel native-query-source-card-id-join-permissions-test
  (testing "MBQL query with native source card (#30077)"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                              :type :native
                                                              :native {:query "SELECT * FROM orders"}}}]
      (let [query {:database (mt/id)
                   :type     :query
                   :query    {:source-table (mt/id :products)
                              :joins        [{:alias "Join Alias"
                                              :condition [:= true false]
                                              :source-query
                                              {:qp/stage-is-from-source-card card-id
                                               :native "SELECT * FROM orders"}}]}}]
        ;; The source card of the joined native query is detected, and we don't require full native perms
        (is (= {:card-ids             #{card-id}
                :perms/create-queries {(mt/id :products) :query-builder}
                :perms/view-data      {(mt/id :products) :unrestricted}}
               (query-perms/required-perms-for-query query :already-preprocessed? true)))))))

(deftest can-run-query?-non-permission-errors-test
  (let [broken {:database (mt/id) :type :query :query {:source-table "card__13371337"}}]
    (testing "a query whose permissions cannot be calculated throws when the caller asks for it"
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Error calculating permissions"
                              (query-perms/can-run-query? broken false true)))))
    (testing "without the flag the calculation failure stays folded into the permission answer"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-current-user (mt/user->id :rasta)
          (is (false? (query-perms/can-run-query? broken)))))))
  (testing "a real permission denial reads as false in either mode"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-current-user (mt/user->id :rasta)
        (let [query (mt/mbql-query orders)]
          (is (false? (query-perms/can-run-query? query)))
          (is (false? (query-perms/can-run-query? query false true))))))))

(deftest check-result-metadata-data-perms-error-message-test
  (testing "the denied table's ID reads as a plain number, with no digit-grouping separator"
    ;; `tru` runs its arguments through MessageFormat, which formats a bare integer for the current locale: a
    ;; four-digit ID comes out as "1,595". IDs only reach four digits on busy instances, so the ID is passed as a
    ;; string to keep the message stable whatever its magnitude.
    (mt/with-no-data-perms-for-all-users!
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"You do not have permission to view data of table 1595 in result_metadata\."
             (query-perms/check-result-metadata-data-perms (mt/id) [{:name "NAME", :table_id 1595}])))))))

(deftest ^:parallel merge-resolved-source-ids-test
  (is (nil? (query-perms/merge-resolved-source-ids [])))
  (is (nil? (query-perms/merge-resolved-source-ids [nil])))
  (is (= {} (query-perms/merge-resolved-source-ids [{} nil])))
  (is (= {:table-ids           #{1 2 3}
          :table-query-ids     #{1 3}
          :card-ids            #{10}
          :native?             true
          :referenced-card-ids #{20 21}}
         (query-perms/merge-resolved-source-ids
          [{:table-ids #{1 2} :table-query-ids #{1} :native? false :referenced-card-ids #{20}}
           nil
           {:table-ids #{3} :table-query-ids #{3} :card-ids #{10} :native? true :referenced-card-ids #{21}}]))))

;;; ------------------------------------------ Run permissions of many queries ------------------------------------------

(defn- run-check-outcome
  "What `thunk`, a run permissions check, does: `:allowed`, or the message, data without the query, and cause message
  of what it throws."
  [thunk]
  (try
    (thunk)
    :allowed
    (catch Throwable e
      {:message  (ex-message e)
       :data     (dissoc (ex-data e) :query)
       :cause    (some-> (ex-cause e) ex-message)})))

(defn- run-check-queries
  "The queries of the run permissions matrix, by name: on the Database with `db-b-id` for `:native-b`, and on Cards
  `card-ok-id` and `card-hidden-id` for the others named so."
  [db-b-id card-ok-id card-hidden-id]
  (let [mp   (lib-be/application-database-metadata-provider (mt/id))
        mp-b (lib-be/application-database-metadata-provider db-b-id)]
    [[:mbql-t1     (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
     [:mbql-t1-t2  (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                       (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :checkins))
                                                  [(lib/= (lib.metadata/field mp (mt/id :venues :id))
                                                          (lib.metadata/field mp (mt/id :checkins :venue_id)))])))]
     [:native-a    (lib/native-query mp "SELECT 1")]
     [:native-b    (lib/native-query mp-b "SELECT 1")]
     [:card-ok     (lib/query mp (lib.metadata/card mp card-ok-id))]
     [:card-hidden (lib/query mp (lib.metadata/card mp card-hidden-id))]]))

(defn- grant-run-check-scenario!
  "Gives All Users the data permissions of `scenario` on the test Database, none on the Database with `db-b-id`."
  [scenario db-b-id]
  (let [group (perms/all-users-group)]
    (perms/set-database-permission! group db-b-id :perms/create-queries :no)
    (case scenario
      :superuser       nil
      :query-builder-a (do (perms/set-database-permission! group (mt/id) :perms/view-data :unrestricted)
                           (perms/set-database-permission! group (mt/id) :perms/create-queries :query-builder))
      :native-a        (do (perms/set-database-permission! group (mt/id) :perms/view-data :unrestricted)
                           (perms/set-database-permission! group (mt/id) :perms/create-queries :query-builder-and-native))
      :table-t1-only   (do (perms/set-database-permission! group (mt/id) :perms/view-data :unrestricted)
                           (perms/set-table-permission! group (mt/id :venues) :perms/create-queries :query-builder)))))

(def ^:private run-check-expected
  "Which queries of [[run-check-queries]] each scenario may run."
  {:superuser       #{:mbql-t1 :mbql-t1-t2 :native-a :native-b :card-ok :card-hidden}
   :query-builder-a #{:mbql-t1 :mbql-t1-t2 :card-ok}
   :native-a        #{:mbql-t1 :mbql-t1-t2 :native-a :card-ok}
   :table-t1-only   #{:mbql-t1 :card-ok}})

(deftest check-run-permissions-for-queries-matches-single-check-test
  (testing "each query of a batch is allowed or refused, with the same error, exactly as when it is checked alone"
    (mt/with-temp [:model/Database   {db-b-id :id}        {:engine :h2 :details (:details (mt/db))}
                   :model/Collection {coll-ok-id :id}     {}
                   :model/Collection {coll-hidden-id :id} {}
                   :model/Card       {card-ok-id :id}     {:collection_id coll-ok-id
                                                           :dataset_query (lib/query (mt/metadata-provider)
                                                                                     (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))}
                   :model/Card       {card-hidden-id :id} {:collection_id coll-hidden-id
                                                           :dataset_query (lib/query (mt/metadata-provider)
                                                                                     (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))}]
      (mt/with-non-admin-groups-no-root-collection-perms
        (perms/grant-collection-read-permissions! (perms/all-users-group) coll-ok-id)
        (doseq [scenario (keys run-check-expected)]
          (testing scenario
            (mt/with-no-data-perms-for-all-users!
              (grant-run-check-scenario! scenario db-b-id)
              (mt/with-test-user (if (= scenario :superuser) :crowberto :rasta)
                (let [queries (run-check-queries db-b-id card-ok-id card-hidden-id)
                      single  (into {} (map (fn [[k q]] [k (run-check-outcome #(query-perms/check-run-permissions-for-query q))]))
                                    queries)
                      allowed (into [] (comp (filter #(= :allowed (single (first %)))) (map second)) queries)]
                  (testing "the single check answers as expected"
                    (is (= (run-check-expected scenario)
                           (into #{} (comp (filter #(= :allowed (val %))) (map key)) single))))
                  (testing "a refusal says which permissions are missing"
                    (doseq [[k outcome] single
                            :when (not= :allowed outcome)]
                      (is (=? {:message "You cannot save this Question because you do not have permissions to run its query."
                               :data    {:status-code 403}}
                              outcome)
                          (str k))))
                  (doseq [[k q] queries]
                    (testing (str k " checked last in a batch after every allowed query")
                      (is (= (single k)
                             (run-check-outcome #(query-perms/check-run-permissions-for-queries (conj allowed q)))))))
                  (testing "a batch of every query throws for the first refused one"
                    (is (= (or (some #(when (not= :allowed (single (first %))) (single (first %))) queries)
                               :allowed)
                           (run-check-outcome #(query-perms/check-run-permissions-for-queries (mapv second queries)))))))))))))))

(deftest check-run-permissions-for-queries-statement-count-test
  (testing "the run permissions of many queries take as many statements as those of few, as a non-admin"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       {card-id :id} {:collection_id coll-id
                                                    :dataset_query (lib/query (mt/metadata-provider)
                                                                              (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
      (mt/with-test-user :rasta
        (let [mp      (lib-be/application-database-metadata-provider (mt/id))
              queries [(lib/query mp (lib.metadata/table mp (mt/id :venues)))
                       (lib/native-query mp "SELECT 1")
                       (lib/query mp (lib.metadata/card mp card-id))]
              count!  (fn [f n]
                        (lib-be/with-metadata-provider-cache
                          (f (into [] cat (repeat 1 queries)))
                          (t2/with-call-count [call-count]
                            (f (into [] cat (repeat n queries)))
                            (call-count))))
              check!      (partial count! query-perms/check-run-permissions-for-queries)
              preprocess! (partial count! #(request/as-admin (run! qp.preprocess/preprocess %)))]
          (testing "only preprocessing, which the query processor does per query, grows with the queries"
            (is (= (- (check! 6) (check! 2))
                   (- (preprocess! 6) (preprocess! 2))))))))))
