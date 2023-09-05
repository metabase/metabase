(ns metabase.lib.drill-thru.underlying-records-test)

;; (let [metadata-provider (metabase.lib.metadata.jvm/application-database-metadata-provider 1)
;;         orders            2
;;         orders-id         11
;;         created-at        14
;;         subtotal          17
;;         people            5
;;         state             39
;;         query             (as-> (metabase.lib.metadata/table metadata-provider people) <>
;;                             (lib/query metadata-provider <>)
;;                             (lib/aggregate <> (lib/count))
;;                             (lib/breakout  <> (metabase.lib.options/ensure-uuid [:field {} state]))
;;                               )
;;         [state-col count-col] (metabase.lib.metadata.calculation/returned-columns query -1 query)
;;         ]
;;     #_(#'metabase.lib.drill-thru/underlying-records-drill
;;       query -1
;;       {:column     count-col
;;        :value      87
;;        :row        [{:column-name "STATE" :value "Wisconsin"}
;;                     {:column-name "count" :value 87}]
;;        :dimensions [{:column-name "STATE" :value "WI"}]})
;;     (#'metabase.lib.drill-thru/next-breakouts query -1 [{:column-name "STATE" :value "WI"}])

;;     #_(->> (lib/available-drill-thrus query -1 {:column (metabase.lib.metadata/field metadata-provider subtotal)
;;                                               :value nil
;;                                               #_#_:value  "2018-05-15T08:04:04.58Z"})
;;            (map #(metabase.lib.metadata.calculation/display-info query -1 %))))
;; (lib.order-by/order-bys query stage-number)
