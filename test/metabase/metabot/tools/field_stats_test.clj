(ns metabase.metabot.tools.field-stats-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.field-stats :as metabot.tools.field-stats]
   [metabase.metabot.tools.util :as metabot.tools.u]
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

(defn- table-query
  [metadata-provider table-id]
  (lib/query metadata-provider (lib.metadata/table metadata-provider table-id)))

(defn- query-field-id [query field-id-prefix field-display-name columns-fn]
  (->> (keep-indexed (fn [i col]
                       (when (= (lib/display-name query col) field-display-name)
                         i))
                     (columns-fn query))
       first
       (str field-id-prefix)))

(defn- visible-field-id [query field-id-prefix field-display-name]
  (query-field-id query field-id-prefix field-display-name lib/visible-columns))

(defn- filterable-field-id [query field-id-prefix field-display-name]
  (query-field-id query field-id-prefix field-display-name lib/filterable-columns))

(deftest field-values-table-test
  (ensure-fresh-field-values! (mt/id :people :state))
  (ensure-fresh-field-values! (mt/id :products :category))
  (let [mp             (mt/metadata-provider)
        people-id      (mt/id :people)
        people-query   (table-query mp people-id)
        birth-date-id  (visible-field-id people-query (metabot.tools.u/table-field-id-prefix people-id) "Birth Date")
        state-id       (visible-field-id people-query (metabot.tools.u/table-field-id-prefix people-id) "State")
        products-id    (mt/id :products)
        products-query (table-query mp products-id)
        category-id    (visible-field-id products-query (metabot.tools.u/table-field-id-prefix products-id) "Category")]
    (testing "No read permission results in an error."
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                            (metabot.tools.field-stats/field-values
                             {:entity-type "table", :entity-id people-id, :field-id state-id, :limit 5}))))
    (testing "Getting statistics and values for table fields works."
      (mt/as-admin
        (are [table-id field-id value-metadata]
             (= {:structured-output {:result-type    :field-metadata
                                     :field_id       field-id
                                     :value_metadata value-metadata}}
                (metabot.tools.field-stats/field-values
                 {:entity-type "table", :entity-id table-id, :field-id field-id, :limit 5}))
          people-id   birth-date-id {:statistics
                                     {:distinct-count 2308
                                      :percent-null   0.0
                                      :earliest       "1958-04-26"
                                      :latest         "2000-04-03"}}
          people-id   state-id      {:statistics   {:distinct-count 49
                                                    :percent-null   0.0
                                                    :percent-json   0.0
                                                    :percent-url    0.0
                                                    :percent-email  0.0
                                                    :percent-state  1.0
                                                    :average-length 2.0}
                                     :field_values ["AK" "AL" "AR" "AZ" "CA"]}
          products-id category-id   {:statistics   {:distinct-count 4
                                                    :percent-null   0.0
                                                    :percent-json   0.0
                                                    :percent-url    0.0
                                                    :percent-email  0.0
                                                    :percent-state  0.0
                                                    :average-length 6.375}
                                     :field_values ["Doohickey" "Gadget" "Gizmo" "Widget"]})))))

(deftest field-values-model-test
  (ensure-fresh-field-values! (mt/id :orders :quantity))
  (ensure-fresh-field-values! (mt/id :people :state))
  (ensure-fresh-field-values! (mt/id :products :category))
  (mt/with-temp [:model/Card {model-id :id} {:dataset_query (mt/mbql-query orders)
                                             :type :model}]
    (let [mp (mt/metadata-provider)
          model-query (lib/query mp (lib.metadata/card mp model-id))
          card-field-id-prefix (metabot.tools.u/card-field-id-prefix model-id)
          ;; All fields use c<card-id> syntax with indices from model's visible-columns
          quantity-id (visible-field-id model-query card-field-id-prefix "Quantity")
          state-id (visible-field-id model-query card-field-id-prefix "State")
          category-id (visible-field-id model-query card-field-id-prefix "Category")]
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
    (let [mp (mt/metadata-provider)
          metric-query (lib/query mp (lib.metadata/metric mp metric-id))
          card-field-id-prefix (metabot.tools.u/card-field-id-prefix metric-id)
          ;; All fields use c<card-id> syntax with indices from metric's filterable-columns
          quantity-id (filterable-field-id metric-query card-field-id-prefix "Quantity")
          birth-date-id (filterable-field-id metric-query card-field-id-prefix "Birth Date")]
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

(defn- agent-field-id-by-id
  "v60 field-values takes index-based agent field ids ('t<table>-<idx>' / 'c<card>-<idx>'), not raw
  field ids like master. Find the index of the column whose underlying field id is `real-field-id`."
  ([query field-id-prefix real-field-id]
   (agent-field-id-by-id query field-id-prefix real-field-id lib/visible-columns))
  ([query field-id-prefix real-field-id columns-fn]
   (->> (keep-indexed (fn [i col]
                        (when (= (:id col) real-field-id)
                          i))
                      (columns-fn query))
        first
        (str field-id-prefix))))

(deftest field-values-blocked-implicitly-joinable-field-test
  (testing "a field reached through an FK cannot be drilled into when its own table is Blocked, even when
            the user manages that table's metadata"
    (ensure-fresh-field-values! (mt/id :people :state))
    (let [mp           (mt/metadata-provider)
          orders-query (table-query mp (mt/id :orders))
          prefix       (metabot.tools.u/table-field-id-prefix (mt/id :orders))
          state-fid    (agent-field-id-by-id orders-query prefix (mt/id :people :state))
          quantity-fid (agent-field-id-by-id orders-query prefix (mt/id :orders :quantity))]
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
                                    :field-id state-fid :limit 5}))))
          (testing "ORDERS' own columns are unaffected"
            (is (=? {:structured-output {:field_id quantity-fid}}
                    (metabot.tools.field-stats/field-values
                     {:entity-type "table" :entity-id (mt/id :orders)
                      :field-id quantity-fid :limit 5})))))))))

(deftest field-values-blocked-own-table-field-test
  (testing "the table the caller named takes the same data-access bar as any other. Its entry check is
            `api/read-check`, which a `manage-table-metadata` grant satisfies with `view-data` still
            Blocked, so exempting it would hand that user the column's fingerprint and cached values"
    (ensure-fresh-field-values! (mt/id :people :state))
    (let [mp           (mt/metadata-provider)
          people-query (table-query mp (mt/id :people))
          orders-query (table-query mp (mt/id :orders))
          state-fid    (agent-field-id-by-id people-query
                                             (metabot.tools.u/table-field-id-prefix (mt/id :people))
                                             (mt/id :people :state))
          quantity-fid (agent-field-id-by-id orders-query
                                             (metabot.tools.u/table-field-id-prefix (mt/id :orders))
                                             (mt/id :orders :quantity))]
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
                                    :field-id state-fid :limit 5}))))
          (testing "a table the caller can query is unaffected"
            (is (=? {:structured-output {:field_id quantity-fid}}
                    (metabot.tools.field-stats/field-values
                     {:entity-type "table" :entity-id (mt/id :orders)
                      :field-id quantity-fid :limit 5})))))))))

(deftest field-values-readable-implicitly-joinable-field-test
  (testing "control: an FK-reachable field on a readable table is still drillable"
    (ensure-fresh-field-values! (mt/id :people :state))
    (let [mp           (mt/metadata-provider)
          orders-query (table-query mp (mt/id :orders))
          state-fid    (agent-field-id-by-id orders-query
                                             (metabot.tools.u/table-field-id-prefix (mt/id :orders))
                                             (mt/id :people :state))]
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
        (mt/with-current-user (mt/user->id :rasta)
          (is (=? {:structured-output {:field_id       state-fid
                                       :value_metadata {:field_values ["AK" "AL" "AR" "AZ" "CA"]}}}
                  (metabot.tools.field-stats/field-values
                   {:entity-type "table" :entity-id (mt/id :orders)
                    :field-id state-fid :limit 5}))))))))

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

(defn- card-agent-field-id
  [card-id real-field-id]
  (let [mp (mt/metadata-provider)]
    (agent-field-id-by-id (lib/query mp (lib.metadata/card mp card-id))
                          (metabot.tools.u/card-field-id-prefix card-id)
                          real-field-id)))

(deftest field-values-blocked-explicitly-joined-field-test
  (testing "a field explicitly joined into a saved question cannot be drilled into when its own table is Blocked"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-temp [:model/Card {card-id :id} {:type          :question
                                              :dataset_query (orders-joined-to-people-query)}]
      (let [state-fid    (card-agent-field-id card-id (mt/id :people :state))
            quantity-fid (card-agent-field-id card-id (mt/id :orders :quantity))]
        (do-with-people-blocked!
         (fn []
           (testing "PEOPLE.STATE is not readable via the question that joins PEOPLE"
             (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                   (metabot.tools.field-stats/field-values
                                    {:entity-type "question" :entity-id card-id
                                     :field-id state-fid :limit 5}))))
           (testing "the question's own columns still resolve, so the card read-check did pass"
             (is (=? {:structured-output {:field_id quantity-fid}}
                     (metabot.tools.field-stats/field-values
                      {:entity-type "question" :entity-id card-id
                       :field-id quantity-fid :limit 5}))))))))))

(deftest field-values-readable-explicitly-joined-field-test
  (testing "control: an explicitly joined field on a readable table is still drillable"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-temp [:model/Card {card-id :id} {:type          :question
                                              :dataset_query (orders-joined-to-people-query)}]
      (let [state-fid (card-agent-field-id card-id (mt/id :people :state))]
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
          (mt/with-current-user (mt/user->id :rasta)
            (is (=? {:structured-output {:field_id       state-fid
                                         :value_metadata {:field_values ["AK" "AL" "AR" "AZ" "CA"]}}}
                    (metabot.tools.field-stats/field-values
                     {:entity-type "question" :entity-id card-id
                      :field-id state-fid :limit 5})))))))))

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
      (let [state-fid (card-agent-field-id card-id (mt/id :people :state))]
        (do-with-people-blocked!
         (fn []
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                 (metabot.tools.field-stats/field-values
                                  {:entity-type "question" :entity-id card-id
                                   :field-id state-fid :limit 5})))))))))

(deftest field-values-blocked-model-join-field-test
  (testing "a blocked table joined by a model is not drillable through the model"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                               :dataset_query (orders-joined-to-people-query)}]
      (let [state-fid    (card-agent-field-id model-id (mt/id :people :state))
            quantity-fid (card-agent-field-id model-id (mt/id :orders :quantity))]
        (do-with-people-blocked!
         (fn []
           (testing "the model discloses neither values nor statistics for the blocked column"
             (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                   (metabot.tools.field-stats/field-values
                                    {:entity-type "model" :entity-id model-id
                                     :field-id state-fid :limit 5}))))
           (testing "the model's own columns still resolve, so the card read-check did pass"
             (is (=? {:structured-output {:field_id quantity-fid}}
                     (metabot.tools.field-stats/field-values
                      {:entity-type "model" :entity-id model-id
                       :field-id quantity-fid :limit 5}))))))))))

(deftest field-values-blocked-source-card-field-test
  (testing "a blocked table is not drillable through a question built on a card that joins it"
    (ensure-fresh-field-values! (mt/id :people :state))
    (mt/with-temp [:model/Card {inner-id :id} {:type          :question
                                               :dataset_query (orders-joined-to-people-query)}
                   :model/Card {outer-id :id} {:type          :question
                                               :dataset_query (mt/mbql-query nil
                                                                {:source-table (str "card__" inner-id)})}]
      (let [state-fid (card-agent-field-id outer-id (mt/id :people :state))]
        (do-with-people-blocked!
         (fn []
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                 (metabot.tools.field-stats/field-values
                                  {:entity-type "question" :entity-id outer-id
                                   :field-id state-fid :limit 5})))))))))

(deftest field-values-card-as-permissions-boundary-test
  (testing "a model stays drillable for a user who may see its table's data but not query it directly,
            since running the model is all the query processor asks of them"
    (ensure-fresh-field-values! (mt/id :orders :quantity))
    (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                               :dataset_query (mt/mbql-query orders)}]
      (let [quantity-fid (card-agent-field-id model-id (mt/id :orders :quantity))]
        (mt/with-no-data-perms-for-all-users!
          (perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/create-queries :no)
          (mt/with-current-user (mt/user->id :rasta)
            (testing "the user genuinely cannot read the table directly"
              (is (false? (mi/can-read? (t2/select-one :model/Table :id (mt/id :orders))))))
            (testing "but the model still resolves its columns"
              (is (=? {:structured-output {:field_id quantity-fid}}
                      (metabot.tools.field-stats/field-values
                       {:entity-type "model" :entity-id model-id
                        :field-id quantity-fid :limit 5}))))))))))
