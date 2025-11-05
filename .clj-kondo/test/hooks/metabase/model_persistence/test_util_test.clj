(ns hooks.metabase.model-persistence.test-util-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.test :refer :all]
   [hooks.metabase.model-persistence.test-util]))

(deftest ^:parallel with-persistence-enabled-test
  (is (= '(clojure.core/let [persist-models! (clojure.core/fn [])]
            (persist-models!)
            :wow)
         (as-> '(mt/with-persistence-enabled! [persist-models!]
                  (persist-models!)
                  :wow) <>
           (pr-str <>)
           (hooks/parse-string <>)
           {:node <>}
           (hooks.metabase.model-persistence.test-util/with-persistence-enabled! <>)
           (:node <>)
           (hooks/sexpr <>)))))
