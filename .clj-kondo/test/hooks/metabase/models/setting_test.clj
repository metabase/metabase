(ns hooks.metabase.models.setting-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.test :refer :all]
   [hooks.metabase.settings.models.setting]))

#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(deftest ^:parallel defsetting-test
  (let [node (-> '(defsetting active-users-count
                    (deferred-tru "Cached number of active users. Refreshed every 5 minutes.")
                    :visibility :admin
                    :type       :integer
                    :default    0
                    :getter     (fn []
                                  (if-not ((requiring-resolve 'metabase.app-db.core/db-is-set-up?))
                                    0
                                    (cached-active-users-count))))
                 pr-str
                 hooks/parse-string)]
    (is (= '(let [_ (deferred-tru "Cached number of active users. Refreshed every 5 minutes.")
                  _ {:default 0
                     :type :integer
                     :getter (fn []
                               (if-not ((requiring-resolve 'metabase.app-db.core/db-is-set-up?))
                                 0
                                 (cached-active-users-count)))
                     :visibility :admin}]
              :active-users-count
              (defn active-users-count "Docstring." [])
              (defn active-users-count! "Docstring." [_value-or-nil]))
           (-> {:node node}
               hooks.metabase.settings.models.setting/defsetting
               :node
               hooks/sexpr)))))
