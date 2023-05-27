(ns metabase.test.mock.util)

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
   :database_is_auto_increment false
   :updated_at         true
   :active             true
   :nfc_path           nil
   :parent_id          false
   :semantic_type      nil
   :id                 true
   :last_analyzed      true
   :position           0
   :visibility_type    :normal
   :preview_display    true
   :created_at         true
   :json_unfolding     false})

(def pulse-channel-defaults
  {:schedule_frame nil
   :schedule_hour  nil
   :schedule_day   nil
   :entity_id      true
   :enabled        true})

(defn mock-execute-reducible-query [query respond]
  (respond
   {}
   (let [fields-count (count (get-in query [:query :fields]))]
     (for [i (range 500)]
       (repeat fields-count i)))))
