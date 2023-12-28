(ns dev.fe-helpers)

(defn redux-state []
  (let [root  (js/document.querySelector "#root")
        store (.. root -_reactRootContainer -_internalRoot -current -child -memoizedProps -store)]
    (.getState store)))

(defn current-card []
  (.. (redux-state) -qb -card))

(defn current-legacy-query-js []
  (.-dataset_query (current-card)))

(defn current-query []
  (.-__MLv2_query js/window))
