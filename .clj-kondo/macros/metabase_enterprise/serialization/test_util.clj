(ns macros.metabase-enterprise.serialization.test-util)

(defmacro with-world [& body]
  `(let [~'db-id                        nil
         ~'table-id                     nil
         ~'table                        nil
         ~'table-id-categories          nil
         ~'table-id-users               nil
         ~'table-id-checkins            nil
         ~'venues-pk-field-id           nil
         ~'numeric-field-id             nil
         ~'name-field-id                nil
         ~'latitude-field-id            nil
         ~'longitude-field-id           nil
         ~'category-field-id            nil
         ~'category-pk-field-id         nil
         ~'date-field-id                nil
         ~'users-pk-field-id            nil
         ~'user-id-field-id             nil
         ~'checkins->venues-field-id    nil
         ~'last-login-field-id          nil
         ~'collection-id                nil
         ~'collection-id-nested         nil
         ~'user-id-temp                 nil
         ~'personal-collection-id       nil
         ~'pc-felicia-nested-id         nil
         ~'pc-nested-id                 nil
         ~'pc-deeply-nested-id          nil
         ~'metric-id                    nil
         ~'segment-id                   nil
         ~'dashboard-id                 nil
         ~'root-dashboard-id            nil
         ~'card-id                      nil
         ~'card-arch-id                 nil
         ~'card-id-root                 nil
         ~'card-id-nested               nil
         ~'card-id-nested-query         nil
         ~'card-id-native-query         nil
         ~'card-id-pivot-table          nil
         ~'dashcard-id                  nil
         ~'dashcard-top-level-click-id  nil
         ~'dashcard-with-click-actions  nil
         ~'dashcard-with-textbox-id     nil
         ~'card-id-root-to-collection   nil
         ~'card-id-collection-to-root   nil
         ~'pulse-id                     nil
         ~'pulsecard-root-id            nil
         ~'pulsecard-collection-id      nil
         ~'card-id-template-tags        nil
         ~'card-id-filter-agg           nil
         ~'card-id-temporal-unit        nil
         ~'snippet-id                   nil
         ~'snippet-collection-id        nil
         ~'snippet-nested-collection-id nil
         ~'nested-snippet-id            nil
         ~'card-id-with-native-snippet  nil
         ~'card-join-card-id            nil]
     ~'db-id
     ~'table-id
     ~'table
     ~'table-id-categories
     ~'table-id-users
     ~'table-id-checkins
     ~'venues-pk-field-id
     ~'numeric-field-id
     ~'name-field-id
     ~'latitude-field-id
     ~'longitude-field-id
     ~'category-field-id
     ~'category-pk-field-id
     ~'date-field-id
     ~'users-pk-field-id
     ~'user-id-field-id
     ~'checkins->venues-field-id
     ~'last-login-field-id
     ~'collection-id
     ~'collection-id-nested
     ~'user-id-temp
     ~'personal-collection-id
     ~'pc-felicia-nested-id
     ~'pc-nested-id
     ~'pc-deeply-nested-id
     ~'metric-id
     ~'segment-id
     ~'dashboard-id
     ~'root-dashboard-id
     ~'card-id
     ~'card-arch-id
     ~'card-id-root
     ~'card-id-nested
     ~'card-id-nested-query
     ~'card-id-native-query
     ~'card-id-pivot-table
     ~'dashcard-id
     ~'dashcard-top-level-click-id
     ~'dashcard-with-click-actions
     ~'dashcard-with-textbox-id
     ~'card-id-root-to-collection
     ~'card-id-collection-to-root
     ~'pulse-id
     ~'pulsecard-root-id
     ~'pulsecard-collection-id
     ~'card-id-template-tags
     ~'card-id-filter-agg
     ~'card-id-temporal-unit
     ~'snippet-id
     ~'snippet-collection-id
     ~'snippet-nested-collection-id
     ~'nested-snippet-id
     ~'card-id-with-native-snippet
     ~'card-join-card-id
     ~@body))
