(ns dev.kondo-ratchet
  "Ratchet on inline kondo ignore forms.

  Per-linter budgets live in `.clj-kondo/ratchets.edn`.
  `metabase.core.kondo-ratchet-test` fails when a count exceeds its budget;
  `./bin/mage fix-kondo-ratchets` lowers budgets to match the tree, never raises them.
  Loaded by both the bb task and the JVM test, so keep it dependency-free."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ratchets-file
  "The budgets file, relative to the repo root."
  ".clj-kondo/ratchets.edn")

(def ^:private source-roots
  ["src" "test" "enterprise" "modules/drivers" "dev" "bin" "mage"])

(def ^:private source-extensions
  [".clj" ".cljc" ".cljs"])

;; Files whose ignore forms are regexes or test fixtures, not suppressions.
;; Side effect: this file's own few real ignores go uncounted.
(def ^:private fixture-files
  #{"dev/src/dev/kondo_ratchet.clj"
    "dev/test/dev/deps_graph_test.clj"
    "test/metabase/core/kondo_ratchet_test.clj"})

;; Concatenated so this file never contains a literal ignore marker.
(def ^:private ignore-marker
  (str ":clj-kondo" "/ignore"))

;; `#_{... [:some-linter]}` and `^{... [:some-linter]}`.
;; A vector spilling onto the next line is missed, which only makes the ratchet more lenient.
(def ^:private vector-form-re
  (re-pattern (str "(?:#_|\\^)\\s*\\{\\s*" ignore-marker "\\s*\\[([^\\]]*)\\]")))

;; Bare `#_kw` / `^kw` with no linter vector: suppresses every linter on the next form.
(def ^:private bare-form-re
  (re-pattern (str "(?:#_\\s*|\\^)" ignore-marker "(?![\\w./-])")))

(defn- linter-keywords
  [vector-contents]
  (map (comp keyword #(subs % 1))
       (re-seq #":[A-Za-z][A-Za-z0-9*+!?<>=._/-]*" vector-contents)))

(defn line-linters
  "Linter keywords suppressed by inline ignore forms on `line`.
  The bare vector-less form counts as `:all`."
  [line]
  (concat (mapcat (comp linter-keywords second) (re-seq vector-form-re line))
          (repeat (count (re-seq bare-form-re line)) :all)))

(defn- source-file?
  [^java.io.File f]
  (let [path (.getPath f)]
    (and (.isFile f)
         (some #(str/ends-with? path %) source-extensions)
         (not (contains? fixture-files path)))))

(defn scan
  "Occurrences of inline ignore forms under `roots` (relative to the repo root).
  Returns `{:file \"src/...\", :line 42, :linters [...]}` maps."
  ([]
   (scan source-roots))
  ([roots]
   (for [root  roots
         f     (file-seq (io/file root))
         :when (source-file? f)
         :let  [content (slurp f)]
         :when (str/includes? content ignore-marker)
         [i line] (map-indexed vector (str/split-lines content))
         :let  [linters (seq (line-linters line))]
         :when linters]
     {:file    (.getPath ^java.io.File f)
      :line    (inc i)
      :linters (vec linters)})))

(defn actual-counts
  "Per-linter occurrence counts for `occurrences`, as returned by [[scan]]."
  [occurrences]
  (frequencies (mapcat :linters occurrences)))

(defn over-budget
  "Linters in `occurrences` whose count exceeds its budget in `recorded` (an absent linter has budget 0).
  Returns `{:linter _, :recorded _, :actual _, :examples [\"file:line\" ...]}` maps sorted by linter."
  [recorded occurrences]
  (->> (for [[linter n] (actual-counts occurrences)
             :let       [budget (get recorded linter 0)]
             :when      (> n budget)]
         {:linter   linter
          :recorded budget
          :actual   n
          :examples (->> occurrences
                         (filter #(some #{linter} (:linters %)))
                         (map #(str (:file %) ":" (:line %)))
                         (take 5)
                         vec)})
       (sort-by (comp str :linter))))

(defn read-ratchets
  "Parsed contents of [[ratchets-file]], or `{:ignore-counts {}}` when the file doesn't exist."
  []
  (if (.exists (io/file ratchets-file))
    (edn/read-string (slurp ratchets-file))
    {:ignore-counts {}}))

(def ^:private header
  (str ";; Per-linter budgets for inline `" ignore-marker "` forms.\n"
       ";; metabase.core.kondo-ratchet-test fails when a count exceeds its budget.\n"
       ";; `./bin/mage fix-kondo-ratchets` lowers budgets to match the tree; local test runs do it automatically.\n"
       ";; Raising a budget, or adding one for a new linter, is a hand edit to defend in your PR.\n"
       ";; :all is the vector-less ignore form, which suppresses every linter on the next form.\n"))

(defn render
  "Text of the ratchets file for the `counts` budget map.
  Byte-stable: [[fix!]] idempotency and the file-hygiene test depend on it."
  [counts]
  (str header
       (if (empty? counts)
         "{:ignore-counts {}}\n"
         (let [entries (sort-by (comp str first) counts)
               width   (apply max (map (comp count str first) entries))
               indent  (apply str (repeat (count "{:ignore-counts {") \space))]
           (str "{:ignore-counts {"
                (str/join (str "\n" indent)
                          (for [[linter n] entries]
                            (format (str "%-" width "s %d") (str linter) n)))
                "}}\n")))))

(defn lowered-counts
  "`recorded` with each budget lowered to its actual count; entries with no ignores left are dropped.
  Never raises a budget, never adds one."
  [recorded actual]
  (into {}
        (keep (fn [[linter budget]]
                (let [n (get actual linter 0)]
                  (cond
                    (zero? n)    nil
                    (< n budget) [linter n]
                    :else        [linter budget]))))
        recorded))

(defn change-report
  "The lines [[fix!]] prints: lowered and dropped budgets, plus warnings for anything over budget."
  [recorded actual]
  (concat
   (for [[linter budget] (sort-by (comp str first) recorded)
         :let            [n (get actual linter 0)]
         :when           (not= n budget)]
     (cond
       (zero? n)    (format "dropped %s (no ignores left)" linter)
       (< n budget) (format "lowered %s %d -> %d" linter budget n)
       :else        (format "WARNING: %s is over budget (%d recorded, %d actual) -- remove ignores or raise the budget by hand"
                            linter budget n)))
   (for [[linter n] (sort-by (comp str first) (apply dissoc actual (keys recorded)))]
     (format "WARNING: %s has %d ignores but no budget entry -- add one by hand" linter n))))

(defn fix!
  "Rewrite [[ratchets-file]] with lowered budgets and normalized formatting.
  Prints the [[change-report]], or `unchanged` on a no-op."
  []
  (let [recorded (:ignore-counts (read-ratchets))
        actual   (actual-counts (scan))
        text     (render (lowered-counts recorded actual))
        file     (io/file ratchets-file)
        old      (when (.exists file) (slurp file))]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (run! println (change-report recorded actual))
    (if (= old text)
      #_{:clj-kondo/ignore [:discouraged-var]}
      (println "unchanged")
      (do (spit file text)
          #_{:clj-kondo/ignore [:discouraged-var]}
          (println (str "wrote " ratchets-file))))))
