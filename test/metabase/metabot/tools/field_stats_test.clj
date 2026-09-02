(ns metabase.metabot.tools.field-stats-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.metabot.tools.field-stats-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.tools.field-stats :as metabot.tools.field-stats]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(defn- ensure-fresh-field-values!
  [field-id]
  (t2/delete! :model/FieldValues :field_id field-id :type :full)
  (is (= :full (-> (t2/select-one :model/Field :id field-id)
                   field-values/get-or-create-full-field-values!
                   :type)))
  (is (= 1 (t2/count :model/FieldValues :field_id field-id :type :full))))

(deftest field-values-table-test
  (ensure-fresh-field-values! (mt/id :people :state))
  (ensure-fresh-field-values! (mt/id :products :category))
  (let [birth-date-id (mt/id :people :birth_date)
        state-id      (mt/id :people :state)
        people-id     (mt/id :people)
        products-id   (mt/id :products)
        category-id   (mt/id :products :category)]
    (testing "No read permission results in an error."
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                            (metabot.tools.field-stats/field-values
                             {:entity-type "table", :entity-id people-id, :field-id state-id, :limit 5}))))
    (testing "A table field detail surfaces its portable FK so the LLM can reference it directly."
      (mt/as-admin
        (is (=? {:structured-output {:portable_fk ["test-data (h2)" "PUBLIC" "PRODUCTS" "CATEGORY"]}}
                (metabot.tools.field-stats/field-values
                 {:entity-type "table", :entity-id products-id, :field-id category-id, :limit 5})))))
    (testing "A field-id not on the table is an agent error, not a field-metadata result."
      (mt/as-admin
        (is (=? {:output #"Field -1 not found"}
                (metabot.tools.field-stats/field-values
                 {:entity-type "table", :entity-id products-id, :field-id -1, :limit 5})))))
    (testing "A field-id that no longer resolves to a table (e.g. dropped column, stale result_metadata)
              is a graceful agent-facing 404, not an uncaught exception."
      (mt/as-admin
        (mt/with-dynamic-fn-redefs [metabot.perms/field-id->table-id (constantly {})]
          (is (=? {:output #"No field found with ID \d+" :status-code 404}
                  (metabot.tools.field-stats/field-values
                   {:entity-type "table", :entity-id products-id, :field-id category-id, :limit 5}))))))
    (testing "Getting statistics and values for table fields works."
      (mt/as-admin
        (are [table-id field-id value-metadata]
             (=? {:structured-output {:result-type    :field-metadata
                                      :field_id       field-id
                                      :value_metadata value-metadata}}
                 (metabot.tools.field-stats/field-values
                  {:entity-type "table", :entity-id table-id, :field-id field-id, :limit 5}))
          people-id   birth-date-id {:statistics
                                     {:distinct-count 2308
                                      :percent-null   0.0
                                      :earliest       "1958-04-26"
                                      :latest         "2000-04-03"
                                      :mode-fraction  0.0012
                                      :top-3-fraction 0.0032}}
          people-id   state-id      {:statistics   {:distinct-count 49
                                                    :percent-null   0.0
                                                    :percent-json   0.0
                                                    :percent-url    0.0
                                                    :percent-email  0.0
                                                    :percent-state  1.0
                                                    :average-length 2.0
                                                    :mode-fraction  0.0776
                                                    :top-3-fraction 0.1624
                                                    :percent-blank  0.0}
                                     :field_values ["AK" "AL" "AR" "AZ" "CA"]}
          products-id category-id   {:statistics   {:distinct-count 4
                                                    :percent-null   0.0
                                                    :percent-json   0.0
                                                    :percent-url    0.0
                                                    :percent-email  0.0
                                                    :percent-state  0.0
                                                    :average-length 6.375
                                                    :mode-fraction  0.27
                                                    :top-3-fraction 0.79
                                                    :percent-blank  0.0}
                                     :field_values ["Doohickey" "Gadget" "Gizmo" "Widget"]})))))

(deftest field-values-model-test
  (ensure-fresh-field-values! (mt/id :orders :quantity))
  (ensure-fresh-field-values! (mt/id :people :state))
  (ensure-fresh-field-values! (mt/id :products :category))
  (mt/with-temp [:model/Card {model-id :id} {:dataset_query (mt/mbql-query orders)
                                             :type :model}]
    (let [quantity-id (mt/id :orders :quantity)
          state-id    (mt/id :people :state)
          category-id (mt/id :products :category)]
      (testing "No read permission results in an error."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (metabot.tools.field-stats/field-values
                               {:entity-type "model", :entity-id model-id, :field-id state-id, :limit 5}))))
      (testing "Getting statistics and values for model fields works."
        (mt/as-admin
          (are [field-id value-metadata]
               (=? {:structured-output {:field_id field-id
                                        :value_metadata value-metadata}}
                   (metabot.tools.field-stats/field-values
                    {:entity-type "model", :entity-id model-id, :field-id field-id, :limit 5}))
            quantity-id {:statistics {:distinct-count 62
                                      :percent-null   0.0}
                         :field_values [0 1 2 3 4]}
            state-id    {:statistics {:distinct-count 49
                                      :percent-null   0.0
                                      :percent-json   0.0
                                      :percent-url    0.0
                                      :percent-email  0.0
                                      :percent-state  1.0
                                      :average-length 2.0}
                         :field_values ["AK" "AL" "AR" "AZ" "CA"]}
            category-id {:statistics {:distinct-count 4
                                      :percent-null   0.0
                                      :percent-json   0.0
                                      :percent-url    0.0
                                      :percent-email  0.0
                                      :percent-state  0.0
                                      :average-length 6.375}
                         :field_values ["Doohickey" "Gadget" "Gizmo" "Widget"]}))))))

(deftest field-values-metric-test
  (ensure-fresh-field-values! (mt/id :orders :quantity))
  (mt/with-temp [:model/Card {metric-id :id} {:dataset_query (mt/mbql-query orders
                                                               {:aggregation [[:count]]
                                                                :breakout    [$quantity
                                                                              !year.user_id->people.birth_date]})
                                              :type :metric}]
    (let [quantity-id   (mt/id :orders :quantity)
          birth-date-id (mt/id :people :birth_date)]
      (testing "No read permission results in an error."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (metabot.tools.field-stats/field-values
                               {:entity-type "metric", :entity-id metric-id, :field-id birth-date-id, :limit 5}))))
      (testing "Getting statistics and values for metric fields works."
        (mt/as-admin
          (are [field-id value-metadata]
               (=? {:structured-output {:field_id field-id
                                        :value_metadata value-metadata}}
                   (metabot.tools.field-stats/field-values
                    {:entity-type "metric", :entity-id metric-id, :field-id field-id, :limit 5}))
            quantity-id   {:statistics {:distinct-count 62
                                        :percent-null   0.0}
                           :field_values [0 1 2 3 4]}
            birth-date-id {:statistics
                           {:distinct-count 2308
                            :percent-null   0.0
                            :earliest       "1958-04-26"
                            :latest         "2000-04-03"}}))))))

(deftest field-values-blocked-implicitly-joinable-field-test
  (testing "a field reached through an FK cannot be drilled into when its own table is Blocked, even when
            the user manages that table's metadata"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
      (perms/set-table-permission! (perms-group/all-users) (mt/id :people) :perms/view-data :blocked)
      (perms/set-table-permission! (perms-group/all-users) (mt/id :people) :perms/manage-table-metadata :yes)
      (mt/with-current-user (mt/user->id :rasta)
        (testing "PEOPLE.STATE is not readable via the ORDERS table it is joinable from"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                (metabot.tools.field-stats/field-values
                                 {:entity-type "table" :entity-id (mt/id :orders)
                                  :field-id (mt/id :people :state) :limit 5}))))
        (testing "ORDERS' own columns are unaffected"
          (is (=? {:structured-output {:field_id (mt/id :orders :quantity)}}
                  (metabot.tools.field-stats/field-values
                   {:entity-type "table" :entity-id (mt/id :orders)
                    :field-id (mt/id :orders :quantity) :limit 5}))))))))

(deftest field-values-blocked-own-table-field-test
  (testing "the table the caller named takes the same data-access bar as any other. Its entry check is
            `api/read-check`, which a `manage-table-metadata` grant satisfies with `view-data` still
            Blocked, so exempting it would hand that user the column's fingerprint and cached values"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
      (perms/set-table-permission! (perms-group/all-users) (mt/id :people) :perms/view-data :blocked)
      (perms/set-table-permission! (perms-group/all-users) (mt/id :people) :perms/manage-table-metadata :yes)
      (mt/with-current-user (mt/user->id :rasta)
        (testing "the metadata grant admits the caller to the table but not to its column statistics"
          (is (true? (mi/can-read? (t2/select-one :model/Table :id (mt/id :people)))))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                (metabot.tools.field-stats/field-values
                                 {:entity-type "table" :entity-id (mt/id :people)
                                  :field-id (mt/id :people :state) :limit 5}))))
        (testing "a table the caller can query is unaffected"
          (is (=? {:structured-output {:field_id (mt/id :orders :quantity)}}
                  (metabot.tools.field-stats/field-values
                   {:entity-type "table" :entity-id (mt/id :orders)
                    :field-id (mt/id :orders :quantity) :limit 5}))))))))

(deftest field-values-readable-implicitly-joinable-field-test
  (testing "control: an FK-reachable field on a readable table is still drillable"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
      (mt/with-current-user (mt/user->id :rasta)
        (is (=? {:structured-output {:field_id       (mt/id :people :state)
                                     :value_metadata {:field_values ["AK" "AL" "AR" "AZ" "CA"]}}}
                (metabot.tools.field-stats/field-values
                 {:entity-type "table" :entity-id (mt/id :orders)
                  :field-id (mt/id :people :state) :limit 5})))))))

(defn- orders-joined-to-people-query
  "An ORDERS query that explicitly joins PEOPLE and returns its columns."
  []
  (mt/mbql-query orders
    {:joins [{:fields       :all
              :source-table $$people
              :condition    [:= $user_id &People.people.id]
              :alias        "People"}]}))

(defn- do-with-people-blocked!
  "Run `thunk` as rasta with every table readable except PEOPLE, which is Blocked."
  [thunk]
  (mt/with-no-data-perms-for-all-users!
    (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
    (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
    (perms/set-table-permission! (perms-group/all-users) (mt/id :people) :perms/view-data :blocked)
    (mt/with-current-user (mt/user->id :rasta)
      (thunk))))

(deftest field-values-blocked-explicitly-joined-field-test
  (testing "a field explicitly joined into a saved question cannot be drilled into when its own table is Blocked"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-temp [:model/Card {card-id :id} {:type          :question
                                              :dataset_query (orders-joined-to-people-query)}]
      (do-with-people-blocked!
       (fn []
         (testing "PEOPLE.STATE is not readable via the question that joins PEOPLE"
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                 (metabot.tools.field-stats/field-values
                                  {:entity-type "question" :entity-id card-id
                                   :field-id (mt/id :people :state) :limit 5}))))
         (testing "the question's own columns still resolve, so the card read-check did pass"
           (is (=? {:structured-output {:field_id (mt/id :orders :quantity)}}
                   (metabot.tools.field-stats/field-values
                    {:entity-type "question" :entity-id card-id
                     :field-id (mt/id :orders :quantity) :limit 5})))))))))

(deftest field-values-readable-explicitly-joined-field-test
  (testing "control: an explicitly joined field on a readable table is still drillable"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-temp [:model/Card {card-id :id} {:type          :question
                                              :dataset_query (orders-joined-to-people-query)}]
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
        (mt/with-current-user (mt/user->id :rasta)
          (is (=? {:structured-output {:field_id       (mt/id :people :state)
                                       :value_metadata {:field_values ["AK" "AL" "AR" "AZ" "CA"]}}}
                  (metabot.tools.field-stats/field-values
                   {:entity-type "question" :entity-id card-id
                    :field-id (mt/id :people :state) :limit 5}))))))))

(deftest field-values-blocked-nested-stage-field-test
  (testing "a blocked table joined in an earlier stage is not drillable from the final stage"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-temp [:model/Card {card-id :id}
                   {:type          :question
                    :dataset_query (mt/mbql-query orders
                                     {:source-query {:source-table $$orders
                                                     :joins        [{:fields       :all
                                                                     :source-table $$people
                                                                     :condition    [:= $user_id &People.people.id]
                                                                     :alias        "People"}]}})}]
      (do-with-people-blocked!
       (fn []
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                               (metabot.tools.field-stats/field-values
                                {:entity-type "question" :entity-id card-id
                                 :field-id (mt/id :people :state) :limit 5}))))))))

(deftest field-values-blocked-model-join-field-test
  (testing "a blocked table joined by a model is not drillable through the model"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                               :dataset_query (orders-joined-to-people-query)}]
      (do-with-people-blocked!
       (fn []
         (testing "the model discloses neither values nor statistics for the blocked column"
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                 (metabot.tools.field-stats/field-values
                                  {:entity-type "model" :entity-id model-id
                                   :field-id (mt/id :people :state) :limit 5}))))
         (testing "the model's own columns still resolve, so the card read-check did pass"
           (is (=? {:structured-output {:field_id (mt/id :orders :quantity)}}
                   (metabot.tools.field-stats/field-values
                    {:entity-type "model" :entity-id model-id
                     :field-id (mt/id :orders :quantity) :limit 5})))))))))

(deftest field-values-blocked-source-card-field-test
  (testing "a blocked table is not drillable through a question built on a card that joins it"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-temp [:model/Card {inner-id :id} {:type          :question
                                               :dataset_query (orders-joined-to-people-query)}
                   :model/Card {outer-id :id} {:type          :question
                                               :dataset_query (mt/mbql-query nil
                                                                {:source-table (str "card__" inner-id)})}]
      (do-with-people-blocked!
       (fn []
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                               (metabot.tools.field-stats/field-values
                                {:entity-type "question" :entity-id outer-id
                                 :field-id (mt/id :people :state) :limit 5}))))))))

(deftest field-values-card-as-permissions-boundary-test
  (testing "a model stays drillable for a user who may see its table's data but not query it directly,
            since running the model is all the query processor asks of them"
    (ensure-fresh-field-values! (mt/id :orders :quantity))
    (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                               :dataset_query (mt/mbql-query orders)}]
      (mt/with-no-data-perms-for-all-users!
        (perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/create-queries :no)
        (mt/with-current-user (mt/user->id :rasta)
          (testing "the user genuinely cannot read the table directly"
            (is (false? (mi/can-read? (t2/select-one :model/Table :id (mt/id :orders))))))
          (testing "but the model still resolves its columns"
            (is (=? {:structured-output {:field_id (mt/id :orders :quantity)}}
                    (metabot.tools.field-stats/field-values
                     {:entity-type "model" :entity-id model-id
                      :field-id (mt/id :orders :quantity) :limit 5})))))))))
(deftest field-values-unknown-entity-type-test
  (testing "an unrecognized entity-type -- e.g. because the schema that constrains it isn't enforced in
            production -- returns a graceful agent-facing message instead of throwing"
    (mt/as-admin
      (is (=? {:output #"Unknown data source type: bogus"}
              (metabot.tools.field-stats/field-values
               {:entity-type "bogus", :entity-id 1, :field-id 1, :limit 5}))))))
