(ns hooks.metabase.api.setting-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.test :refer :all]
   [hooks.metabase.api.setting]))

(deftest ^:parallel defsetting-test
  (let [node (-> '(defsetting active-users-count
                    (deferred-tru "Cached number of active users. Refresh every 5 minutes.")
                    :visibility :admin
                    :type       :integer
                    :default    0
                    :getter     (fn []
                                  (if-not ((requiring-resolve 'metabase.db/db-is-set-up?))
                                    0
                                    (cached-active-users-count))))
                 pr-str
                 hooks/parse-string)]
    (is (= :wow
           (-> {:node node}
               hooks.metabase.api.setting/defsetting
               :node
               hooks/sexpr)))))
