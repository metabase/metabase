(ns hooks.metabase.python-runner.api
  "Kondo hooks for metabase.python-runner.api macros."
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn with-temp-files
  "Hook for the `with-temp-files` macro. Transforms:
   
   (with-temp-files [code-file [\"python_code_\" \".py\"]
                     output-file [\"python_output_\" \".txt\"]]
     (do-something-with code-file output-file))
   
   =>
   
   (let [code-file nil
         output-file nil]
     (do-something-with code-file output-file))"
  [{{[_ file-specs & body] :children} :node}]
  (let [;; Extract the file bindings from the file-specs vector
        file-bindings (when (hooks/vector-node? file-specs)
                        (loop [children (:children file-specs)
                               bindings []]
                          (cond
                            (empty? children)
                            bindings

                            ;; Look for pairs: symbol [prefix suffix]
                            (>= (count children) 2)
                            (let [[sym spec & rest-children] children]
                              (if (and (hooks/token-node? sym)
                                       (hooks/vector-node? spec))
                                (recur rest-children (conj bindings sym (hooks/token-node 'nil)))
                                (recur (rest children) bindings)))

                            :else
                            bindings)))
        node* (hooks/list-node
               (list*
                (hooks/token-node 'let)
                (hooks/vector-node (or file-bindings []))
                body))]
    {:node node*}))