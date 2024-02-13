(ns dev.fe-helpers)

(defn redux-state
  "Returns the root Redux state, the JS object holding the complete state of the app.

  This is hacky - it reaches deep into the internals of Redux, and may break in the future. That seems acceptable for a
  dev time helper."
  []
  (let [root  (js/document.querySelector "#root")
        store (.. root -_reactRootContainer -_internalRoot -current -child -memoizedProps -store)]
    (.getState store)))

(defn current-card
  "Retrieves the current query's card from the Redux state.

  Undefined behavior if there is not currently a single question loaded in the UI."
  []
  (.. (redux-state) -qb -card))

(defn current-legacy-query-js
  "Gets the legacy query for the currently loaded question."
  []
  (.-dataset_query (current-card)))

(defn current-query
  "Gets the MLv2 query for the currently loaded question.

  Hack: This relies on a dev-mode-only global property that's set whenever a Question object is converted to MLv2."
  []
  (.-__MLv2_query js/window))
