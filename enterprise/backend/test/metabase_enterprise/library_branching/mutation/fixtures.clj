(ns metabase-enterprise.library-branching.mutation.fixtures
  "Targets for the tests of the mutation harness.")

(defn clamp
  "`x`, bounded below by `lo` and above by `hi`."
  [lo hi x]
  (max lo (min hi x)))

(defn tagged
  "`x` under the key `::tag`."
  [x]
  {::tag x})

(defmulti area
  "The area of a shape map."
  {:arglists '([shape])}
  :shape)

(defmethod area :square
  [{:keys [side]}]
  (* side side))

(defmethod area :rectangle
  [{:keys [width height]}]
  (* width height))
