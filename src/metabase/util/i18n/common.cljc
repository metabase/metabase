(ns metabase.util.i18n.common
  "Shared CLJ + CLJS functionality that's re-exported from [[metabase.util.i18n]]."
  (:require
   [clojure.string :as str]))

(defn join-strings-with-conjunction
  "This is basically [[clojure.string/join]] but uses commas to join everything but the last two args, which are joined
  by a string `conjunction`. Uses Oxford commas for > 2 args.

  (join-strings-with-conjunction \"and\" [\"X\" \"Y\" \"Z\"])
  ;; => \"X, Y, and Z\""
  [conjunction coll]
  (when (seq coll)
    (if (= (count coll) 1)
      (first coll)
      (let [conjunction (str \space (str/trim conjunction) \space)]
        (if (= (count coll) 2)
          ;; exactly 2 args: X and Y
          (str (first coll) conjunction (second coll))
          ;; > 2 args: X, Y, and Z
          (str
           (str/join ", " (butlast coll))
           ","
           conjunction
           (last coll)))))))
