(ns hooks.metabase.premium-features.defenterprise
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common]))

(def enterprise-ns-key
  "Var metadata naming the enterprise namespace an OSS `defenterprise` dispatches to. The ratchet tooling reads it
  from kondo's analysis to count the enterprise var's ignores under the OSS one."
  :metabase/enterprise-ns)

(defn- with-enterprise-ns
  "`fn-name` with [[enterprise-ns-key]] metadata naming `enterprise-namespace`, a token node."
  [fn-name enterprise-namespace]
  ;; A string, not the symbol: kondo would try to resolve a symbol in metadata.
  (update fn-name :meta (fnil conj [])
          (hooks/map-node [(hooks/keyword-node enterprise-ns-key)
                           (hooks/string-node (str (hooks/sexpr enterprise-namespace)))])))

(defn defenterprise [{node :node}]
  (let [[_defenterprise fn-name & args] (:children node)
        [docstring & args]              (if (hooks/string-node? (first args))
                                          args
                                          (cons nil args))
        [enterprise-namespace & args]    (if (hooks/token-node? (first args))
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
                                 (cond-> fn-name
                                   enterprise-namespace (with-enterprise-ns enterprise-namespace))
                                 docstring))
                   fn-tail))
                 (with-meta (meta node)))))}))

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
