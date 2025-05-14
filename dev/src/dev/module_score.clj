(ns dev.module-score
  (:require
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [dev.deps-graph]
   [flatland.ordered.map :as ordered-map]
   [metabase.util :as u]))

(defn module-namespaces [deps module]
  (keep #(when (= (:module %) module)
           (:namespace %))
        deps))

(defn direct-deps [deps module]
  (into (sorted-set)
        (comp (filter #(= (:module %) module))
              (mapcat :deps)
              (map :module)
              (remove #(= % module)))
        deps))

(defn direct-deps-from-config [config module]
  (let [uses (get-in config [module :uses])]
    (when-not (= uses :any)
      (into (sorted-set) uses))))

(defn indirect-deps [deps module]
  (loop [seen (sorted-set), [dep & more] (direct-deps deps module)]
    (if-not dep
      seen
      (let [dep-deps (direct-deps deps dep)
            new      (set/difference dep-deps seen #{module})]
        (recur (conj seen dep) (set/union (set more) new))))))

(defn module-vars [deps module]
  (let [namespaces (module-namespaces deps module)]
    (into (sorted-set)
          (comp (mapcat (fn [ns-symb]
                          (require ns-symb)
                          (vals (ns-interns ns-symb))))
                ;; deref/deduplicate the Potemkin imports
                (map (fn [varr]
                       (symbol (format "%s/%s" (ns-name (:ns (meta varr))) (:name (meta varr)))))))
          namespaces)))

(defn canonical-api-namespaces [module]
  (let [prefix (format (if (= (namespace module) "enterprise")
                         "metabase-enterprise.%s"
                         "metabase.%s")
                       (name module))]
    (into (sorted-set)
          (map (fn [suffix]
                 (symbol (format "%s.%s" prefix suffix))))
          ['api 'core 'init])))

(defn namespaces [deps module]
  (into (sorted-set)
        (comp (filter #(= (:module %) module))
              (map :namespace))
        deps))

(defn api-namespaces [deps module]
  (into (sorted-set)
        (comp (remove #(= (:module %) module))
              (mapcat :deps)
              (filter #(= (:module %) module))
              (map :namespace))
        deps))

(defn api-namespaces-from-config [config module]
  (let [api-namespaces (get-in config [module :api])]
    (when-not (= api-namespaces :any)
      (into (sorted-set) api-namespaces))))

(defn unexpected-api-namespaces [deps module]
  (let [api-namespaces (api-namespaces deps module)]
    (when-not (= api-namespaces :any)
      (set/difference api-namespaces (canonical-api-namespaces module)))))

(defn exported-vars [deps module]
  (into (sorted-set)
        (comp (mapcat (fn [ns-symb]
                        (require ns-symb)
                        (vals (ns-publics ns-symb))))
              (map symbol))
        (api-namespaces deps module)))

(defn direct-circular-deps [deps module]
  (into (sorted-set)
        (filter (fn [dep]
                  (contains? (direct-deps deps dep) module)))
        (direct-deps deps module)))

(defn info [deps config module]
  (let [direct-deps    (direct-deps deps module)
        api-namespaces (api-namespaces deps module)]
    (ordered-map/ordered-map
     :direct-deps               direct-deps
     :undeclared-deps           (set/difference direct-deps (direct-deps-from-config config module))
     :indirect-deps             (indirect-deps deps module)
     :namespaces                (namespaces deps module)
     :api-namespaces            api-namespaces
     :unexpected-api-namespaces (unexpected-api-namespaces deps module)
     :undeclared-api-namespaces (set/difference api-namespaces (api-namespaces-from-config config module))
     :exported-vars             (exported-vars deps module)
     :internal-vars             (module-vars deps module)
     :circular-deps             (direct-circular-deps deps module))))

(defn stats [deps config module]
  (let [info              (info deps config module)
        num-internal-vars (count (:internal-vars info))]
    (ordered-map/ordered-map
     :num-direct-deps               (count (:direct-deps info))
     :num-undeclared-deps           (count (:undeclared-deps info))
     :num-indirect-deps             (count (:indirect-deps info))
     :num-namespaces                (count (:namespaces info))
     :num-api-namespaces            (count (:api-namespaces info))
     :num-unexpected-api-namespaces (count (:unexpected-api-namespaces info))
     :num-undeclared-api-namespaces (count (:undeclared-api-namespaces info))
     :num-exported-vars             (count (:exported-vars info))
     :num-internal-vars             num-internal-vars
     :percent-exported-vars         (if (zero? num-internal-vars)
                                      0
                                      (double (/ (count (:exported-vars info))
                                                 num-internal-vars)))
     :percent-api-namespaces        (double (/ (count (:api-namespaces info))
                                               (count (:namespaces info))))
     :percent-unexpected-namespaces (double (/ (count (:unexpected-api-namespaces info))
                                               (count (:namespaces info))))
     :percent-circular-deps         (if (zero? (count (:direct-deps info)))
                                      0
                                      (double (/ (count (:circular-deps info))
                                                 (count (:direct-deps info))))))))

(def exported-vars-weight  25.0)
(def api-namespaces-weight 25.0)
(def direct-deps-weight    15.0)
(def indirect-deps-weight  15.0)
(def circular-deps-weight  10.0)
(def config-weight         10.0)

(defn score [deps config module]
  (let [stats       (stats deps config module)
        num-modules (count (keys config))
        subscores   (ordered-map/ordered-map
                     :module               module
                     ;; exported vars score (25 points) percentage of vars that are exported e.g. if 100 vars and 10 are
                     ;; exported then 90% are exported and we get 22.5 points
                     :exported-vars-score  (* (- 1.0 (:percent-exported-vars stats))
                                              exported-vars-weight)
                     :api-namespaces-score (* (- 1.0 (:percent-unexpected-namespaces stats))
                                              api-namespaces-weight)
                     ;; should go up logarithmically with 0 = 25 points and Ndeps = 0 points
                     :direct-deps-score    (max 0.0
                                                (- direct-deps-weight
                                                   (:num-direct-deps stats)))
                     :indirect-deps-score  (* indirect-deps-weight
                                              (- 1 (/ (:num-indirect-deps stats) num-modules)))
                     :circular-deps-score  (* circular-deps-weight
                                              (- 1 (:percent-circular-deps stats)))
                     :config-score         (max 0.0
                                                (- config-weight
                                                   (:num-undeclared-deps stats)
                                                   (:num-undeclared-api-namespaces stats))))]
    (assoc subscores :total (reduce + 0 (filter number? (vals subscores))))))

(defn scores [deps config]
  (into []
        (map (fn [module]
               (try
                 (merge (stats deps config module)
                        (score deps config module))
                 (catch Throwable e
                   (throw (ex-info (format "Error calculating score for module '%s'" module)
                                   {:module module}
                                   e))))))
        (sort (keys config))))

(defn csv [deps config]
  (let [ks   [:module
              :num-direct-deps
              :num-undeclared-deps
              :num-indirect-deps
              :num-namespaces
              :num-api-namespaces
              :num-unexpected-api-namespaces
              :num-undeclared-api-namespaces
              :num-exported-vars
              :num-internal-vars
              :exported-vars-score
              :api-namespaces-score
              :direct-deps-score
              :indirect-deps-score
              :circular-deps-score
              :config-score :total]
        rows (cons (map name ks)
                   (->> (scores deps config)
                        (sort-by #(- (:total %)))
                        (map (apply juxt ks))
                        (map (fn [row]
                               (map (fn [v]
                                      (cond->> v
                                        (number? v) (u/round-to-decimals 2)))
                                    row)))))]
    (csv/write-csv *out* rows)))

(defn deps []
  (dev.deps-graph/dependencies))

(defn config []
  (dev.deps-graph/kondo-config))

(comment
  (info (deps) (config) 'search)
  (stats (deps) (config) 'search)
  (score (deps) (config) 'search)
  (scores (deps) (config))
  (csv (deps) (config)))
