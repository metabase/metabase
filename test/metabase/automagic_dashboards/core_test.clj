(ns metabase.automagic-dashboards.core-test
  (:require [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :refer :all :as magic]
             [rules :as rules]]
            [metabase.models
             [field :as field]
             [table :refer [Table] :as table]
             [user :as user]]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]))

(defmacro with-rasta
  "Execute body with rasta as the current user."
  [& body]
  `(binding [api/*current-user-id*              (test-users/user->id :rasta)
             api/*current-user-permissions-set* (-> :rasta
                                                    test-users/user->id
                                                    user/permissions-set
                                                    atom)]
    ~@body))

(expect
  [[:field-id 1]
   [:fk-> 1 2]
   42]
  (map (partial #'magic/->reference :mbql)
       [(-> (field/->FieldInstance) (assoc :id 1))
        (-> (field/->FieldInstance) (assoc :id 1 :fk_target_field_id 2))
        42]))

(expect
  [[:entity/UserTable :entity/GenericTable :entity/*]]
  (map (comp (partial map :table_type)
             (partial #'magic/matching-rules (rules/load-rules)))
       [(table/map->TableInstance {:entity_type :entity/UserTable})]))

(expect
  true
  (with-rasta
    (tu/with-model-cleanup ['Card 'Dashboard 'Collection 'DashboardCard]
      (-> (keep automagic-dashboard (Table)) count pos?))))

(expect
  [:d1 :d2 :d3 :d2 :d3]
  (map (comp key first #'magic/most-specific-definition)
       [; Identity
        [{:d1 {:field_type [:type/Category] :score 100}}]
        ; Base case: more ancestors
        [{:d1 {:field_type [:type/Category] :score 100}}
         {:d2 {:field_type [:type/State] :score 100}}]
        ; Break ties based on the number of additional filters
        [{:d1 {:field_type [:type/Category] :score 100}}
         {:d2 {:field_type [:type/State] :score 100}}
         {:d3 {:field_type [:type/State]
               :named      "foo"
               :score      100}}]
        ; Break ties on score
        [{:d1 {:field_type [:type/Category] :score 100}}
         {:d2 {:field_type [:type/State] :score 100}}
         {:d3 {:field_type [:type/State] :score 90}}]
        ; Number of additional filters has precedence over score
        [{:d1 {:field_type [:type/Category] :score 100}}
         {:d2 {:field_type [:type/State] :score 100}}
         {:d3 {:field_type [:type/State]
               :named      "foo"
               :score      0}}]]))
