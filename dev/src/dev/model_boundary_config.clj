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
   [rewrite-clj.node :as r.node]
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

(def ^:private set-indent
  "Indentation for multi-line model sets — aligns with existing config.edn style."
  (apply str (repeat 20 \space)))

(defn- model-set-str
  "Build a string representation of a sorted set of model keywords.
  Short sets (<=3 items) stay on one line; longer sets get one item per line."
  [models]
  (let [sorted (sort models)]
    (if (<= (count sorted) 3)
      (str "#{" (str/join " " sorted) "}")
      (str "#{" (str/join (str "\n" set-indent) sorted) "}"))))

(defn- find-module-config
  "Navigate from `root` to the config map for `module-sym`. Returns a zipper or nil."
  [root module-sym]
  (let [mods-zloc (-> (z/of-node root)
                      (z/find-value z/next :metabase/modules)
                      z/right)]
    (z/find-value (z/down mods-zloc) z/right module-sym)))

(defn- find-key-value
  "Find the value zipper for keyword `k` inside a map zipper, or nil."
  [map-zloc k]
  (some-> (z/find-value (z/down map-zloc) z/right k)
          z/right))

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
        module-syms   (loop [zloc (z/down modules-zloc), acc []]
                        (if-not zloc
                          acc
                          (recur (some-> zloc z/right z/right)
                                 (conj acc (z/sexpr zloc)))))
        updated-root
        (reduce
         (fn [root module-sym]
           (reduce
            (fn [root config-key]
              (let [mod-cfg  (some-> (find-module-config root module-sym) z/right)
                    val-zloc (when mod-cfg (find-key-value mod-cfg config-key))
                    computed (get-in boundaries [config-key module-sym] #{})]
                (cond
                  ;; Key exists with a non-set value (e.g. :bypass, :any) — leave it alone.
                  (and val-zloc (not (set? (z/sexpr val-zloc))))
                  root

                  ;; Key exists with a set value — replace or remove.
                  val-zloc
                  (if (seq computed)
                    (z/root (z/replace val-zloc (r.parser/parse-string (model-set-str computed))))
                    (-> val-zloc z/remove z/remove z/root))

                  ;; Key missing and nothing to add.
                  (empty? computed)
                  root

                  ;; Key missing — append `<newline><indent>:key <set>` to the module config map,
                  ;; splicing new children directly to avoid the separator spaces `append-child` inserts.
                  :else
                  (let [m-node       (z/node mod-cfg)
                        new-children (concat (r.node/children m-node)
                                             [(r.node/newlines 1)
                                              (r.node/spaces 3)
                                              (r.node/keyword-node config-key)
                                              (r.node/spaces 1)
                                              (r.parser/parse-string (model-set-str computed))])]
                    (z/root (z/replace mod-cfg (r.node/replace-children m-node new-children)))))))
            root
            [:model-exports :model-imports]))
         (z/root root-zloc)
         module-syms)]
    (spit config-path (z/root-string (z/of-node updated-root)))
    (println "Updated" config-path "with :model-exports and :model-imports.")))
