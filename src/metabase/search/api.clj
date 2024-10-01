(ns metabase.search.api)

;; TODO wrap these functions in Malli signatures

(defmulti results "Find results matching the given search query." :search-engine)

(defmulti model-set "Determine which models would have at least one result." :search-engine)

(defmulti score "Rank the search results." (fn [_ {se :search-engine}] se))
