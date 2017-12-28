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
            [metabase.test.data
             [users :as test-users]]))

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
  [:type/GenericTable
   :type/UserTable]
  (map (comp :table_type (partial #'magic/best-matching-rule (rules/load-rules)))
       [{}
        {:entity_type :type/UserTable}]))

(expect
  true
  (with-rasta
    (-> (keep automagic-dashboard (Table)) count pos?)))
