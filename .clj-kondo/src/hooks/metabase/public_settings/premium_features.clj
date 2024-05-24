(ns hooks.metabase.public-settings.premium-features
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn defenterprise [{node :node}]
  (let [[_defenterprise fn-name & args] (:children node)
        [docstring & args]              (if (hooks/string-node? (first args))
                                          args
                                          (cons nil args))
        [_enterprise-namespace & args]   (if (hooks/token-node? (first args))
                                           args
                                           (cons nil args))
        [options fn-tail]               (loop [options (hooks/map-node []), [x y & more :as args] args]
                                          (if (hooks/keyword-node? x)
                                            (recur (update options :children concat [x y]) more)
                                            [options args]))]
    {:node (hooks/list-node
            (list
             (hooks/token-node 'let)
             (hooks/vector-node
              [(hooks/token-node '_options) options])
             (-> (hooks/list-node
                  (concat
                   (filter some?
                           (list (hooks/token-node 'defn)
                                 fn-name
                                 docstring))
                   fn-tail))
                 (with-meta (update (meta node) :clj-kondo/ignore #(hooks/vector-node (cons :clojure-lsp/unused-public-var (:children %))))))))}))

(comment
  (defn- defenterprise* [form]
    (hooks/sexpr
     (:node
      (defenterprise
        {:node
         (hooks/parse-string
          (with-out-str
            (clojure.pprint/pprint
             form)))}))))

  (defn- x []
    (defenterprise*
      '(defenterprise score-result
         "Scoring implementation that adds score for items in official collections."
         :feature :any
         :fallback score-result-fallback
         [result]
         (conj (scoring/weights-and-scores result)
               {:weight 2
                :score  (official-collection-score result)
                :name   "official collection score"}
               {:weight 2
                :score  (verified-score result)
                :name   "verified"}))))

  (defn- y []
    (defenterprise*
      '(defenterprise score-result
         "Score a result, returning a collection of maps with score and weight."
         metabase-enterprise.search.scoring
         [result]
         (weights-and-scores result)))))
