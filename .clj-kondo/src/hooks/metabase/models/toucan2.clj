(ns hooks.metabase.models.toucan2
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common :as common]))

(defn- error!
  [form message]
  (hooks/reg-finding! (assoc (meta form)
                             :message message
                             :type :metabase/toucan2-validate-model)))

(defn check-arg-is-keyword
  [{{[_ & args] :children} :node :as node} arg-nth]
  (let [modelable-arg (nth args arg-nth)
        model         (if (hooks/vector-node? modelable-arg)
                        (first (:children modelable-arg))
                        modelable-arg)]
    (when-not (hooks/keyword-node? model)
      (error! node (format "Expected a keyword like :model/Card instead of 'Card or Card. Got %s" (hooks/sexpr model)))))
  node)

(defn toucan-call-first
  [node]
  (check-arg-is-keyword node 0))

(defn toucan-call-second
  [node]
  (check-arg-is-keyword node 1))

(defn toucan-call-third
  [node]
  (check-arg-is-keyword node 2))

(comment
  (defn- toucan-call-first* [form]
    (hooks/sexpr
     (:node
      (toucan-call-first
       {:node
        (hooks/parse-string
         (with-out-str
           #_{:clj-kondo/ignore [:unresolved-namespace]}
           (clojure.pprint/pprint
            form)))}))))

  (toucan-call-first*
   '(t2/delete! 'Card))
  (toucan-call-first*
   '(t2/select ['Card :a])))
