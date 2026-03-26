(ns dev.model-boundary-config
  "Compute `:model-exports` and `:model-imports` for every module.

  Usage at the REPL:

    (dev.model-boundary-config/compute-model-boundaries)
    ;; => {:model-exports {module => #{:model/X ...}}
    ;;     :model-imports {module => #{:model/X ...}}}"
  (:require
   [dev.deps-graph :as deps-graph]))

(set! *warn-on-reflection* true)

(defn compute-model-boundaries
  "Compute the required `:model-exports` and `:model-imports` for every module.

  Returns `{:model-exports {module => sorted-set-of-models}
            :model-imports {module => sorted-set-of-models}}`

  `:model-exports` for module M = models owned by M that are referenced by at least one other module.
  `:model-imports` for module M = models owned by other modules that M references."
  []
  (let [ownership   (deps-graph/model-ownership)
        module-refs (deps-graph/model-references-by-module)
        all-modules (set (keys (deps-graph/kondo-config)))
        ;; {:model/X => #{modules that reference it}} — inverted index for fast export lookups
        model->referencing-modules
        (reduce-kv (fn [acc mod models]
                     (reduce (fn [acc model]
                               (update acc model (fnil conj #{}) mod))
                             acc
                             models))
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
                 :let [imported (into (sorted-set)
                                      (for [model (get module-refs mod)
                                            :let [defining-mod (get ownership model)]
                                            :when (and defining-mod (not= defining-mod mod))]
                                        model))]
                 :when (seq imported)]
             [mod imported]))}))
