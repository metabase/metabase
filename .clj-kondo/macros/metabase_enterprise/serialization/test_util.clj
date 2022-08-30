(ns macros.metabase-enterprise.serialization.test-util)

(defmacro with-world [& body]
  (letfn [(ignore-unused [symb]
            (vary-meta symb assoc :clj-kondo/ignore [:unused-binding]))]
    `(let [~(ignore-unused 'db-id)                        nil
           ~(ignore-unused 'table-id)                     nil
           ~(ignore-unused 'table)                        nil
           ~(ignore-unused 'table-id-categories)          nil
           ~(ignore-unused 'table-id-users)               nil
           ~(ignore-unused 'table-id-checkins)            nil
           ~(ignore-unused 'venues-pk-field-id)           nil
           ~(ignore-unused 'numeric-field-id)             nil
           ~(ignore-unused 'name-field-id)                nil
           ~(ignore-unused 'latitude-field-id)            nil
           ~(ignore-unused 'longitude-field-id)           nil
           ~(ignore-unused 'category-field-id)            nil
           ~(ignore-unused 'category-pk-field-id)         nil
           ~(ignore-unused 'date-field-id)                nil
           ~(ignore-unused 'users-pk-field-id)            nil
           ~(ignore-unused 'user-id-field-id)             nil
           ~(ignore-unused 'checkins->venues-field-id)    nil
           ~(ignore-unused 'last-login-field-id)          nil
           ~(ignore-unused 'collection-id)                nil
           ~(ignore-unused 'collection-id-nested)         nil
           ~(ignore-unused 'user-id-temp)                 nil
           ~(ignore-unused 'personal-collection-id)       nil
           ~(ignore-unused 'pc-felicia-nested-id)         nil
           ~(ignore-unused 'pc-nested-id)                 nil
           ~(ignore-unused 'pc-deeply-nested-id)          nil
           ~(ignore-unused 'metric-id)                    nil
           ~(ignore-unused 'segment-id)                   nil
           ~(ignore-unused 'dashboard-id)                 nil
           ~(ignore-unused 'root-dashboard-id)            nil
           ~(ignore-unused 'card-id)                      nil
           ~(ignore-unused 'card-arch-id)                 nil
           ~(ignore-unused 'card-id-root)                 nil
           ~(ignore-unused 'card-id-nested)               nil
           ~(ignore-unused 'card-id-nested-query)         nil
           ~(ignore-unused 'card-id-native-query)         nil
           ~(ignore-unused 'dashcard-id)                  nil
           ~(ignore-unused 'dashcard-top-level-click-id)  nil
           ~(ignore-unused 'dashcard-with-click-actions)  nil
           ~(ignore-unused 'dashcard-with-textbox-id)     nil
           ~(ignore-unused 'card-id-root-to-collection)   nil
           ~(ignore-unused 'card-id-collection-to-root)   nil
           ~(ignore-unused 'pulse-id)                     nil
           ~(ignore-unused 'pulsecard-root-id)            nil
           ~(ignore-unused 'pulsecard-collection-id)      nil
           ~(ignore-unused 'card-id-template-tags)        nil
           ~(ignore-unused 'card-id-filter-agg)           nil
           ~(ignore-unused 'card-id-temporal-unit)        nil
           ~(ignore-unused 'snippet-id)                   nil
           ~(ignore-unused 'snippet-collection-id)        nil
           ~(ignore-unused 'snippet-nested-collection-id) nil
           ~(ignore-unused 'nested-snippet-id)            nil
           ~(ignore-unused 'card-id-with-native-snippet)  nil
           ~(ignore-unused 'card-join-card-id)            nil]
       ~@body)))
