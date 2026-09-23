(ns mage.readable.diff
  "Line diffs of two texts, using git's own diff algorithm so results look like GitHub's."
  (:require
   [babashka.fs :as fs]
   [babashka.process :as process]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn- lines [s]
  (if (str/blank? s) [] (str/split-lines s)))

(defn diff-rows
  "Full-file diff of `old` and `new` text (either may be nil). Returns a vector of rows
  {:type :ctx|:add|:del, :old n-or-nil, :new n-or-nil, :text line}, covering every line of both files."
  [old new]
  (let [old (or old "") new (or new "")]
    (if (= old new)
      (vec (map-indexed (fn [i l] {:type :ctx :old (inc i) :new (inc i) :text l}) (lines new)))
      (let [dir (fs/create-temp-dir {:prefix "mage-readable"})
            a   (fs/file dir "a")
            b   (fs/file dir "b")]
        (try
          (spit a old)
          (spit b new)
          (let [{:keys [out]} (process/shell {:out :string :err :string :continue true}
                                             "git" "diff" "--no-index" "--no-color" "--no-ext-diff" "--no-textconv" "--minimal"
                                             "-U1000000"
                                             (str a) (str b))
                body (drop-while #(not (str/starts-with? % "@@")) (str/split-lines out))]
            (loop [ls (rest body), o 1, n 1, acc []]
              (if-let [l (first ls)]
                (let [c (first l) text (subs l (min 1 (count l)))]
                  (case c
                    \space (recur (rest ls) (inc o) (inc n) (conj acc {:type :ctx :old o :new n :text text}))
                    \-     (recur (rest ls) (inc o) n (conj acc {:type :del :old o :new nil :text text}))
                    \+     (recur (rest ls) o (inc n) (conj acc {:type :add :old nil :new n :text text}))
                    (recur (rest ls) o n acc)))
                acc)))
          (finally
            (fs/delete-tree dir)))))))

(defn stats
  "{:add n :del n} for diff rows."
  [rows]
  {:add (count (filter #(= :add (:type %)) rows))
   :del (count (filter #(= :del (:type %)) rows))})
