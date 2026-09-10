(ns dev.modules-config
  "Regenerate `.clj-kondo/config/modules/config.edn`.

  [[dev.deps-graph]] computes `:api` and `:uses`;
  [[dev.model-boundary-config]] computes `:model-exports` and `:model-imports`.
  This namespace writes those generated keys in sorted order while preserving
  handwritten settings, comments, and the `:any` and `:bypass` sentinels.

  Usage:

    (dev.modules-config/update-config!)   ; from a warm REPL — fast

  Or from a cold JVM (see `./bin/mage fix-modules-config`):

    clojure -X:dev dev.modules-config/-main

  It updates generated values only for modules already in the config. It reports
  modules that must be added or reordered, because those changes may require a
  namespace prefix or owner."
  (:require
   [clojure.string :as str]
   [dev.deps-graph :as deps-graph]
   [dev.model-boundary-config :as mbc]
   [rewrite-clj.node :as n]
   [rewrite-clj.parser :as r.parser]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

(def ^:private config-path ".clj-kondo/config/modules/config.edn")

(def ^:private generated-keys
  "The keys this tool owns and rewrites. Order matters only for where appended keys land."
  [:api :uses :model-exports :model-imports])

;;;; ---------------------------------------------------------------------------
;;;; Ordering — must match `metabase.core.modules-test`
;;;; ---------------------------------------------------------------------------

(defn- enterprise? [module-name]
  (str/starts-with? (str module-name) "enterprise/"))

(defn- sort-module-names
  "Sort module symbols with `enterprise/` modules last. Mirrors the test's `sort-module-names`."
  [module-names]
  (sort-by (juxt #(if (enterprise? %) 1 0) str) module-names))

(defn- sort-for-key
  "Return the sorted element vector for a generated key. `:uses` sorts modules enterprise-last; everything
  else (namespace symbols for `:api`, `:model/X` keywords for the model keys) sorts naturally."
  [k elements]
  (vec (if (= k :uses)
         (sort-module-names elements)
         (sort elements))))

;;;; ---------------------------------------------------------------------------
;;;; Set nodes
;;;; ---------------------------------------------------------------------------

(defn- set-elements
  "Ordered vector of element sexprs in a `:set` node, in file order. (`z/sexpr` would return an unordered
  set, useless for the sortedness comparison.)"
  [set-node]
  (into [] (comp (filter #(= :token (n/tag %))) (map n/sexpr))
        (n/children set-node)))

(defn- build-set-node
  "rewrite-clj `:set` node for `sorted-elements`. Small sets (<=3) stay inline; larger ones go one element
  per line, continuation lines indented `indent` spaces to align under the first element. Matches the
  hand-formatting convention used throughout config.edn (and by [[dev.model-boundary-config]])."
  [sorted-elements indent]
  (r.parser/parse-string
   (if (<= (count sorted-elements) 3)
     (str "#{" (str/join " " sorted-elements) "}")
     (let [pad (apply str (repeat indent \space))]
       (str "#{" (str/join (str "\n" pad) sorted-elements) "}")))))

;;;; ---------------------------------------------------------------------------
;;;; Zipper navigation
;;;; ---------------------------------------------------------------------------

(defn- modules-map-zloc
  "Zipper at the `:metabase/modules` map value."
  [root-node]
  (-> (z/of-node root-node)
      (z/find-value z/next :metabase/modules)
      z/right))

(defn- module-config-zloc
  "Zipper at the config map for `module-sym`, or nil."
  [root-node module-sym]
  (some-> (z/find-value (z/down (modules-map-zloc root-node)) z/right module-sym)
          z/right))

(defn- key-value-zloc
  "Zipper at the value of `k` inside a map zipper, or nil."
  [map-zloc k]
  (some-> (z/find-value (z/down map-zloc) z/right k)
          z/right))

(defn- module-syms-in-order
  "Vector of module symbols in file order (skips non-symbol keys like `:ignored-namespace-patterns`)."
  [root-node]
  (loop [zloc (z/down (modules-map-zloc root-node)), acc []]
    (if-not zloc
      acc
      (let [k (z/sexpr zloc)]
        (recur (some-> zloc z/right z/right)
               (cond-> acc (symbol? k) (conj k)))))))

;;;; ---------------------------------------------------------------------------
;;;; Editing
;;;; ---------------------------------------------------------------------------

(defn- append-indent
  "Continuation indent for a freshly appended `:key #{...}` line: aligns elements under the first one."
  [k]
  ;; "   :key " + "#{" -> element starts two columns past `#`
  (+ 3 (count (str k)) 1 2))

(defn- update-module-key
  "Rewrite one generated `key` of one module in `root-node`, returning the new root node.
  `computed` is the desired set (possibly empty). `indent` is the continuation indent for an existing set
  (from its `#{` column) or nil to fall back to an appended-key indent."
  [root-node module-sym k computed indent]
  (let [map-zloc (module-config-zloc root-node module-sym)
        val-zloc (when map-zloc (key-value-zloc map-zloc k))]
    (cond
      ;; No such module (structural — handled/warned elsewhere).
      (nil? map-zloc) root-node

      ;; Sentinel value (`:any`/`:bypass`) — human-owned, leave untouched.
      (and val-zloc (not (set? (z/sexpr val-zloc)))) root-node

      ;; Existing set value.
      val-zloc
      (let [elements (set-elements (z/node val-zloc))
            target   (sort-for-key k computed)]
        (cond
          (empty? computed)
          (if (#{:model-exports :model-imports} k)
            ;; Model keys default to absent; drop the now-empty key entirely.
            (-> val-zloc z/remove z/remove z/root)
            ;; :api/:uses stay explicit; normalize to `#{}` only if not already empty.
            (if (empty? elements)
              root-node
              (z/root (z/replace val-zloc (n/set-node [])))))

          ;; Already correct and sorted — leave the node (and its comments) byte-for-byte.
          (= elements target) root-node

          :else
          (z/root (z/replace val-zloc (build-set-node target (or indent (append-indent k)))))))

      ;; Key missing but needed — append it to the module's config map.
      (empty? computed) root-node

      :else
      (let [m-node   (z/node map-zloc)
            set-node (build-set-node (sort-for-key k computed) (append-indent k))
            children (concat (n/children m-node)
                             [(n/newlines 1) (n/spaces 3)
                              (n/keyword-node k) (n/spaces 1) set-node])]
        (z/root (z/replace map-zloc (n/replace-children m-node children)))))))

;;;; ---------------------------------------------------------------------------
;;;; Indents (captured from the pristine, position-tracked parse)
;;;; ---------------------------------------------------------------------------

(defn- collect-indents
  "Map of `[module-sym key]` -> continuation-indent (spaces) for every existing generated set value,
  read from element `#{` columns so rebuilt sets align exactly like their neighbours. Navigates the
  position-tracked zipper `pos-root` directly (re-wrapping via `z/of-node` would drop positions)."
  [pos-root]
  (let [mods (-> pos-root (z/find-value z/next :metabase/modules) z/right)]
    (loop [zloc (z/down mods), acc {}]
      (if-not zloc
        acc
        (let [k    (z/sexpr zloc)
              vmap (z/right zloc)]
          (recur (some-> vmap z/right)
                 (if (symbol? k)
                   (reduce
                    (fn [acc gk]
                      (let [vz (some-> (z/find-value (z/down vmap) z/right gk) z/right)]
                        (if (and vz (= :set (z/tag vz)))
                          (assoc acc [k gk] (inc (second (z/position vz))))
                          acc)))
                    acc
                    generated-keys)
                   acc)))))))

;;;; ---------------------------------------------------------------------------
;;;; Compute the desired config (single shared parse pass)
;;;; ---------------------------------------------------------------------------

(defn compute-desired
  "Compute every module's generated config values.

  Returns `{module-sym {:api set, :uses set, :model-exports set, :model-imports set}}`.

  The four-argument form is pure. The no-argument form gathers its inputs from
  [[dev.deps-graph]], running the independent scans concurrently."
  ([]
   (let [config (deps-graph/kondo-config)
         f-deps (future (deps-graph/dependencies))
         f-own  (future (deps-graph/model-ownership))
         f-refs (future (deps-graph/model-references-by-module))]
     (compute-desired config @f-deps @f-own @f-refs)))
  ([config dependencies model-ownership model-references]
   (let [api+uses   (deps-graph/generate-config dependencies config)
         boundaries (mbc/compute-model-boundaries config model-ownership model-references)
         modules    (into #{} (concat (keys api+uses)
                                      (keys (:model-exports boundaries))
                                      (keys (:model-imports boundaries))))]
     (into {}
           (map (fn [module]
                  [module {:api            (get-in api+uses [module :api] #{})
                           :uses           (get-in api+uses [module :uses] #{})
                           :model-exports  (get-in boundaries [:model-exports module] #{})
                           :model-imports  (get-in boundaries [:model-imports module] #{})}]))
           modules))))

;;;; ---------------------------------------------------------------------------
;;;; Structural warnings (things this tool won't auto-fix)
;;;; ---------------------------------------------------------------------------

(defn- structural-warnings
  "Sequence of human-readable warnings for structural mismatches this tool won't touch."
  [file-modules desired]
  (let [file-set    (set file-modules)
        desired-set (set (keys desired))
        to-add      (sort (remove file-set desired-set))
        ;; Some configured modules have no generated data, so only report missing desired modules.
        sorted?     (= file-modules (sort-module-names file-modules))]
    (cond-> []
      (seq to-add)
      (conj (str "New module(s) not in config — add them by hand (choose their namespace prefix and "
                 "ownership; nested modules may inherit :team): "
                 (str/join ", " to-add)))

      (not sorted?)
      (conj "Modules are not sorted by name (enterprise/ last) — reorder them by hand."))))

;;;; ---------------------------------------------------------------------------
;;;; Entry point
;;;; ---------------------------------------------------------------------------

(defn rewrite-config
  "Pure core of the tool. Given the current config.edn `original` text and the `desired` per-module
  generated-key map (see [[compute-desired]]), return

    {:text     the rewritten config text
     :warnings [human-readable strings for structural mismatches this tool won't touch]}

  Idempotent: a config already matching `desired` yields `:text` byte-for-byte equal to `original`. Only
  modules present in `desired` are touched, so library-sourced entries like `connection-pool` (dissoc'd
  from the deps graph) are left alone."
  [original desired]
  (let [pos-root     (z/of-string original {:track-position? true})
        indents      (collect-indents pos-root)
        ;; full `:forms` node: keeps the header/footer comment blocks that surround the top-level map.
        full-root    (z/root pos-root)
        file-modules (module-syms-in-order full-root)
        edited       (reduce
                      (fn [root-node module-sym]
                        (reduce
                         (fn [root-node k]
                           (update-module-key root-node module-sym k
                                              (get-in desired [module-sym k] #{})
                                              (get indents [module-sym k])))
                         root-node
                         generated-keys))
                      full-root
                      (filter desired file-modules))]
    {:text     (n/string edited)
     :warnings (structural-warnings file-modules desired)}))

(defn update-config!
  "Rewrite `.clj-kondo/config/modules/config.edn` so the generated keys are correct and sorted.
  Idempotent: a clean config is left byte-for-byte unchanged. Returns `:updated` or `:unchanged`."
  []
  (let [original                (slurp config-path)
        {:keys [text warnings]} (rewrite-config original (compute-desired))]
    ;; CLI tool output: mage fix-modules-config callers read these lines from stdout
    #_{:clj-kondo/ignore [:discouraged-var]}
    (doseq [w warnings]
      (println (str "WARNING: " w)))
    (if (= text original)
      ;; CLI tool output: mage fix-modules-config callers read these lines from stdout
      (do #_{:clj-kondo/ignore [:discouraged-var]}
       (println "config.edn already up to date.")
          :unchanged)
      (do (spit config-path text)
          ;; CLI tool output: mage fix-modules-config callers read these lines from stdout
          #_{:clj-kondo/ignore [:discouraged-var]}
          (println "Updated" config-path)
          :updated))))

(defn fix-config!
  "Cold-JVM entry point for `clojure -X:dev dev.modules-config/fix-config!`. Takes (and ignores) the
  `-X` exec-args map."
  [_]
  (update-config!)
  (shutdown-agents))
