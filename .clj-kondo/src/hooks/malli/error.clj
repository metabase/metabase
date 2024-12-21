(ns hooks.malli.error
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common]))

(defn humanize [x]
  (letfn [(check-node [node]
            (when (hooks/list-node? node)
              (let [[_ child] (:children node)]
                (when (hooks/list-node? child)
                  (let [[symb] (:children child)]
                    (when-let [qualified-symb (hooks.common/node->qualified-symbol symb)]
                      (when ('#{malli.core/validate metabase.util.malli.registry/validate}
                             qualified-symb)
                        (hooks/reg-finding! (assoc (meta symb)
                                                   :message "Use malli.error/humanize with explain, NOT with validate. [:metabase/check-me-humanize]"
                                                   :type :metabase/check-me-humanize)))))))))]
    (check-node (:node x))
    x))

(comment
  (humanize {:node (hooks/parse-string
                    (pr-str '(malli.error/humanize
                              (malli.core/validate
                               metabase.sync.sync-metadata.dbms-version/DBMSVersion
                               metabase.driver.druid.sync-test/dbms-version))))}))
