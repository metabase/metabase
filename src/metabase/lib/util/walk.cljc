(ns metabase.lib.util.walk
  (:require
   [medley.core :as m]))

(def whats
  [:lib.walk/query.pre
   :lib.walk/stages.pre
   :lib.walk/stage.pre
   :lib.walk/joins.pre
   :lib.walk/join.pre
   :lib.walk/join.post
   :lib.walk/joins.post
   :lib.walk/stage.post
   :lib.walk/stages.post
   :lib.walk/query.post])

(defn- walk-indexed [f xs context]
  (mapv (fn [[i x]]
          (f x (-> context
                   (update :path conj i)
                   (assoc :i i))))
        (m/indexed xs)))

(declare walk-stages)

(defn- walk-join [f]
  (fn [join context]
    (as-> join join
      (f join (assoc context :what :lib.walk/join.pre))
      (update join :stages walk-stages f context)
      (f join (assoc context :what :lib.walk/join.post)))))

(defn- walk-joins [joins f context]
  (let [context (update context :path conj :joins)]
    (as-> joins joins
      (f joins (assoc context :what :lib.walk/joins.pre))
      (walk-indexed (walk-join f) joins context)
      (f joins (assoc context :what :lib.walk/joins.post)))))

(defn- walk-stage [f]
  (fn [stage context]
    (as-> stage stage
      (f stage (assoc context :what :lib.walk/stage.pre))
      (cond-> stage
        (seq (:joins stage)) (update :joins walk-joins f context))
      (f stage (assoc context :what :lib.walk/stage.post)))))

(defn- walk-stages [stages f context]
  (let [context (update context :path conj :stages)]
    (as-> stages stages
      (f stages (assoc context :what :lib.walk/stages.pre))
      (walk-indexed (walk-stage f) stages context)
      (f stages (assoc context :what :lib.walk/stages.post)))))

(defn walk-query
  "`f` is called like

    (f x context)

  for each of the [[whats]]."
  [query f]
  (as-> query query
    (f query {:query query, :path [], :what :lib.walk/query.pre})
    (update query :stages walk-stages f {:query query, :path []})
    (f query {:query query, :path [], :what :lib.walk/query.post})))
