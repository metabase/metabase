(ns hooks.metabase.util.log.capture-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.test :refer :all]
   [hooks.metabase.util.log.capture]))

(deftest ^:parallel with-log-messages-for-level-test
  (is (= '(clojure.core/let [messages-1 (clojure.core/fn [])
                             messages-2 (clojure.core/fn [])]
            (concat (messages-1)
                    (messages-2)))
         (-> (hooks.metabase.util.log.capture/with-log-messages-for-level
               {:node (-> '(with-log-messages-for-level [messages-1 [my.namespace :debug]
                                                         messages-2 :info]
                             (concat (messages-1) (messages-2)))
                          pr-str
                          api/parse-string)})
             :node
             api/sexpr))))
