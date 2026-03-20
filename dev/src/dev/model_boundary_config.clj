(ns dev.model-boundary-config
  "Compute `:model-exports` and `:model-imports` for every module.

  Usage at the REPL:

    (dev.model-boundary-config/compute-model-boundaries)
    ;; => {:model-exports {module => #{:model/X ...}}
    ;;     :model-imports {module => #{:model/X ...}}}"
  (:require
   [dev.deps-graph :as deps-graph]))

(set! *warn-on-reflection* true)

(defn- models-owned-by
  "Set of `:model/X` keywords owned by `mod` according to `ownership`."
  [ownership mod]
  (into #{}
        (comp (filter (fn [[_ owner]] (= owner mod)))
              (map key))
        ownership))

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
        owned-by    (into {} (map (fn [mod] [mod (models-owned-by ownership mod)])) all-modules)]
    {:model-exports
     (into (sorted-map)
           (for [mod all-modules, :let [owned (get owned-by mod)], :when (seq owned)]
             [mod (into (sorted-set)
                        (for [[other-mod refs] module-refs
                              :when            (not= other-mod mod)
                              model            refs
                              :when            (contains? owned model)]
                          model))]))
     :model-imports
     (into (sorted-map)
           (for [mod all-modules
                 :let [owned    (get owned-by mod)
                       imported (into (sorted-set)
                                      (for [model (get module-refs mod)
                                            :let  [defining-mod (get ownership model)]
                                            :when (and defining-mod
                                                       (not= defining-mod mod)
                                                       (not (contains? owned model)))]
                                        model))]
                 :when (seq imported)]
             [mod imported]))}))
