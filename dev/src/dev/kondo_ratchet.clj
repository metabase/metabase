(ns dev.kondo-ratchet
  "Ratchet on inline kondo ignore forms.

  Per-linter budgets live in `.clj-kondo/ratchets.edn`, along with the set of linters whose ignores don't
  need a justification comment.
  `metabase.core.kondo-ratchet-test` fails when either drifts from the tree;
  `./bin/mage fix-kondo-ratchets` lowers budgets and drops stale exemptions, never the reverse.
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

;; Canonical map form: the ignore must be the first key. This covers reader-discard maps, metadata maps,
;; and prefix-less attr maps such as `(ns foo {...})`. Keeping one deliberately narrow spelling lets the
;; scanner fail closed instead of growing a partial Clojure reader; [[ignore-matches]] rejects any real
;; ignore marker not covered by this pattern. The vector may span lines. The lazy tail after the vector
;; runs to the map's own closing brace, so extra keys still count and removal spans the whole form; a
;; nested-brace value stops the match at the vector instead.
(def ^:private vector-form-re
  (re-pattern (str "(?:(?:#_|\\^)\\s*)?\\{\\s*" ignore-marker "\\s*\\[([^\\]]*)\\](?:[^{}]*?\\})?")))

;; Bare `#_kw` / `^kw` with no linter vector: suppresses every linter on the next form.
(def ^:private bare-form-re
  (re-pattern (str "(?:#_\\s*|\\^)" ignore-marker "(?![\\w./-])")))

(def ^:private ignore-marker-re
  (re-pattern (str ignore-marker "(?![\\w./-])")))

(defn mask-strings-and-comments
  "`content` with string-literal and line-comment interiors replaced by spaces, newlines kept.
  Same length as the input, so offsets and line numbers carry over.
  Ignore forms inside strings (test fixtures) or commented-out code must not count.
  The `;` that starts a comment survives, and no other `;` does, so
  [[has-justification-comment?]] can locate real trailing comments."
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
                       \; (recur (inc i) :comment)
                       ;; char literal: mask the next char so it can't open a string or start a comment
                       \\ (do (when (< (inc i) n)
                                (when-not (= (.charAt sb (inc i)) \newline)
                                  (.setCharAt sb (inc i) \space)))
                              (recur (+ i 2) :code))
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

;; A justifying comment has a letter somewhere in it; a bare `;;` or `;; ----` section divider does not.
(def ^:private substantive-comment-re
  #";+.*[A-Za-z].*")

(defn- has-justification-comment?
  "Does the ignore starting at `start`/ending at `end` in `content` have an explanatory comment?
  Counts a substantive trailing comment on the same line, or a comment-only line directly above.

  Comment openers are authenticated in `masked`, where a real opener survives but semicolons inside
  strings do not; their text is then read from `content`, since masking blanks comment interiors."
  [content masked start end]
  (let [line-num   (offset->line content start)
        line-end   (or (str/index-of content "\n" end) (count content))
        raw-lines  (vec (str/split-lines content))
        mask-lines (vec (str/split-lines masked))
        above-idx  (- line-num 2)]
    (boolean (or (when-let [i (str/index-of masked ";" end)]
                   (when (< i line-end)
                     (re-matches substantive-comment-re (str/trim (subs content i line-end)))))
                 (when-let [raw (get raw-lines above-idx)]
                   (when-let [i (str/index-of (get mask-lines above-idx "") ";")]
                     (and (str/blank? (subs raw 0 i))
                          (re-matches substantive-comment-re (str/trim (subs raw i))))))))))

(defn- marker-offsets
  "Offsets of real ignore markers in `masked`; strings and comments have already been blanked."
  [masked]
  (let [m (re-matcher ignore-marker-re masked)]
    (loop [acc []]
      (if (.find m)
        (recur (conj acc (.start m)))
        acc))))

(defn- unsupported-ignore-lines
  "Lines containing an ignore marker outside one of `matches`' canonical spans."
  [masked matches]
  (for [offset (marker-offsets masked)
        :when  (not-any? #(<= (:start %) offset (dec (:end %))) matches)]
    (offset->line masked offset)))

(defn ignore-matches
  "Inline ignore matches in `content`, in file order:
  `{:start _, :end _, :line _, :linters [...], :justified? _}` with character offsets and a 1-based line.
  The ignore must be the first key of its map. Any other spelling is rejected rather than guessed at,
  so a suppression cannot silently bypass the ratchet. Matches inside strings and comments are excluded."
  [content]
  (let [masked      (mask-strings-and-comments content)
        matches     (vec (concat (matches-with-offsets vector-form-re masked false)
                                 (matches-with-offsets bare-form-re masked true)))
        unsupported (vec (unsupported-ignore-lines masked matches))]
    (when (seq unsupported)
      (throw (ex-info (format "Unsupported %s syntax on line%s %s; put the ignore first in its map"
                              ignore-marker
                              (if (= 1 (count unsupported)) "" "s")
                              (str/join ", " unsupported))
                      {:lines unsupported})))
    (->> matches
         (sort-by :start)
         (map #(assoc %
                      :line       (offset->line masked (:start %))
                      :justified? (has-justification-comment? content masked (:start %) (:end %)))))))

(defn line-linters
  "Linter keywords suppressed by inline ignore forms on `line`.
  The bare vector-less form counts as `:all`.
  Like [[scan]], ignore forms inside string literals or line comments don't count."
  [line]
  (mapcat :linters (ignore-matches line)))

(defn scan
  "Occurrences of inline ignore forms under `roots` (relative to the repo root).
  Returns `{:file \"src/...\", :line 42, :linters [...], :justified? boolean}` maps.
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
     {:file       (.getPath f)
      :line       (:line m)
      :linters    (:linters m)
      :justified? (:justified? m)})))

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

(defn unjustified
  "Occurrences that need a justification comment but lack one, and suppress at least one linter outside
  the `exempt` set."
  [exempt occurrences]
  (for [{:keys [linters justified?] :as occurrence} occurrences
        :when (and (not justified?)
                   (seq (remove exempt linters)))]
    occurrence))

(defn stale-exemptions
  "Linters in `exempt` that no longer have any unjustified ignore, so the exemption can go."
  [exempt occurrences]
  (let [still-needed (set (mapcat :linters (unjustified #{} occurrences)))]
    (into (sorted-set-by #(compare (str %1) (str %2)))
          (remove still-needed)
          exempt)))

(def ^:private kondo-config-file
  ".clj-kondo/config.edn")

(defn- excluded-items
  "How many items an `:exclude` value waives: sequential entries count each, and a map's values count
  their elements when sequential (`{compojure.core [GET POST]}` is 2) or 1 otherwise (a scoping map like
  `{some.var {:namespaces [...]}}` excludes one var)."
  [excl]
  (cond
    (map? excl)  (reduce + (map #(if (sequential? %) (count %) 1) (vals excl)))
    (coll? excl) (count excl)
    :else        0))

(defn- suppressed-in
  "How many warnings one linter's config map waives: 1 for a `{:level :off}` switch, one per excluded
  item, and one per nested per-var or per-namespace `:off`."
  [cfg]
  (if-not (map? cfg)
    0
    (+ (if (= (:level cfg) :off) 1 0)
       (excluded-items (:exclude cfg))
       (count (filter #(and (map? %) (= (:level %) :off))
                      (vals (dissoc cfg :level :exclude)))))))

(defn config-suppressions
  "Per-linter counts of config-level suppressions in `config` (default: `.clj-kondo/config.edn`):
  top-level `:linters` entries, every `:config-in-ns` group, and `:config-in-comment`.
  Entries that add discouragements or turn linters on count nothing — only weakening counts."
  ([]
   (config-suppressions (edn/read-string (slurp kondo-config-file))))
  ([config]
   (let [counts (fn [linters-map]
                  (into {}
                        (for [[linter cfg] linters-map
                              :let  [n (suppressed-in cfg)]
                              :when (pos? n)]
                          [linter n])))]
     (apply merge-with +
            (counts (:linters config))
            (counts (get-in config [:config-in-comment :linters]))
            (for [[_group group-cfg] (:config-in-ns config)]
              (counts (:linters group-cfg)))))))

(defn config-drift
  "Linters whose config-suppression count differs from its budget (absent = 0, either side).
  Returns `{linter {:recorded _, :actual _}}`."
  [recorded actual]
  (sorted-by-str
   (for [linter (into (set (keys actual)) (keys recorded))
         :let   [budget (get recorded linter 0)
                 n      (get actual linter 0)]
         :when  (not= budget n)]
     [linter {:recorded budget, :actual n}])))

(defn read-ratchets
  "Parsed contents of [[ratchets-file]], with empty defaults when the file doesn't exist."
  []
  (merge {:ignore-counts {}, :config-counts {}, :comment-exempt #{}}
         (when (.exists (io/file ratchets-file))
           (edn/read-string (slurp ratchets-file)))))

(def ^:private header
  (str ";; Budgets for kondo suppressions: inline `" ignore-marker "` forms per linter (:ignore-counts),\n"
       ";; and config-level waivers in .clj-kondo/config.edn (:config-counts -- :off switches and :exclude\n"
       ";; entries). metabase.core.kondo-ratchet-test fails when either drifts from reality, or when an\n"
       ";; ignore outside :comment-exempt lacks an explanatory comment directly above or trailing on its line.\n"
       ";; `./bin/mage fix-kondo-ratchets` lowers budgets and drops stale exemptions; local test runs do it\n"
       ";; automatically. Raising a budget, adding one (`--seed` for inline, by hand for config), or\n"
       ";; widening the exemptions is a hand edit to defend in your PR.\n"
       ";; :all is the vector-less ignore form, which suppresses every linter on the next form.\n"))

(defn- render-counts
  [counts indent]
  (if (empty? counts)
    "{}"
    (let [entries (sort-by (comp str first) counts)
          width   (apply max (map (comp count str first) entries))]
      (str "{"
           (str/join (str "\n" indent)
                     (for [[linter n] entries]
                       (format (str "%-" width "s %d") (str linter) n)))
           "}"))))

(defn render
  "Text of the ratchets file for the `{:ignore-counts _, :config-counts _, :comment-exempt _}` map.
  Byte-stable: [[fix!]] idempotency and the file-hygiene test depend on it."
  [{:keys [ignore-counts config-counts comment-exempt]}]
  (let [counts-indent (apply str (repeat (count "{:ignore-counts  {") \space))
        exempt-indent (apply str (repeat (count " :comment-exempt #{") \space))]
    (str header
         "{:ignore-counts  " (render-counts ignore-counts counts-indent)
         "\n :config-counts  " (render-counts config-counts counts-indent)
         "\n :comment-exempt "
         (if (empty? comment-exempt)
           "#{}"
           (str "#{"
                (str/join (str "\n" exempt-indent)
                          (sort-by str comment-exempt))
                "}"))
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
  "The lines [[fix!]] prints: lowered/dropped/seeded budgets, dropped exemptions, plus warnings for
  anything over budget."
  [{:keys [ignore-counts config-counts comment-exempt]} occurrences config-actual seeded]
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
               linter n linter))
     (for [[linter {:keys [recorded actual]}] (config-drift config-counts config-actual)]
       (cond
         (zero? actual)       (format "dropped config %s (no suppressions left)" linter)
         (< actual recorded)  (format "lowered config %s %d -> %d" linter recorded actual)
         :else                (format "WARNING: config suppressions for %s are over budget (%d recorded, %d actual) -- remove one from .clj-kondo/config.edn or raise the budget by hand"
                                      linter recorded actual)))
     (for [linter (stale-exemptions comment-exempt occurrences)]
       (format "unexempted %s (all its ignores are justified now)" linter)))))

(defn fix!
  "Rewrite [[ratchets-file]]: lower budgets, drop stale comment exemptions, normalize formatting.
  `--seed LINTER` (`{:seed \"...\"}` here) sets that budget to the actual count, adding or raising it.
  Prints the [[change-report]], or `unchanged` on a no-op."
  ([]
   (fix! nil))
  ([{:keys [seed]}]
   (let [{:keys [ignore-counts config-counts comment-exempt] :as ratchets} (read-ratchets)
         occurrences   (scan)
         seeded        (if seed [(keyword (str/replace-first seed #"^:" ""))] [])
         actual        (actual-counts occurrences)
         config-actual (config-suppressions)
         text          (render {:ignore-counts  (lowered-counts ignore-counts actual seeded)
                                :config-counts  (lowered-counts config-counts config-actual [])
                                :comment-exempt (reduce disj comment-exempt (stale-exemptions comment-exempt occurrences))})
         file          (io/file ratchets-file)
         old           (when (.exists file) (slurp file))]
     (run! println (change-report ratchets occurrences config-actual seeded))
     (if (= old text)
       (println "unchanged")
       (do (spit file text)
           (println (str "wrote " ratchets-file)))))))
