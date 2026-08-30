(ns dev.kondo-ratchet
  "Ratchet on inline kondo ignore forms.

  Per-linter policies live in `.clj-kondo/ratchets.edn`, with the linters whose ignores need no comment.
  Local tests require an exact match; CI rejects only increases and lets the shrink workflow record the rest.
  `./bin/mage fix-kondo-ratchets` lowers budgets and drops stale exemptions, never the reverse.
  Loaded by both the bb task and the JVM test, so keep it dependency-free."
  {:clj-kondo/config '{:linters {:discouraged-var {clojure.core/println {:level :off}}}}}
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.walk :as walk]))

(set! *warn-on-reflection* true)

(def ^:dynamic *ratchets-file*
  "The budgets file, relative to the repo root."
  ".clj-kondo/ratchets.edn")

(defn- read-ratchets-form
  "The one EDN map in `file`.
  An empty file, a non-map, or a second form is an error rather than an empty policy set, so a damaged
  file can never read as \"no budgets\"."
  [^java.io.File file]
  (with-open [reader (java.io.PushbackReader. (io/reader file))]
    (let [eof  (Object.)
          form (edn/read {:eof eof} reader)]
      (when (identical? eof form)
        (throw (ex-info (str *ratchets-file* " is empty; expected one map of policies")
                        {:file *ratchets-file*})))
      (when-not (map? form)
        (throw (ex-info (str *ratchets-file* " must hold a map of policies, not " (pr-str form))
                        {:file *ratchets-file*, :form form})))
      (when-not (identical? eof (edn/read {:eof eof} reader))
        (throw (ex-info (str *ratchets-file* " holds more than one form; expected one map of policies")
                        {:file *ratchets-file*})))
      form)))

(defn read-ratchets
  "Parsed contents of [[*ratchets-file*]], with empty defaults for omitted keys.
  Throws when the file is missing; only an explicit `{:disabled true}` opts out of enforcement."
  []
  (let [file (io/file *ratchets-file*)]
    (when-not (.exists file)
      (throw (ex-info (str *ratchets-file* " is missing -- only {:disabled true} opts out of enforcement")
                      {:file *ratchets-file*})))
    (let [ratchets (merge {:ignore-counts {}, :config-counts {}, :comment-exempt #{}}
                          (read-ratchets-form file))]
      (when-not (map? (:ignore-counts ratchets))
        (throw (ex-info ":ignore-counts must be a map of linter policies"
                        {:ignore-counts (:ignore-counts ratchets)})))
      (doseq [[linter policy] (:ignore-counts ratchets)]
        (when-not (or (= policy :unlimited)
                      (and (integer? policy) (not (neg? policy))))
          (throw (ex-info (format "%s has invalid policy %s; expected a non-negative integer or :unlimited"
                                  linter (pr-str policy))
                          {:linter linter, :policy policy}))))
      (when-not (map? (:config-counts ratchets))
        (throw (ex-info ":config-counts must be a map of linter budgets"
                        {:config-counts (:config-counts ratchets)})))
      (doseq [[linter budget] (:config-counts ratchets)]
        (when-not (and (integer? budget) (not (neg? budget)))
          (throw (ex-info (format "%s has invalid config budget %s; expected a non-negative integer"
                                  linter (pr-str budget))
                          {:linter linter, :budget budget}))))
      (when-not (set? (:comment-exempt ratchets))
        (throw (ex-info ":comment-exempt must be a set of linters"
                        {:comment-exempt (:comment-exempt ratchets)})))
      ratchets)))

(defn disabled?
  "Whether `ratchets` (default: [[read-ratchets]]) explicitly disables the ratchets."
  ([]
   (disabled? (read-ratchets)))
  ([ratchets]
   (true? (:disabled ratchets))))

(def ^:private deps-file
  "deps.edn")

(def ^:private kondo-config-source
  "Source file of clj-kondo's default config, on the classpath once the clj-kondo jar is."
  "clj_kondo/impl/config.clj")

(defn- pinned-kondo-version
  "The clj-kondo version the `:kondo` alias in [[deps-file]] lints with."
  []
  (or (get-in (edn/read-string (slurp deps-file))
              [:aliases :kondo :replace-deps 'clj-kondo/clj-kondo :mvn/version])
      (throw (ex-info (str "no clj-kondo pin under the :kondo alias in " deps-file) {:file deps-file}))))

(defn- kondo-config-resource
  "URL of [[kondo-config-source]]. Throws when the clj-kondo jar is not on the classpath and cannot be added."
  []
  (or (io/resource kondo-config-source)
      ;; the JVM `:dev` alias already has the jar; babashka adds the pinned version on demand, resolving
      ;; through the same Maven cache the JVM uses
      (when (System/getProperty "babashka.version")
        ((requiring-resolve 'babashka.deps/add-deps)
         {:deps {'clj-kondo/clj-kondo {:mvn/version (pinned-kondo-version)}}})
        (io/resource kondo-config-source))
      (throw (ex-info (str kondo-config-source " is not on the classpath; add the clj-kondo dependency")
                      {:resource kondo-config-source}))))

(defn builtin-linters
  "Names of every linter clj-kondo ships, read from the `default-config` literal in the pinned jar."
  []
  ;; reading the source rather than loading the namespace keeps this babashka-compatible
  (binding [*read-eval* false]
    (with-open [r (java.io.PushbackReader. (io/reader (kondo-config-resource)))]
      (loop []
        (let [form (read {:eof ::eof} r)]
          (cond
            (= form ::eof)
            (throw (ex-info (str "default-config not found in " kondo-config-source) {}))

            (and (seq? form) (= 'def (first form)) (= 'default-config (second form)))
            ;; the value is a quoted literal, so the def reads as (def default-config (quote {...}))
            (set (keys (:linters (second (nth form 2)))))

            :else
            (recur)))))))

(def ^:private kondo-config-dir
  ".clj-kondo")

(defn- tracked-files
  "The git-tracked files under `dir` that are present on disk.
  A file deleted but not yet staged, or outside a sparse checkout, is skipped."
  [dir]
  ;; only tracked files keep validation the same everywhere: the dependency configs `mage kondo` copies
  ;; in are gitignored, and a clean checkout has none of them
  (let [^java.util.List command ["git" "ls-files" "-z"]
        process (.start (doto (ProcessBuilder. command)
                          (.directory ^java.io.File (io/file dir))
                          (.redirectErrorStream true)))
        out     (slurp (.getInputStream process))]
    (when-not (zero? (.waitFor process))
      (throw (ex-info (str "git ls-files failed in " dir ": " (str/trim out)) {:dir dir})))
    (->> (str/split out #"\x00")
         (remove str/blank?)
         (map #(io/file dir %))
         (filter #(.isFile ^java.io.File %)))))

(defn- linters-map-keys
  "Keys of every `:linters` map nested anywhere in `config`, so scoped linters under `:config-in-ns`,
  `:config-in-call`, and library configs count too."
  [config]
  (let [found (atom #{})]
    (walk/prewalk (fn [x]
                    (when (and (map? x) (map? (:linters x)))
                      (swap! found into (keys (:linters x))))
                    x)
                  config)
    @found))

(defn repository-linters
  "Names of every linter configured in a tracked `.edn` file under `dir` (default: `.clj-kondo`), which is
  how the repository's own hook linters get a level."
  ([]
   (repository-linters kondo-config-dir))
  ([dir]
   (into #{}
         (comp (filter (fn [^java.io.File f]
                         (str/ends-with? (.getName f) ".edn")))
               (mapcat (fn [^java.io.File f]
                         (linters-map-keys (edn/read-string (slurp f))))))
         (tracked-files dir))))

(def external-linters
  "Diagnostics from tools other than kondo that ignores still name, plus `:all` for the vector-less form."
  #{:all :clojure-lsp/unused-public-var})

(defn known-linters
  "Every linter name a policy may use: kondo's built-ins, the repository's own, and [[external-linters]]."
  []
  (into (builtin-linters) cat [(repository-linters) external-linters]))

(defn unknown-linters
  "Policy keys in `ratchets` that are not in `known`, sorted."
  [{:keys [ignore-counts config-counts comment-exempt]} known]
  (into (sorted-set-by #(compare (str %1) (str %2)))
        (remove known)
        (concat (keys ignore-counts) (keys config-counts) comment-exempt)))

(defn- known-linter-hint []
  (format "policies must name a kondo built-in, a linter configured under %s, or one of %s"
          kondo-config-dir
          (str/join ", " (sort-by str external-linters))))

(defn validate-linters!
  "Throw one error naming every policy key in `ratchets` that is not a known linter."
  [ratchets known]
  (let [unknown (unknown-linters ratchets known)]
    (when (seq unknown)
      (throw (ex-info (format "%s names %d unknown linter%s: %s -- %s"
                              *ratchets-file*
                              (count unknown)
                              (if (= 1 (count unknown)) "" "s")
                              (str/join ", " unknown)
                              (known-linter-hint))
                      {:unknown (vec unknown)})))))

(defn validate-seed!
  "Throw when a linter in `seeded` is not known, so `--seed` never writes a policy the check rejects."
  [seeded known]
  (when-let [unknown (seq (remove known seeded))]
    (throw (ex-info (format "cannot seed %s: not a known linter -- %s"
                            (str/join ", " unknown)
                            (known-linter-hint))
                    {:unknown (vec unknown)}))))

(def ^:private source-roots
  ["src" "test" "enterprise" "modules/drivers" "dev" "bin" "mage"])

(def ^:private source-extensions
  [".clj" ".cljc" ".cljs"])

;; Concatenated so this file never contains a literal ignore marker.
(def ^:private ignore-marker
  (str ":clj-kondo" "/ignore"))

;; A keyword ends only at EOF, whitespace/comma, or one of Clojure's terminating reader macros.
;; Defining the boundary by delimiters keeps every other character -- including Unicode -- in a
;; lookalike keyword such as `:clj-kondo/ignoreλ` rather than mistaking its prefix for the marker.
(def ^:private reader-delimiter-char-class
  "[\\p{javaWhitespace},()\\[\\]{}\";@^`~\\\\]")

(def ^:private ignore-marker-boundary
  (str "(?=$|" reader-delimiter-char-class ")"))

;; A namespaced-map prefix (and its optional clj-kondo reader discard) must start a reader form,
;; not merely occur inside a symbol such as `foo#:clj-kondo` or `foo#_#:clj-kondo`.
(def ^:private reader-form-start
  (str "(?:^|(?<=" reader-delimiter-char-class "))(?:#_)*"))

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
  (re-pattern (str "(?:#_\\s*|\\^)" ignore-marker ignore-marker-boundary)))

(def ^:private ignore-marker-re
  (re-pattern (str ignore-marker ignore-marker-boundary)))

;; Any explicit `#:clj-kondo` map can spell the real ignore key as `:ignore`, including after arbitrary
;; values or comments. Reserve the namespace prefix itself rather than parsing what separates it from the map.
(def ^:private namespaced-ignore-prefix-re
  (re-pattern (str reader-form-start "#:clj-kondo" ignore-marker-boundary)))

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
  "Offsets of real or namespaced-map ignore markers in `masked`; strings and comments are blanked."
  [masked]
  (mapcat (fn [re]
            (let [m (re-matcher re masked)]
              (loop [acc []]
                (if (.find m)
                  (recur (conj acc (.start m)))
                  acc))))
          [ignore-marker-re namespaced-ignore-prefix-re]))

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
      (throw (ex-info (format "Unsupported %s syntax on line%s %s; use the literal ignore key first in its map"
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
         :when (or (str/includes? content ignore-marker)
                   (re-find namespaced-ignore-prefix-re content))
         m     (try
                 (ignore-matches content)
                 (catch clojure.lang.ExceptionInfo e
                   (let [file (.getPath f)]
                     (throw (ex-info (format "%s in %s" (.getMessage e) file)
                                     (assoc (ex-data e) :file file)
                                     e)))))]
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
           :when  (and (not= budget :unlimited)
                       (not= budget n))]
       [linter (cond-> {:recorded budget, :actual n}
                 (> n budget)
                 (assoc :examples (->> occurrences
                                       (filter #(some #{linter} (:linters %)))
                                       (map #(str (:file %) ":" (:line %)))
                                       (take 5)
                                       vec)))]))))

(defn over-budget
  "Linters whose actual count exceeds their bounded policy."
  [policies occurrences]
  (sorted-by-str
   (for [[linter {:keys [recorded actual] :as entry}] (drift policies occurrences)
         :when (> actual recorded)]
     [linter entry])))

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
  item, and one per scoped `:off` nested under it at any depth. Scopes nest arbitrarily deep --
  `:discouraged-java-method` keys by class and then by method -- so counting only the first level
  would let an `:off` hide one map further down."
  [cfg]
  (if-not (map? cfg)
    0
    (+ (if (= (:level cfg) :off) 1 0)
       (excluded-items (:exclude cfg))
       (reduce + 0 (map suppressed-in (vals (dissoc cfg :level :exclude)))))))

(defn config-suppressions
  "Per-linter counts of config-level suppressions in `config` (default: `.clj-kondo/config.edn`):
  top-level `:linters` entries, `:config-in-comment`, and every `:config-in-ns` / `:config-in-call`
  group. Scoped groups count too, or a linter could be switched off inside one and never show up.
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
            (for [scope    [:config-in-ns :config-in-call]
                  [_k cfg] (get config scope)]
              (counts (:linters cfg)))))))

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

(defn config-over-budget
  "Linters whose config-suppression count exceeds its budget."
  [budgets counts]
  (sorted-by-str
   (for [[linter {:keys [recorded actual] :as entry}] (config-drift budgets counts)
         :when (> actual recorded)]
     [linter entry])))

(def ^:private header
  (str ";; Budgets for kondo suppressions: inline `" ignore-marker "` forms per linter (:ignore-counts),\n"
       ";; and config-level waivers in .clj-kondo/config.edn (:config-counts -- :off switches and :exclude\n"
       ";; entries). Each :ignore-counts value is a non-negative integer budget, or :unlimited for no ceiling.\n"
       ";; CI rejects counts above a numeric budget; local tests require those counts to match exactly.\n"
       ";; Any ignore outside :comment-exempt needs an explanatory comment directly above or trailing on its line.\n"
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
                       (format (str "%-" width "s %s") (str linter) (str n))))
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
  "`recorded` with each bounded budget lowered to its actual count; bounded entries with no ignores go.
  An `:unlimited` policy is kept as written, even at zero: it records a decision about the linter, not a count.
  Linters in `seeded` get their budget set outright — the explicit escape hatch for landing a new linter.
  Otherwise never raises a budget, never adds one."
  [recorded actual seeded]
  (let [seeded? (set seeded)]
    (into (sorted-by-str
           (for [linter seeded
                 :when  (pos? (get actual linter 0))]
             [linter (get actual linter)]))
          (keep (fn [[linter budget]]
                  (let [n (get actual linter 0)]
                    (cond
                      (seeded? linter)      nil
                      (= budget :unlimited) [linter budget]
                      (zero? n)             nil
                      (< n budget)          [linter n]
                      :else                 [linter budget]))))
          recorded)))

(defn unexercised-unlimited
  "Linters with an `:unlimited` policy in `ignore-counts` and no ignores in `actual`, sorted."
  [ignore-counts actual]
  (into (sorted-set-by #(compare (str %1) (str %2)))
        (for [[linter policy] ignore-counts
              :when (and (= policy :unlimited)
                         (zero? (get actual linter 0)))]
          linter)))

(defn unexercised-unlimited-warning
  "One informational line naming the [[unexercised-unlimited]] linters, or nil when there are none.
  The policies stay in place; the line only makes a stale one visible."
  [ignore-counts actual]
  (let [linters (unexercised-unlimited ignore-counts actual)]
    (when (seq linters)
      (str "WARNING: :unlimited policies with no ignores left: " (str/join ", " linters)
           " -- delete an entry by hand once its linter no longer needs one"))))

(defn change-report
  "The lines [[fix!]] prints: lowered/dropped/seeded budgets, dropped exemptions, plus warnings for
  anything over budget and for `:unlimited` policies nothing uses any more."
  [{:keys [ignore-counts config-counts comment-exempt]} occurrences config-actual seeded]
  (let [actual (actual-counts occurrences)]
    (concat
     (for [linter seeded
           :let   [n (get actual linter 0)]]
       (cond
         (pos? n)                         (format "seeded %s at %d" linter n)
         (contains? ignore-counts linter) (format "WARNING: %s has no inline ignores -- dropping its policy"
                                                  linter)
         :else                            (format "WARNING: %s has no inline ignores -- nothing to seed"
                                                  linter)))
     (for [[linter budget] (sort-by (comp str first) (apply dissoc ignore-counts seeded))
           :let            [n (get actual linter 0)]
           ;; a hand-written 0 with no ignores is dropped too, so it needs a line
           :when           (and (integer? budget) (or (not= n budget) (zero? budget)))]
       (cond
         (zero? n)    (format "dropped %s (no ignores left)" linter)
         (< n budget) (format "lowered %s %d -> %d" linter budget n)
         :else        (format "WARNING: %s is over budget (%d recorded, %d actual) -- remove ignores, or accept them all with `--seed %s`"
                              linter budget n linter)))
     (some-> (unexercised-unlimited-warning (apply dissoc ignore-counts seeded) actual) vector)
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
  "Rewrite [[*ratchets-file*]]: lower budgets, drop stale comment exemptions, normalize formatting.
  Refuses to touch a file naming an unknown linter, whether seeded or recorded, and never removes one.
  `--seed LINTER` (`{:seed \"...\"}` here) sets that budget to the actual count and bounds an unlimited one.
  Prints the [[change-report]], or `unchanged` on a no-op.
  Does nothing, including seeding, when the file sets `:disabled` to `true`."
  ([]
   (fix! nil))
  ([{:keys [seed]}]
   (let [{:keys [ignore-counts config-counts comment-exempt] :as ratchets} (read-ratchets)]
     (if (disabled? ratchets)
       (println (str *ratchets-file* " is disabled -- nothing to do"))
       (let [known         (known-linters)
             _             (validate-linters! ratchets known)
             seeded        (if seed [(keyword (str/replace-first seed #"^:" ""))] [])
             _             (validate-seed! seeded known)
             occurrences   (scan)
             actual        (actual-counts occurrences)
             config-actual (config-suppressions)
             text          (render {:ignore-counts  (lowered-counts ignore-counts actual seeded)
                                    :config-counts  (lowered-counts config-counts config-actual [])
                                    :comment-exempt (reduce disj comment-exempt (stale-exemptions comment-exempt occurrences))})
             old           (slurp *ratchets-file*)]
         (run! println (change-report ratchets occurrences config-actual seeded))
         (if (= old text)
           (println "unchanged")
           (do (spit *ratchets-file* text)
               (println (str "wrote " *ratchets-file*)))))))))

(defn check-report
  "The lines [[check]] prints when inline ignores or config suppressions (`config-actual`) exceed their
  budgets, or `text` is not normalized.
  Lower counts are allowed because the shrink workflow records them after the change lands."
  [{:keys [ignore-counts config-counts] :as ratchets} occurrences config-actual text]
  (let [over        (over-budget ignore-counts occurrences)
        config-over (config-over-budget config-counts config-actual)
        linter-line (fn [[linter {:keys [recorded actual]}]]
                      (format "  %s: %d recorded, %d actual" linter recorded actual))]
    (concat
     (when (seq over)
       (cons (str "over budget -- remove an ignore, or seed the budget with"
                  " `./bin/mage fix-kondo-ratchets --seed <linter>` and defend it in the PR:")
             (mapcat (fn [[_ {:keys [examples]} :as entry]]
                       (cons (linter-line entry) (map #(str "    " %) examples)))
                     over)))
     (when (seq config-over)
       (cons (str "config suppressions over budget -- remove the entry from " kondo-config-file
                  ", or raise the budget by hand and defend it in the PR:")
             (map linter-line config-over)))
     (when (not= text (render ratchets))
       [(str *ratchets-file* " is not normalized -- run `./bin/mage fix-kondo-ratchets`"
             " to fix the formatting")]))))

(defn- exit!
  "Fail the babashka task with `message`, without mage's default stack trace."
  [message]
  (throw (ex-info message {:babashka/exit 1, :mage/quiet true})))

(defn- fail!
  "[[exit!]], for a `message` the run has not already printed."
  [message]
  (println message)
  (exit! message))

(defn check
  "Fail the babashka task when the ratchets file is missing, a policy names an unknown linter, inline
  ignores or config suppressions exceed a bounded budget, or the file is not normalized.
  Only an explicit `{:disabled true}` opts out of enforcement.
  An unused `:unlimited` policy is reported but does not fail the check."
  []
  (if-not (.exists (io/file *ratchets-file*))
    (fail! (str *ratchets-file* " is missing -- only {:disabled true} opts out of enforcement"))
    ;; read-ratchets, validate-linters! and scan all throw on malformed input; without this they reach
    ;; the user as a babashka stack dump.
    (try
      (let [ratchets (read-ratchets)]
        (if (disabled? ratchets)
          (println (str *ratchets-file* " is disabled -- nothing to check"))
          (do
            (validate-linters! ratchets (known-linters))
            (let [occurrences (scan)
                  lines       (check-report ratchets occurrences (config-suppressions) (slurp *ratchets-file*))]
              (some-> (unexercised-unlimited-warning (:ignore-counts ratchets) (actual-counts occurrences)) println)
              (if (empty? lines)
                (println (format "ok -- %d ignore forms within %d policies"
                                 (count occurrences) (count (:ignore-counts ratchets))))
                (do (run! println lines)
                    (exit! (str *ratchets-file* " drifted from the source tree"))))))))
      (catch clojure.lang.ExceptionInfo e
        (if (:babashka/exit (ex-data e))
          (throw e)
          (fail! (ex-message e)))))))
