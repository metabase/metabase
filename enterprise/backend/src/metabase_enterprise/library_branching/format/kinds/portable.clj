(ns metabase-enterprise.library-branching.format.kinds.portable
  "Portable MBQL in the JSON form. Not implemented yet.")

(set! *warn-on-reflection* true)

(defn implied-stage-type "Not implemented yet." [_stage] nil)
(defn key-refs "Not implemented yet." [_k _v] nil)
(defn clause-ref "Not implemented yet." [_x] nil)
(defn refs "Not implemented yet." [_x] #{})
(defn query-refs "Not implemented yet." [_query] #{})
(defn omit-implied "Not implemented yet." [query] query)
(defn restore-implied "Not implemented yet." [query] query)
(defn implied-keys? "Not implemented yet." [_query] false)
