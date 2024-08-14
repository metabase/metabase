(ns macros.metabase-enterprise.serialization.test-util
  (:require [macros.common]))

(defmacro with-world [& body]
  `(let [~(macros.common/ignore-unused 'db-id)                        nil
         ~(macros.common/ignore-unused 'table-id)                     nil
         ~(macros.common/ignore-unused 'table)                        nil
         ~(macros.common/ignore-unused 'table-id-categories)          nil
         ~(macros.common/ignore-unused 'table-id-users)               nil
         ~(macros.common/ignore-unused 'table-id-checkins)            nil
         ~(macros.common/ignore-unused 'venues-pk-field-id)           nil
         ~(macros.common/ignore-unused 'numeric-field-id)             nil
         ~(macros.common/ignore-unused 'name-field-id)                nil
         ~(macros.common/ignore-unused 'latitude-field-id)            nil
         ~(macros.common/ignore-unused 'longitude-field-id)           nil
         ~(macros.common/ignore-unused 'category-field-id)            nil
         ~(macros.common/ignore-unused 'category-pk-field-id)         nil
         ~(macros.common/ignore-unused 'date-field-id)                nil
         ~(macros.common/ignore-unused 'users-pk-field-id)            nil
         ~(macros.common/ignore-unused 'user-id-field-id)             nil
         ~(macros.common/ignore-unused 'checkins->venues-field-id)    nil
         ~(macros.common/ignore-unused 'last-login-field-id)          nil
         ~(macros.common/ignore-unused 'collection-id)                nil
         ~(macros.common/ignore-unused 'collection-id-nested)         nil
         ~(macros.common/ignore-unused 'user-id-temp)                 nil
         ~(macros.common/ignore-unused 'personal-collection-id)       nil
         ~(macros.common/ignore-unused 'pc-felicia-nested-id)         nil
         ~(macros.common/ignore-unused 'pc-nested-id)                 nil
         ~(macros.common/ignore-unused 'pc-deeply-nested-id)          nil
         ~(macros.common/ignore-unused 'metric-id)                    nil
         ~(macros.common/ignore-unused 'segment-id)                   nil
         ~(macros.common/ignore-unused 'dashboard-id)                 nil
         ~(macros.common/ignore-unused 'root-dashboard-id)            nil
         ~(macros.common/ignore-unused 'card-id)                      nil
         ~(macros.common/ignore-unused 'card-arch-id)                 nil
         ~(macros.common/ignore-unused 'card-id-root)                 nil
         ~(macros.common/ignore-unused 'card-id-nested)               nil
         ~(macros.common/ignore-unused 'card-id-nested-query)         nil
         ~(macros.common/ignore-unused 'card-id-native-query)         nil
         ~(macros.common/ignore-unused 'card-id-pivot-table)          nil
         ~(macros.common/ignore-unused 'dashcard-id)                  nil
         ~(macros.common/ignore-unused 'dashcard-top-level-click-id)  nil
         ~(macros.common/ignore-unused 'dashcard-with-click-actions)  nil
         ~(macros.common/ignore-unused 'dashcard-with-textbox-id)     nil
         ~(macros.common/ignore-unused 'card-id-root-to-collection)   nil
         ~(macros.common/ignore-unused 'card-id-collection-to-root)   nil
         ~(macros.common/ignore-unused 'pulse-id)                     nil
         ~(macros.common/ignore-unused 'pulsecard-root-id)            nil
         ~(macros.common/ignore-unused 'pulsecard-collection-id)      nil
         ~(macros.common/ignore-unused 'card-id-template-tags)        nil
         ~(macros.common/ignore-unused 'card-id-filter-agg)           nil
         ~(macros.common/ignore-unused 'card-id-temporal-unit)        nil
         ~(macros.common/ignore-unused 'snippet-id)                   nil
         ~(macros.common/ignore-unused 'snippet-collection-id)        nil
         ~(macros.common/ignore-unused 'snippet-nested-collection-id) nil
         ~(macros.common/ignore-unused 'nested-snippet-id)            nil
         ~(macros.common/ignore-unused 'card-id-with-native-snippet)  nil
         ~(macros.common/ignore-unused 'card-join-card-id)            nil]
     ~@body))
