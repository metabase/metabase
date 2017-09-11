(ns metabase.test.mock.util
  (:require [metabase.query-processor :as qp]))

(def table-defaults
  {:description             nil
   :entity_type             nil
   :caveats                 nil
   :points_of_interest      nil
   :show_in_getting_started false
   :schema                  nil
   :raw_table_id            false
   :fields                  []
   :rows                    nil
   :updated_at              true
   :entity_name             nil
   :active                  true
   :id                      true
   :db_id                   true
   :visibility_type         nil
   :created_at              true})

(def field-defaults
  {:description        nil
   :table_id           true
   :caveats            nil
   :points_of_interest nil
   :fk_target_field_id false
   :updated_at         true
   :active             true
   :parent_id          false
   :special_type       nil
   :id                 true
   :raw_column_id      false
   :last_analyzed      true
   :position           0
   :visibility_type    :normal
   :preview_display    true
   :created_at         true})



;; This is just a fake implementation that just swoops in and returns somewhat-correct looking results for different
;; queries we know will get ran as part of sync
(defn- is-table-row-count-query? [expanded-query]
  (= :count (get-in expanded-query [:query :aggregation 0 :aggregation-type])))

(defn- is-table-sample-query? [expanded-query]
  (seq (get-in expanded-query [:query :fields])))

(defn process-query-in-context
  "QP mock that will return some 'appropriate' fake answers to the questions we know are ran during the sync process
   -- the ones that determine Table row count and rows samples (for fingerprinting). Currently does not do anything
   for any other queries, including ones for determining FieldValues."
  [_ _]
  (fn [query]
    (let [expanded-query (qp/expand query)]
      {:data
       {:rows
        (cond
          (is-table-row-count-query? expanded-query) [[1000]]
          (is-table-sample-query? expanded-query)    (let [fields-count (count (get-in query [:query :fields]))]
                                                       (for [i (range 500)]
                                                         (repeat fields-count i)))
          :else                                      nil)}})))
