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

(defn step
  "`n` less one."
  [n]
  (dec n))

(defn magnitude
  "The absolute value of `x`."
  [x]
  (abs x))

(defn count-down
  "`:done`, after the [[step]]s from `n` to zero. Endless for a negative `n`."
  [n]
  (loop [n n]
    (if (zero? n)
      :done
      (recur (step n)))))

(def released
  "True when [[spin]] may end."
  (atom false))

(defn spin
  "`:released`, when [[released]] is true. Until then, a loop that calls no var."
  []
  (loop []
    (if @released
      :released
      (recur))))

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
