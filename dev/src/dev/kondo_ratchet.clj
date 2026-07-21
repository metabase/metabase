(ns dev.kondo-ratchet
  "Ratchet on inline kondo ignore forms.

  Per-linter budgets live in `.clj-kondo/ratchets.edn`.
  `metabase.core.kondo-ratchet-test` fails when they drift from the tree;
  `./bin/mage fix-kondo-ratchets` lowers budgets, never raises them.
  Loaded by both the bb task and the JVM test, so keep it dependency-free."
  {:clj-kondo/config '{:linters {:discouraged-var {clojure.core/println {:level :off}}}}}
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

;; Concatenated so this file never contains a literal ignore marker.
(def ^:private ignore-marker
  (str ":clj-kondo" "/ignore"))

;; `#_{... [:some-linter]}`, `^{... [:some-linter]}`, and the prefix-less attr-map form
;; `(ns foo {... [:some-linter]})`; the vector may span lines. The lazy tail after the vector runs to the
;; map's own closing brace, so extra keys still count and removal spans the whole form; a nested-brace
;; value stops the match at the vector instead.
(def ^:private vector-form-re
  (re-pattern (str "(?:(?:#_|\\^)\\s*)?\\{\\s*" ignore-marker "\\s*\\[([^\\]]*)\\](?:[^{}]*?\\})?")))

;; Bare `#_kw` / `^kw` with no linter vector: suppresses every linter on the next form.
(def ^:private bare-form-re
  (re-pattern (str "(?:#_\\s*|\\^)" ignore-marker "(?![\\w./-])")))

(defn mask-strings-and-comments
  "`content` with string-literal and line-comment interiors replaced by spaces, newlines kept.
  Same length as the input, so offsets and line numbers carry over.
  Ignore forms inside strings (test fixtures) or commented-out code must not count."
  [content]
  (let [sb (StringBuilder. ^String content)
        n  (count content)]
    (loop [i 0, state :code]
      (if (>= i n)
        (str sb)
        (let [c (.charAt sb i)]
          (case state
            :code    (case c
                       \" (recur (inc i) :string)
                       \; (do (.setCharAt sb i \space)
                              (recur (inc i) :comment))
                       ;; char literal: never treat the next char as a delimiter
                       \\ (recur (+ i 2) :code)
                       (recur (inc i) :code))
            :string  (case c
                       \" (recur (inc i) :code)
                       \\ (do (.setCharAt sb i \space)
                              (when (< (inc i) n)
                                (when-not (= (.charAt sb (inc i)) \newline)
                                  (.setCharAt sb (inc i) \space)))
                              (recur (+ i 2) :string))
                       \newline (recur (inc i) :string)
                       (do (.setCharAt sb i \space)
                           (recur (inc i) :string)))
            :comment (if (= c \newline)
                       (recur (inc i) :code)
                       (do (.setCharAt sb i \space)
                           (recur (inc i) :comment)))))))))

(defn- linter-keywords
  [vector-contents]
  (map (comp keyword #(subs % 1))
       (re-seq #":[A-Za-z][A-Za-z0-9*+!?<>=._/-]*" vector-contents)))

(defn line-linters
  "Linter keywords suppressed by inline ignore forms on `line`.
  The bare vector-less form counts as `:all`.
  Like [[scan]], ignore forms inside string literals or line comments don't count."
  [line]
  (let [masked (mask-strings-and-comments line)]
    (concat (mapcat (comp linter-keywords second) (re-seq vector-form-re masked))
            (repeat (count (re-seq bare-form-re masked)) :all))))

(defn- offset->line
  "1-based line number of character offset `i` in `content`."
  [content i]
  (inc (count (filter #(= % \newline) (subs content 0 i)))))

(defn- matches-with-offsets
  "Like re-seq, but returns `{:start _, :end _, :linters [...]}` for each match of `re` in `masked`."
  [re masked bare?]
  (let [m (re-matcher re masked)]
    (loop [acc []]
      (if (.find m)
        (recur (conj acc {:start   (.start m)
                          :end     (.end m)
                          :linters (if bare? [:all] (vec (linter-keywords (.group m 1))))}))
        acc))))

(defn ignore-matches
  "Inline ignore matches in `content`, in file order:
  `{:start _, :end _, :line _, :linters [...]}` with character offsets and a 1-based line.
  Matches inside string literals or line comments are excluded."
  [content]
  (let [masked (mask-strings-and-comments content)]
    (->> (concat (matches-with-offsets vector-form-re masked false)
                 (matches-with-offsets bare-form-re masked true))
         (sort-by :start)
         (map #(assoc % :line (offset->line masked (:start %)))))))

(defn scan
  "Occurrences of inline ignore forms under `roots` (relative to the repo root).
  Returns `{:file \"src/...\", :line 42, :linters [...]}` maps.
  Forms inside string literals or line comments don't count."
  ([]
   (scan source-roots))
  ([roots]
   (for [root  roots
         ^java.io.File f (file-seq (io/file root))
         :when (and (.isFile f)
                    (some #(str/ends-with? (.getPath f) %) source-extensions))
         :let  [content (slurp f)]
         :when (str/includes? content ignore-marker)
         m     (ignore-matches content)]
     {:file    (.getPath f)
      :line    (:line m)
      :linters (:linters m)})))

(defn actual-counts
  "Per-linter occurrence counts for `occurrences`, as returned by [[scan]]."
  [occurrences]
  (frequencies (mapcat :linters occurrences)))

(defn- sorted-by-str
  [kvs]
  (into (sorted-map-by #(compare (str %1) (str %2))) kvs))

(defn drift
  "Linters whose count in `occurrences` differs from its budget in `recorded` (absent = 0, either side).
  Returns `{linter {:recorded _, :actual _}}`, plus `:examples` (up to 5 `file:line`) when over budget."
  [recorded occurrences]
  (let [actual (actual-counts occurrences)]
    (sorted-by-str
     (for [linter (into (set (keys actual)) (keys recorded))
           :let   [budget (get recorded linter 0)
                   n      (get actual linter 0)]
           :when  (not= budget n)]
       [linter (cond-> {:recorded budget, :actual n}
                 (> n budget)
                 (assoc :examples (->> occurrences
                                       (filter #(some #{linter} (:linters %)))
                                       (map #(str (:file %) ":" (:line %)))
                                       (take 5)
                                       vec)))]))))

(defn read-ratchets
  "Parsed contents of [[ratchets-file]], with empty defaults when the file doesn't exist."
  []
  (merge {:ignore-counts {}}
         (when (.exists (io/file ratchets-file))
           (edn/read-string (slurp ratchets-file)))))

(def ^:private header
  (str ";; Per-linter budgets for inline `" ignore-marker "` forms.\n"
       ";; metabase.core.kondo-ratchet-test fails when the budgets drift from the actual counts.\n"
       ";; `./bin/mage fix-kondo-ratchets` lowers budgets to match the tree; local test runs do it\n"
       ";; automatically. Raising a budget, or adding one for a new linter (`--seed`), is a hand edit\n"
       ";; to defend in your PR.\n"
       ";; :all is the vector-less ignore form, which suppresses every linter on the next form.\n"))

(defn render
  "Text of the ratchets file for the `{:ignore-counts _}` map `ratchets`.
  Byte-stable: [[fix!]] idempotency and the file-hygiene test depend on it."
  [{:keys [ignore-counts]}]
  (let [counts-indent (apply str (repeat (count "{:ignore-counts {") \space))]
    (str header
         "{:ignore-counts "
         (if (empty? ignore-counts)
           "{}"
           (let [entries (sort-by (comp str first) ignore-counts)
                 width   (apply max (map (comp count str first) entries))]
             (str "{"
                  (str/join (str "\n" counts-indent)
                            (for [[linter n] entries]
                              (format (str "%-" width "s %d") (str linter) n)))
                  "}")))
         "}\n")))

(defn lowered-counts
  "`recorded` with each budget lowered to its actual count; entries with no ignores left are dropped.
  Linters in `seeded` get their budget set to the actual count outright — the explicit escape hatch for
  landing a new linter. Otherwise never raises a budget, never adds one."
  [recorded actual seeded]
  (into (sorted-by-str
         (for [linter seeded
               :when  (pos? (get actual linter 0))]
           [linter (get actual linter)]))
        (keep (fn [[linter budget]]
                (let [n (get actual linter 0)]
                  (cond
                    (contains? (set seeded) linter) nil
                    (zero? n)                       nil
                    (< n budget)                    [linter n]
                    :else                           [linter budget]))))
        recorded))

(defn change-report
  "The lines [[fix!]] prints: lowered/dropped/seeded budgets, plus warnings for anything over budget."
  [{:keys [ignore-counts]} occurrences seeded]
  (let [actual (actual-counts occurrences)]
    (concat
     (for [linter seeded
           :let   [n (get actual linter 0)]]
       (if (pos? n)
         (format "seeded %s at %d" linter n)
         (format "WARNING: %s has no inline ignores -- nothing to seed" linter)))
     (for [[linter budget] (sort-by (comp str first) (apply dissoc ignore-counts seeded))
           :let            [n (get actual linter 0)]
           :when           (not= n budget)]
       (cond
         (zero? n)    (format "dropped %s (no ignores left)" linter)
         (< n budget) (format "lowered %s %d -> %d" linter budget n)
         :else        (format "WARNING: %s is over budget (%d recorded, %d actual) -- remove ignores, or accept them all with `--seed %s`"
                              linter budget n linter)))
     (for [[linter n] (sort-by (comp str first) (apply dissoc actual (concat seeded (keys ignore-counts))))]
       (format "WARNING: %s has %d ignores but no budget entry -- seed one with `./bin/mage fix-kondo-ratchets --seed %s`"
               linter n linter)))))

(defn fix!
  "Rewrite [[ratchets-file]]: lower budgets and normalize formatting.
  `--seed LINTER` (`{:seed \"...\"}` here) sets that budget to the actual count, adding or raising it.
  Prints the [[change-report]], or `unchanged` on a no-op."
  ([]
   (fix! nil))
  ([{:keys [seed]}]
   (let [{:keys [ignore-counts] :as ratchets} (read-ratchets)
         occurrences (scan)
         seeded      (if seed [(keyword (str/replace-first seed #"^:" ""))] [])
         actual      (actual-counts occurrences)
         text        (render {:ignore-counts (lowered-counts ignore-counts actual seeded)})
         file        (io/file ratchets-file)
         old         (when (.exists file) (slurp file))]
     (run! println (change-report ratchets occurrences seeded))
     (if (= old text)
       (println "unchanged")
       (do (spit file text)
           (println (str "wrote " ratchets-file)))))))
