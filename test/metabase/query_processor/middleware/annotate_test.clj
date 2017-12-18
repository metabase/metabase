(ns metabase.query-processor.middleware.annotate-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor
             [annotate :as annotate]
             [interface :as qpi]]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

;; make sure when using a source query the right metadata comes back so we are able to do drill-through properly
(expect
  [{:field-id   [:field-literal "id" :type/Integer]
    :field-name "id"
    :source     :fields}
   {:field-id   [:field-literal "reciever_id" :type/Integer]
    :field-name "reciever_id"
    :source     :fields}
   {:field-id   [:field-literal "sender_id" :type/Integer]
    :field-name "sender_id"
    :source     :fields}
   {:field-id   [:field-literal "text" :type/Text]
    :field-name "text"
    :source     :fields}]
  (map
   (u/rpartial select-keys [:field-id :field-name :source])
   (annotate/collect-fields
     {:source-query {:source-table       {:schema "public", :name "messages", :id 1}
                     :fields-is-implicit true
                     :fields             [(qpi/map->Field
                                           {:field-id           1
                                            :field-name         "id"
                                            :field-display-name "ID"
                                            :base-type          :type/Integer
                                            :special-type       :type/PK
                                            :table-id           1})
                                          (qpi/map->Field
                                           {:field-id           2
                                            :field-name         "reciever_id"
                                            :field-display-name "Rec I Ever ID"
                                            :base-type          :type/Integer
                                            :special-type       :type/FK
                                            :table-id           1})
                                          (qpi/map->Field
                                           {:field-id           3
                                            :field-name         "sender_id"
                                            :field-display-name "Sender ID"
                                            :base-type          :type/Integer
                                            :special-type       :type/FK
                                            :table-id           1})
                                          (qpi/map->Field
                                           {:field-id           3
                                            :field-name         "text"
                                            :field-display-name "Text"
                                            :base-type          :type/Text
                                            :special-type       :type/Category
                                            :table-id           1})]}})))

;; make sure when doing a breakout of a nested query the right metadata comes back (fields are "collected" properly) so things like bar charts work as expected
(expect
  [{:field-id [:field-literal "text"        :type/Text],    :field-name "text",        :source :breakout}
   {:field-id [:field-literal "id"          :type/Integer], :field-name "id",          :source :fields}
   {:field-id [:field-literal "reciever_id" :type/Integer], :field-name "reciever_id", :source :fields}
   {:field-id [:field-literal "sender_id"   :type/Integer], :field-name "sender_id",   :source :fields}
   {:field-id [:field-literal "text"        :type/Text],    :field-name "text",        :source :fields}
   {:field-id [:field-literal "text"        :type/Text],    :field-name "text",        :source :order-by}
   {:field-id [:field-literal "text"        :type/Text],    :field-name "text",        :source :order-by}]
  (map
   (u/rpartial select-keys [:field-id :field-name :source])
   (annotate/collect-fields
     {:aggregation  [{:aggregation-type :count, :custom-name nil}]
      :breakout     [(qpi/map->FieldLiteral {:field-name "text", :base-type :type/Text, :datetime-unit nil})]
      :source-query {:source-table       {:schema "public", :name "messages", :id 1}
                     :fields-is-implicit true
                     :fields             [(qpi/map->Field
                                           {:field-id     1
                                            :field-name   "id"
                                            :base-type    :type/Integer
                                            :special-type :type/PK
                                            :table-id     1})
                                          (qpi/map->Field
                                           {:field-id     2
                                            :field-name   "reciever_id"
                                            :base-type    :type/Integer
                                            :special-type :type/FK
                                            :table-id     1})
                                          (qpi/map->Field
                                           {:field-id     3
                                            :field-name   "sender_id"
                                            :base-type    :type/Integer
                                            :special-type :type/FK
                                            :table-id     1})
                                          (qpi/map->Field
                                           {:field-id     4
                                            :field-name   "text"
                                            :base-type    :type/Text
                                            :special-type :type/Category
                                            :table-id     1})]
                     :order-by           [{:field     (qpi/map->Field
                                                       {:field-id     4
                                                        :field-name   "text"
                                                        :base-type    :type/Text
                                                        :special-type :type/Category
                                                        :table-id     1})
                                           :direction :ascending}]}
      :order-by     [{:field     (qpi/map->FieldLiteral {:field-name "text", :base-type :type/Text, :datetime-unit nil})
                      :direction :ascending}]})))
