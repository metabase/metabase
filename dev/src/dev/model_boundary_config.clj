(ns dev.model-boundary-config
  "Compute `:model-exports` and `:model-imports` for every module.

  Usage at the REPL:

    (dev.model-boundary-config/compute-model-boundaries)
    ;; => {:model-exports {module => #{:model/X ...}}
    ;;     :model-imports {module => #{:model/X ...}}}

  To update config.edn with computed model boundaries:

    (dev.model-boundary-config/update-config!)"
  (:require
   [clojure.string :as str]
   [dev.deps-graph :as deps-graph]
   [rewrite-clj.node :as n]
   [rewrite-clj.parser :as r.parser]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

(defn compute-model-boundaries
  "Compute the required `:model-exports` and `:model-imports` for every module.

  Returns `{:model-exports {module => sorted-set-of-models}
            :model-imports {module => sorted-set-of-models}}`

  `:model-exports` for module M = models owned by M that are referenced by at least one non-bypass module.
  `:model-imports` for module M = models owned by other modules that M references.

  Modules with `:model-imports :bypass` are excluded: they don't need computed imports, and their
  references don't drive exports (models used only by bypass modules need not be exported)."
  []
  (let [config      (deps-graph/kondo-config)
        ownership   (deps-graph/model-ownership)
        module-refs (deps-graph/model-references-by-module)
        all-modules (set (keys config))
        bypass-modules (into #{}
                             (keep (fn [[mod mod-config]]
                                     (when (= (:model-imports mod-config) :bypass)
                                       mod)))
                             config)
        ;; {:model/X => #{modules that reference it}} — inverted index for fast export lookups
        ;; Only non-bypass modules drive exports.
        model->referencing-modules
        (reduce-kv (fn [acc mod models]
                     (if (contains? bypass-modules mod)
                       acc
                       (reduce (fn [acc model]
                                 (update acc model (fnil conj #{}) mod))
                               acc
                               models)))
                   {}
                   module-refs)]
    {:model-exports
     (into (sorted-map)
           (for [mod all-modules
                 :let [owned (into #{} (comp (filter (fn [[_ owner]] (= owner mod))) (map key)) ownership)]
                 :when (seq owned)]
             [mod (into (sorted-set)
                        (for [model owned
                              :let [refs (get model->referencing-modules model)]
                              :when (some #(not= % mod) refs)]
                          model))]))
     :model-imports
     (into (sorted-map)
           (for [mod all-modules
                 :when (not (contains? bypass-modules mod))
                 :let [imported (into (sorted-set)
                                      (for [model (get module-refs mod)
                                            :let [defining-mod (get ownership model)]
                                            :when (and defining-mod (not= defining-mod mod))]
                                        model))]
                 :when (seq imported)]
             [mod imported]))}))

(def ^:private config-path ".clj-kondo/config/modules/config.edn")

(defn- find-key-in-map
  "Find a keyword key `k` within a map zipper `map-zloc`."
  [map-zloc k]
  (loop [zz (z/down map-zloc)]
    (when zz
      (if (and (n/keyword-node? (z/node zz))
               (= (z/sexpr zz) k))
        zz
        (recur (z/right zz))))))

(defn- model-set-str
  "Build a string representation of a sorted set of model keywords.
  Short sets (<=3 items) stay on one line; longer sets get one item per line."
  [models]
  (let [sorted (sort models)]
    (if (<= (count sorted) 3)
      (str "#{" (str/join " " sorted) "}")
      (str "#{" (first sorted)
           (apply str (map #(str "\n                    " %) (rest sorted)))
           "}"))))

(defn update-config!
  "Compute model boundaries and update config.edn with `:model-exports` and `:model-imports` for all modules.

  Only updates keys that already exist in the config — does not add new keys.
  Uses rewrite-clj to manipulate the AST directly, preserving formatting."
  []
  (let [boundaries    (compute-model-boundaries)
        root-zloc     (z/of-node (r.parser/parse-file-all config-path))
        modules-zloc  (-> root-zloc
                          (z/find-value z/next :metabase/modules)
                          z/right)
        module-syms   (loop [z (z/down modules-zloc), acc []]
                        (if-not z
                          acc
                          (recur (some-> z z/right z/right)
                                 (conj acc (z/sexpr z)))))
        updated-root
        (reduce
         (fn [root module-sym]
           (reduce
            (fn [root config-key]
              (let [;; Re-navigate from root to find this module's config map
                    mods-zloc (-> (z/of-node root)
                                  (z/find-value z/next :metabase/modules)
                                  z/right)
                    mod-cfg   (loop [z (z/down mods-zloc)]
                                (when z
                                  (if (= (z/sexpr z) module-sym)
                                    (z/right z)
                                    (recur (some-> z z/right z/right)))))
                    existing  (when mod-cfg (find-key-in-map mod-cfg config-key))]
                ;; Only update keys that already exist and are sets (skip :bypass, :any, etc.)
                (if (and existing (set? (z/sexpr (z/right existing))))
                  (let [computed (get-in boundaries [config-key module-sym] #{})]
                    (if (seq computed)
                      ;; Replace with the computed set
                      (let [new-node (r.parser/parse-string (model-set-str computed))]
                        (z/root (z/replace (z/right existing) new-node)))
                      ;; Empty set — remove the key-value pair entirely
                      (-> existing z/right z/remove z/remove z/root)))
                  root)))
            root
            [:model-exports :model-imports]))
         (z/root root-zloc)
         module-syms)]
    (spit config-path (n/string updated-root))
    (println "Updated" config-path "with :model-exports and :model-imports.")))
