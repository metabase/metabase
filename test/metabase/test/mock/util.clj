(ns metabase.test.mock.util
  (:require [metabase.query-processor :as qp]))

(def table-defaults
  {:description             nil
   :entity_type             nil
   :caveats                 nil
   :points_of_interest      nil
   :show_in_getting_started false
   :schema                  nil
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
   :last_analyzed      true
   :position           0
   :visibility_type    :normal
   :preview_display    true
   :created_at         true})

(def pulse-channel-defaults
  {:schedule_frame nil
   :schedule_hour  nil
   :schedule_day   nil
   :enabled        true})

(def venue-fingerprints
  "Fingerprints for the full venues table"
  {:name        {:global {:distinct-count 100},
                 :type   {:type/Text {:percent-json  0.0, :percent-url    0.0,
                                      :percent-email 0.0, :average-length 15.63}}}
   :id          nil
   :price       {:global {:distinct-count 4},
                 :type   {:type/Number {:min 1.0, :max 4.0, :avg 2.03}}}
   :latitude    {:global {:distinct-count 94},
                 :type   {:type/Number {:min 10.06, :max 40.78, :avg 35.51}}}
   :category_id {:global {:distinct-count 28}}
   :longitude   {:global {:distinct-count 84},
                 :type   {:type/Number {:min -165.37, :max -73.95, :avg -116.0}}}})

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
