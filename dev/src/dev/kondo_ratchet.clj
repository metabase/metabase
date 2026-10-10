(ns dev.kondo-ratchet
  "Enforce budgets for kondo suppressions and module escape hatches.

  Counts may fall but not exceed their budgets. Ignores outside `:comment-exempt` need justification.
  `./bin/mage kondo-ratchets-shrink` is the only writer; `--seed` adds or raises an ignore budget.
  This namespace runs under Babashka and the JVM, so keep it dependency-free."
  {:clj-kondo/config '{:linters {:discouraged-var {clojure.core/println {:level :off}}}}}
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *ratchets-file*
  "Kondo budgets for production code, relative to the repo root. Rebind to read a merge stage or test
  fixture."
  ".clj-kondo/ratchets.edn")

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *test-ratchets-file*
  "Kondo budgets for test code, relative to the repo root. Separate from [[*ratchets-file*]] so test-code
  ignores can't mask a prod-code count; only :ignore-counts is tracked here (see [[config-suppressions]]
  for why). Rebind to read a merge stage or test fixture."
  ".clj-kondo/ratchets-test.edn")

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *module-ratchets-file*
  "Module-boundary budgets, relative to the repo root. Rebind to read a merge stage or test fixture."
  ".clj-kondo/config/modules/ratchets.edn")

(def ^:private module-config-file
  ".clj-kondo/config/modules/config.edn")

(def ^:private kondo-config-file
  ".clj-kondo/config.edn")

(defn- read-ratchets-form
  "The one EDN map at `path`.
  An empty file, a non-map, or a second form is an error rather than an empty policy set, so a damaged
  file can never read as \"no budgets\"."
  [path]
  (with-open [reader (java.io.PushbackReader. (io/reader path))]
    (let [eof  (Object.)
          form (edn/read {:eof eof} reader)]
      (when (identical? eof form)
        (throw (ex-info (str path " is empty; expected one map of policies")
                        {:file path})))
      (when-not (map? form)
        (throw (ex-info (str path " must hold a map of policies, not " (pr-str form))
                        {:file path, :form form})))
      (when-not (identical? eof (edn/read {:eof eof} reader))
        (throw (ex-info (str path " holds more than one form; expected one map of policies")
                        {:file path})))
      form)))

(def discouragement-linters
  "Linters configured per symbol, whose ignores are budgeted per symbol in a [[discouraged-count-field]]."
  #{:discouraged-namespace :discouraged-var})

(defn discouraged-count-field
  "The ratchets.edn field holding `linter`'s per-symbol budgets: `:discouraged-var` -> `:discouraged-var-counts`."
  [linter]
  (keyword (str (name linter) "-counts")))

(def ^:private discouraged-count-fields
  (into #{} (map discouraged-count-field) discouragement-linters))

(def ^:private ratchet-field-order
  (into [:ignore-counts] cat [(sort discouraged-count-fields) [:config-counts :comment-exempt]]))

(def ^:private empty-policies
  (into {} (map (fn [field] [field (if (= field :comment-exempt) #{} {})])) ratchet-field-order))

(defn- validate-budgets!
  "Throw unless `budgets`, the value of `field`, maps names to non-negative integers."
  [field budgets]
  (when-not (map? budgets)
    (throw (ex-info (str field " must be a map of budgets")
                    {field budgets})))
  (doseq [[k budget] budgets]
    (when-not (nat-int? budget)
      (throw (ex-info (format "%s in %s has invalid budget %s; expected a non-negative integer"
                              k field (pr-str budget))
                      {:field field, :name k, :budget budget})))))

(defn validate-policies
  "Validate and return `ratchets`:

  - `:ignore-counts` maps linters to non-negative integers or `:unlimited`
  - `:discouraged-var-counts` and `:discouraged-namespace-counts` map per-symbol keys
    ([[discouraged-count-key]]) to non-negative integers
  - `:config-counts` maps linters to non-negative integers
  - `:comment-exempt` is a set of linters

  All names must be keywords. Throws on malformed input."
  [ratchets]
  (let [{:keys [ignore-counts config-counts comment-exempt], :as merged} (merge empty-policies ratchets)]
    (when-not (map? ignore-counts)
      (throw (ex-info ":ignore-counts must be a map of linter policies"
                      {:ignore-counts ignore-counts})))
    (doseq [[linter policy] ignore-counts]
      (when-not (or (= policy :unlimited)
                    (and (integer? policy) (not (neg? policy))))
        (throw (ex-info (format "%s has invalid policy %s; expected a non-negative integer or :unlimited"
                                linter (pr-str policy))
                        {:linter linter, :policy policy}))))
    (doseq [field discouraged-count-fields]
      (validate-budgets! field (get merged field)))
    (validate-budgets! :config-counts config-counts)
    (when-not (set? comment-exempt)
      (throw (ex-info ":comment-exempt must be a set of linters"
                      {:comment-exempt comment-exempt})))
    ;; the merge keys on (str linter) and renders the same way, so a non-keyword name would be rewritten
    ;; as a keyword, collide with one, or produce a file that no longer reads back
    (doseq [policy-name (concat (keys ignore-counts)
                                (mapcat (comp keys #(get merged %)) discouraged-count-fields)
                                (keys config-counts)
                                comment-exempt)]
      (when-not (keyword? policy-name)
        (throw (ex-info (format "%s is not a linter name; policies and exemptions are keyed by keyword"
                                (pr-str policy-name))
                        {:policy-name policy-name}))))
    ratchets))

(defn read-ratchets
  "Read and validate [[*ratchets-file*]], defaulting omitted fields to empty.
  Only `{:disabled true}` disables enforcement."
  []
  (let [file (io/file *ratchets-file*)]
    (when-not (.exists file)
      (throw (ex-info (str *ratchets-file* " is missing -- only {:disabled true} opts out of enforcement")
                      {:file *ratchets-file*})))
    (validate-policies (merge empty-policies (read-ratchets-form *ratchets-file*)))))

(defn validate-module-ratchets
  "Validate and return a map from module metric keywords to non-negative integer budgets."
  [ratchets]
  (validate-budgets! :module-ratchets ratchets)
  (doseq [metric (keys ratchets)]
    (when-not (keyword? metric)
      (throw (ex-info (str (pr-str metric) " is not a module metric; metrics are keyed by keyword")
                      {:metric metric}))))
  ratchets)

(defn read-module-ratchets
  "Read and validate [[*module-ratchets-file*]]."
  []
  (let [file (io/file *module-ratchets-file*)]
    (when-not (.exists file)
      (throw (ex-info (str *module-ratchets-file* " is missing")
                      {:file *module-ratchets-file*})))
    (validate-module-ratchets (read-ratchets-form *module-ratchets-file*))))

(defn disabled?
  "Whether `ratchets` (default: [[read-ratchets]]) explicitly disables the ratchets."
  ([]
   (disabled? (read-ratchets)))
  ([ratchets]
   (true? (:disabled ratchets))))

(defn module-escape-hatches
  "Count the module config's escape hatches.

  - `:api-any`              modules that expose every namespace
  - `:friend-edges`         individual `:friends` grants
  - `:model-imports-bypass` modules exempt from model-boundary checks
  - `:ns-prefixes`          modules whose namespaces have not moved to match their module name
  - `:uses-any`             modules that may depend on any module"
  ([]
   (-> (edn/read-string (slurp module-config-file))
       :metabase/modules
       module-escape-hatches))
  ([config]
   (let [values (vals config)]
     {:api-any              (count (filter #(= :any (:api %)) values))
      :friend-edges         (transduce (map (comp count :friends)) + 0 values)
      :model-imports-bypass (count (filter #(= :bypass (:model-imports %)) values))
      :ns-prefixes          (count (keep :ns-prefix values))
      :uses-any             (count (filter #(= :any (:uses %)) values))})))

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

(defn- linters-maps
  "Every `:linters` map nested anywhere in `config`, so scoped linters under `:config-in-ns`, `:config-in-call`,
  and library configs count too."
  [config]
  (for [x     (tree-seq coll? seq config)
        :when (map? x)
        :let  [linters (:linters x)]
        :when (map? linters)]
    linters))

(defn repository-linters
  "Names of every linter configured in a tracked `.edn` file under `dir` (default: `.clj-kondo`), which is
  how the repository's own hook linters get a level."
  ([]
   (repository-linters kondo-config-dir))
  ([dir]
   (into #{}
         (comp (filter (fn [^java.io.File f]
                         (str/ends-with? (.getName f) ".edn")))
               (map (comp edn/read-string slurp))
               (mapcat linters-maps)
               (mapcat keys))
         (tracked-files dir))))

(def external-linters
  "Diagnostics from tools other than kondo that ignores still name, plus `:all` for the vector-less form."
  #{:all :clojure-lsp/unused-public-var})

(defn kondo-config
  "The parsed `.clj-kondo/config.edn`."
  []
  (edn/read-string (slurp kondo-config-file)))

(defn discouraged-symbols
  "Every symbol configured under `linter` in `config`, including its `:config-in-ns` and `:config-in-call` scopes."
  [linter config]
  ;; A scoped entry still names a discouraged symbol, so every scope counts.
  (into #{}
        (comp (map linter)
              (filter map?)
              (mapcat keys))
        (linters-maps config)))

(def ^:private enterprise-prefix
  "metabase-enterprise.")

(def ^:private oss-prefix
  "metabase.")

(defn- drop-metabase-prefix
  "`s` without its `metabase.` prefix, or with `metabase-enterprise.` shortened to `ee.`."
  [s]
  ;; Shortened, not dropped, so an OSS namespace and its enterprise mirror keep different names.
  (cond
    (str/starts-with? s enterprise-prefix) (str "ee." (subs s (count enterprise-prefix)))
    (str/starts-with? s oss-prefix)        (subs s (count oss-prefix))
    :else                                  s))

(defn discouraged-count-key
  "The ratchet key for `sym`, a symbol configured under one of the [[discouragement-linters]]: the symbol as a
  keyword, with [[drop-metabase-prefix]] applied to its namespace.
  For example, `metabase.search.core/search` -> `:search.core/search`,
  `metabase-enterprise.search.core/search` -> `:ee.search.core/search`, and
  `clojure.tools.logging` -> `:clojure.tools.logging`."
  [sym]
  (if-let [ns-part (namespace sym)]
    (keyword (drop-metabase-prefix ns-part) (name sym))
    (keyword (drop-metabase-prefix (name sym)))))

(defn discouraged-count-keys
  "The [[discouraged-count-key]] of every symbol configured under `linter` ([[discouraged-symbols]]).
  Throws when two symbols share a key."
  ([linter]
   (discouraged-count-keys linter (kondo-config)))
  ([linter config]
   (let [by-key (group-by discouraged-count-key (discouraged-symbols linter config))]
     ;; two symbols on one key would share a budget without anyone noticing
     (doseq [[k syms] by-key
             :when    (< 1 (count syms))]
       (throw (ex-info (format "%s symbols %s share the ratchet key %s"
                               linter (str/join ", " (sort-by str syms)) k)
                       {:linter linter, :key k, :symbols (vec syms)})))
     (set (keys by-key)))))

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
  "Throw one error naming every policy key in `ratchets` that is not a known linter. Names
  [[*ratchets-file*]] in the message, so call this with it bound to whichever file `ratchets` came from."
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

(defn configured-count-keys
  "[[discouraged-count-keys]] for each of the [[discouragement-linters]]."
  []
  (let [config (kondo-config)]
    (into {} (for [linter discouragement-linters]
               [linter (discouraged-count-keys linter config)]))))

(defn discouraged-in-ignore-counts
  "The [[discouragement-linters]] with a stale flat budget in `ignore-counts`, sorted."
  [ignore-counts]
  ;; Their ignores are budgeted per symbol, so a flat budget here is never read.
  (into (sorted-set-by #(compare (str %1) (str %2)))
        (filter discouragement-linters)
        (keys ignore-counts)))

(defn ignore-counts-occurrences
  "`occurrences` without the [[discouragement-linters]] in their `:linters`, which are budgeted per symbol
  rather than in `:ignore-counts`."
  [occurrences]
  (map #(update % :linters (partial remove discouragement-linters)) occurrences))

(defn unconfigured-budget-warnings
  "Warnings for budgets in `ratchets`, read from `ratchets-file`, whose symbol is no longer configured under
  its linter. `configured` is [[configured-count-keys]]."
  [ratchets-file ratchets configured]
  ;; Attribution never charges an unconfigured symbol, so fix! drops these at zero like any unused budget.
  (for [linter (sort discouragement-linters)
        :let   [budgeted (keys (get ratchets (discouraged-count-field linter)))
                unknown  (sort-by str (remove (configured linter) budgeted))]
        :when  (seq unknown)]
    (format (str "WARNING: %s budgets %s symbols no longer configured in %s: %s"
                 " -- `./bin/mage kondo-ratchets-shrink` drops them")
            ratchets-file linter kondo-config-file (str/join ", " unknown))))

(defn- validate-test-config-counts!
  "Throw unless `test-ratchets` has an empty :config-counts -- config-level suppressions are tracked only
  in `prod-file` (see [[config-suppressions]]), and [[fix!]] silently drops anything here otherwise.
  Call with [[*ratchets-file*]] bound to [[*test-ratchets-file*]], so the message names the right file."
  [test-ratchets prod-file]
  (when (seq (:config-counts test-ratchets))
    (throw (ex-info (format "%s must not set :config-counts -- config-level suppressions are tracked only in %s"
                            *ratchets-file* prod-file)
                    {:file *ratchets-file*}))))

(defn- read-validated-test-ratchets
  "[[read-ratchets]] for [[*test-ratchets-file*]], validated against `known` linters and for a nonempty
  :config-counts -- both skipped when the file is `{:disabled true}`. `prod-file` should be
  [[*ratchets-file*]]'s value from before the call, so errors name the right file."
  [known prod-file]
  (binding [*ratchets-file* *test-ratchets-file*]
    (let [test-ratchets (read-ratchets)]
      (when-not (disabled? test-ratchets)
        (validate-linters! test-ratchets known)
        (validate-test-config-counts! test-ratchets prod-file))
      test-ratchets)))

(defn validate-seed!
  "Throw when a linter in `seeded` is not known, so `--seed` never writes a policy the check rejects."
  [seeded known]
  (when-let [unknown (seq (remove known seeded))]
    (throw (ex-info (format "cannot seed %s: not a known linter -- %s"
                            (str/join ", " unknown)
                            (known-linter-hint))
                    {:unknown (vec unknown)}))))

(def source-roots
  "Directories, relative to the repo root, whose source files [[scan]] reads."
  ["src" "test" "enterprise" "modules/drivers" "dev" "bin" "mage"])

(def source-extensions
  "File extensions [[scan]] reads."
  [".clj" ".cljc" ".cljs"])

;; Concatenated so the scan does not count this definition as an ignore.
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
  (reduce (fn [cnt c] (cond-> cnt (= c \newline) inc)) 1 (subs content 0 i)))

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

(defn test-occurrence?
  "Does `occurrence` (as returned by [[scan]]) sit under a directory literally named `test`
  (`test/`, `enterprise/backend/test/`, `modules/drivers/*/test/`, ...)? Decides whether its budget
  belongs to [[*ratchets-file*]] or [[*test-ratchets-file*]]."
  [{:keys [file]}]
  (boolean (some #{"test"} (str/split file #"/"))))

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
  Entries that add discouragements or turn linters on count nothing — only weakening counts.

  Tracked only in [[*ratchets-file*]], not split per test/prod like :ignore-counts is: `config.edn`'s
  `test-namespaces`/`source-namespaces` groups separate cleanly, but others (e.g. `driver-namespaces`)
  cover both, so there's no reliable per-suppression attribution without restructuring `config.edn`.
  Doing that later would mean splitting those mixed groups apart, changing this function to track which
  group an entry came from instead of summing by linter name, and top-level `:linters`/`:config-in-comment`
  entries would still have no test/prod home -- real effort for a softer guarantee than :ignore-counts."
  ([]
   (config-suppressions (kondo-config)))
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

(defn count-drift
  "Differences between `recorded` and `actual`, treating missing values as zero, sorted by name."
  [recorded actual]
  (sorted-by-str
   (for [linter (into (set (keys actual)) (keys recorded))
         :let   [budget (get recorded linter 0)
                 n      (get actual linter 0)]
         :when  (not= budget n)]
     [linter {:recorded budget, :actual n}])))

(defn counts-over-budget
  "Names whose actual count exceeds their budget."
  [budgets counts]
  (sorted-by-str
   (for [[linter {:keys [recorded actual] :as entry}] (count-drift budgets counts)
         :when (> actual recorded)]
     [linter entry])))

(def ^:private shared-header
  (str ";; The :discouraged-var-counts and :discouraged-namespace-counts fields budget those linters' inline\n"
       ";; ignores per symbol, keyed by the symbol with `metabase.` dropped and `metabase-enterprise.` shortened\n"
       ";; to `ee.`.\n"
       ";; Each :ignore-counts value is a non-negative integer budget, or :unlimited for no ceiling; every other\n"
       ";; budget is a non-negative integer.\n"
       ";; Checks fail when a count exceeds its numeric budget; unused budget is allowed.\n"
       ";; Any ignore outside :comment-exempt needs an explanatory comment directly above or trailing on its line.\n"
       ";; `./bin/mage kondo-ratchets-shrink` lowers budgets unless `--seed` explicitly adds or raises one;\n"
       ";; a seed like `:discouraged-var/clojure.core/println` seeds one symbol, and `:discouraged-var` all of them.\n"
       ";; The workflow runs it on master, so feature branches do not need to record reductions.\n"
       ";; Raising or adding a budget (`--seed` for inline ignores, a manual edit otherwise) or widening the\n"
       ";; exemptions must be explained in the PR.\n"
       ";; :all is the vector-less ignore form, which suppresses every linter on the next form.\n"))

(def ^:private header
  (str ";; Budgets for kondo suppressions: inline `" ignore-marker "` forms per linter (:ignore-counts), and\n"
       ";; config-level waivers in .clj-kondo/config.edn (:config-counts -- :off switches and :exclude entries).\n"
       shared-header
       ";;\n"
       ";; Test code's inline ignores have their own budgets in .clj-kondo/ratchets-test.edn.\n"
       ";; :config-counts stays here either way -- config.edn's scoping doesn't cleanly split.\n"))

(def ^:private test-header
  (str ";; Budgets for kondo suppressions in test code: inline `" ignore-marker "` forms per linter\n"
       ";; (:ignore-counts). Production code has its own budgets in .clj-kondo/ratchets.edn, which also holds\n"
       ";; every config-level waiver (:config-counts) -- config.edn's scoping doesn't cleanly split.\n"
       shared-header))

(def ^:private module-header
  (str ";; Budgets for escape hatches in config.edn. Counts may fall but not exceed these values.\n"
       ";; Leave reductions to the post-merge shrink workflow; explain increases in the PR.\n"))

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

(defn- render-policies
  [header ratchets config-counts?]
  (let [fields (cond->> ratchet-field-order (not config-counts?) (remove #{:config-counts}))
        width  (apply max (map (comp count str) fields))
        exempt (:comment-exempt ratchets)]
    (str header
         "{"
         (str/join "\n "
                   (for [field fields
                         :let  [label  (format (str "%-" width "s ") field)
                                ;; past the line's leading `{` or space, the label, and the value's own bracket
                                indent (apply str (repeat (+ 2 (count label)) \space))]]
                     (str label
                          (cond
                            (not= field :comment-exempt) (render-counts (get ratchets field) indent)
                            (empty? exempt)              "#{}"
                            :else                        (str "#{"
                                                              (str/join (str "\n " indent) (sort-by str exempt))
                                                              "}")))))
         "}\n")))

(defn render
  "Canonical text for the prod ratchets file, [[*ratchets-file*]]."
  [ratchets]
  (render-policies header ratchets true))

(defn render-test
  "Canonical text for the test ratchets file, [[*test-ratchets-file*]], which has no :config-counts.
  Throws on a nonempty :config-counts rather than dropping it."
  [{:keys [config-counts] :as ratchets}]
  (when (seq config-counts)
    (throw (ex-info (str *test-ratchets-file* " must not set :config-counts -- config-level suppressions are"
                         " tracked only in " *ratchets-file*)
                    {:config-counts config-counts})))
  (render-policies test-header ratchets false))

(defn render-module-ratchets
  "Canonical module ratchet-file text."
  [ratchets]
  (str module-header (render-counts ratchets " ") "\n"))

(def ^:private absent
  "Stands in for a policy map entry that a stage doesn't have."
  ::absent)

(defn- stricter
  "The policy allowing fewer suppressions: a missing entry allows none, and any integer bound is stricter
  than `:unlimited`."
  [a b]
  (cond
    (or (= a absent) (= b absent)) absent
    (= a :unlimited)               b
    (= b :unlimited)               a
    :else                          (min a b)))

(defn- merge-counts
  "Three-way merge a policy map. A one-sided change wins over an unchanged base.
  Concurrent changes take the [[stricter]] policy, so budgets can only tighten through a merge."
  [base ours theirs]
  (sorted-by-str
   (for [linter (into (set (keys base)) (concat (keys ours) (keys theirs)))
         :let   [base-value   (get base linter absent)
                 ours-value   (get ours linter absent)
                 theirs-value (get theirs linter absent)
                 merged       (cond
                                (= ours-value theirs-value) ours-value
                                (= ours-value base-value)   theirs-value
                                (= theirs-value base-value) ours-value
                                :else                       (stricter ours-value theirs-value))]
         :when  (not= merged absent)]
     [linter merged])))

(defn- merge-exemptions
  "Three-way merge the `:comment-exempt` set: the side that changed a linter's membership wins.
  Independent of the count policies, since a justification exemption says nothing about how many ignores
  a linter may have."
  [base ours theirs]
  (into #{}
        (filter (fn [linter]
                  (let [ours?   (contains? ours linter)
                        theirs? (contains? theirs linter)]
                    (if (= ours? theirs?)
                      ours?
                      (not (contains? base linter))))))
        (into (set base) (concat ours theirs))))

(def ^:private merge-fields
  (set ratchet-field-order))

(def ^:private merge-count-fields
  (disj merge-fields :comment-exempt))

(defn- validate-merge-shape
  "`ratchets` when it contains only the policy fields and `:disabled`, and each policy field passes
  [[validate-policies]]; throws otherwise."
  [ratchets]
  (when-not (map? ratchets)
    (throw (ex-info (str "a ratchet stage must be a map of policies, not " (pr-str ratchets))
                    {:stage ratchets})))
  (let [unexpected (set (keys (apply dissoc ratchets :disabled merge-fields)))]
    (when (seq unexpected)
      (throw (ex-info (str "unsupported ratchet fields: " (pr-str unexpected))
                      {:fields unexpected}))))
  (validate-policies ratchets))

(defn merge-ratchets
  "Three-way merge `base`, `ours`, and `theirs`, validating every stage first.
  A disabled target stays disabled; a disabled incoming stage leaves `ours` unchanged. Otherwise merge
  every count field ([[merge-count-fields]]) with [[merge-counts]] and exemptions with [[merge-exemptions]]."
  [base ours theirs]
  (let [[base ours theirs] (map validate-merge-shape [base ours theirs])]
    (cond
      (disabled? ours)   {:disabled true}
      (disabled? theirs) ours
      :else              (into {:comment-exempt (merge-exemptions (:comment-exempt base #{})
                                                                  (:comment-exempt ours #{})
                                                                  (:comment-exempt theirs #{}))}
                               (map (fn [field]
                                      [field (merge-counts (get base field {})
                                                           (get ours field {})
                                                           (get theirs field {}))]))
                               merge-count-fields))))

(defn merge-module-ratchets
  "Three-way merge module budgets, validating every stage first."
  [base ours theirs]
  (apply merge-counts (map validate-module-ratchets [base ours theirs])))

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
  "Warning for [[unexercised-unlimited]] linters, or nil. Does not remove their policies."
  [ignore-counts actual]
  (let [linters (unexercised-unlimited ignore-counts actual)]
    (when (seq linters)
      (str "WARNING: :unlimited policies with no ignores left: " (str/join ", " linters)
           " -- delete an entry by hand once its linter no longer needs one"))))

(defn stale-exemptions-warning
  "Warning for stale `:comment-exempt` entries, or nil. Does not remove them."
  [exempt occurrences]
  (let [linters (stale-exemptions exempt occurrences)]
    (when (seq linters)
      (str "WARNING: :comment-exempt is no longer needed for these linters: " (str/join ", " linters)
           " -- delete the stale entries by hand"))))

(defn unattributed-lines
  "Warning lines for `unattributed` ignores (from `:attribute` -- see [[check]]/[[fix!]]): an ignore naming a
  [[discouragement-linters]] linter with no such finding under it: stale, or in code kondo never lints
  (a custom reader conditional like `:cljs-dev`)."
  [unattributed]
  (for [{:keys [file line linters]} unattributed]
    (format (str "WARNING: %s:%d ignores %s but kondo reports no such finding under it -- probably stale, under a"
                 " nested ignore for the same linter, or in a reader branch kondo skips")
            file line (str/join ", " linters))))

(defn unresolved-lines
  "Lines for `unresolved` findings (from `:attribute`): a [[discouragement-linters]] finding an ignore
  suppresses that can't be resolved to a configured symbol, so no per-symbol budget covers it."
  [unresolved]
  (for [{:keys [file line linters]} unresolved]
    (format "  %s:%d: %s finding not resolved to a configured symbol" file line (str/join ", " linters))))

(def ^:private unresolved-header
  (str "ignored discouraged-var/namespace findings with no per-symbol budget -- they can't be budgeted,"
       " so remove the ignore or the usage:"))

(defn- seed-lines
  "[[fix!]]'s report lines for `seeded` keys in one count field: seeded at its actual count, or a warning
  when there's nothing to seed."
  [recorded actual seeded]
  (for [name seeded
        :let [n (get actual name 0)]]
    (cond
      (pos? n)                  (format "seeded %s at %d" name n)
      (contains? recorded name) (format "WARNING: %s has no inline ignores -- dropping its policy" name)
      :else                     (format "WARNING: %s has no inline ignores -- nothing to seed" name))))

(defn- budget-lines
  "[[fix!]]'s report lines for bounded (non-`:unlimited`), non-seeded entries in one count field: dropped
  at zero, lowered to actual, or over budget (suggesting `--seed` on the name `seed-hint` returns for it)."
  [recorded actual seeded seed-hint]
  (for [[name budget] (sort-by (comp str first) (apply dissoc recorded seeded))
        :let          [n (get actual name 0)]
        ;; a hand-written 0 with no ignores is dropped too, so it needs a line
        :when         (and (integer? budget) (or (not= n budget) (zero? budget)))]
    (cond
      (zero? n)    (format "dropped %s (no ignores left)" name)
      (< n budget) (format "lowered %s %d -> %d" name budget n)
      :else        (format "WARNING: %s is over budget (%d recorded, %d actual) -- remove ignores, or accept them all with `--seed %s`"
                           name budget n (seed-hint name)))))

(defn- missing-budget-lines
  "[[fix!]]'s report lines for entries with ignores but no budget at all, suggesting `--seed` on the name
  `seed-hint` returns for it."
  [recorded actual seeded seed-hint]
  (for [[name n] (sort-by (comp str first) (apply dissoc actual (concat seeded (keys recorded))))]
    (format "WARNING: %s has %d ignores but no budget entry -- seed one with `./bin/mage kondo-ratchets-shrink --seed %s`"
            name n (seed-hint name))))

(defn discouraged-seed-name
  "The `--seed` argument for one per-symbol budget: `linter` and the ratchet key, e.g.
  `:discouraged-var/clojure.core/println`."
  [linter k]
  (str linter "/" (subs (str k) 1)))

(defn- ignore-change-report
  "Change-report lines for one ratchets file's inline-ignore budgets, scoped to `occurrences`: seeding,
  lowered/dropped/over-budget counts, unused `:unlimited` policies, and ignores with no budget entry, for
  `:ignore-counts` and each [[discouraged-count-field]], then stale discouraged-var and discouraged-namespace
  ignores. `seeds` and `attribution` are as [[fix!]] gets them from [[resolve-seed]] and `:attribute`.
  Its :comment-exempt is reported separately, via [[stale-exemptions-warning]].
  Shared by [[change-report]] (the prod ratchets file) and [[fix!]]'s pass over the test ratchets file."
  [{:keys [ignore-counts], :as ratchets} occurrences {:keys [unattributed], :as attribution} seeds]
  (let [ignore-counts (apply dissoc ignore-counts discouragement-linters)
        actual        (actual-counts (ignore-counts-occurrences occurrences))
        seeded        (get seeds :ignore-counts [])]
    (concat
     (seed-lines ignore-counts actual seeded)
     (budget-lines ignore-counts actual seeded identity)
     (some-> (unexercised-unlimited-warning (apply dissoc ignore-counts seeded) actual) vector)
     (missing-budget-lines ignore-counts actual seeded identity)
     (mapcat (fn [linter]
               (let [field     (discouraged-count-field linter)
                     recorded  (get ratchets field)
                     actual    (get-in attribution [:actual linter] {})
                     seeded    (get seeds field [])
                     seed-hint (partial discouraged-seed-name linter)
                     ;; a bulk seed names every configured symbol, so only those it changes are worth a line
                     reported  (cond->> seeded
                                 (contains? (:bulk seeds) field)
                                 (filter #(or (contains? actual %) (contains? recorded %))))]
                 (concat (seed-lines recorded actual reported)
                         (budget-lines recorded actual seeded seed-hint)
                         (missing-budget-lines recorded actual seeded seed-hint))))
             (sort discouragement-linters))
     (unattributed-lines unattributed))))

(defn change-report
  "The lines [[fix!]] prints for the prod ratchets file: [[ignore-change-report]], then config and module
  budget changes and stale comment exemptions."
  [{:keys [config-counts comment-exempt], :as ratchets} module-ratchets occurrences attribution
   config-actual module-actual seeds]
  (concat
   (ignore-change-report ratchets occurrences attribution seeds)
   (for [[linter {:keys [recorded actual]}] (count-drift config-counts config-actual)]
     (cond
       (zero? actual)       (format "dropped config %s (no suppressions left)" linter)
       (< actual recorded)  (format "lowered config %s %d -> %d" linter recorded actual)
       :else                (format "WARNING: config suppressions for %s are over budget (%d recorded, %d actual) -- remove one from .clj-kondo/config.edn or raise the budget by hand"
                                    linter recorded actual)))
   (for [[metric {:keys [recorded actual]}] (count-drift module-ratchets module-actual)]
     (cond
       (zero? actual)      (format "dropped module %s (no escape hatches left)" metric)
       (< actual recorded) (format "lowered module %s %d -> %d" metric recorded actual)
       :else               (format (str "WARNING: module %s is over budget (%d recorded, %d actual)"
                                        " -- remove one from " module-config-file " or raise the budget by hand")
                                   metric recorded actual)))
   (some-> (stale-exemptions-warning comment-exempt occurrences) vector)))

(def ^:private policy-count-fields
  "The count fields both the prod and the test ratchets file carry."
  (into [:ignore-counts] (sort discouraged-count-fields)))

(defn- test-field
  "The name [[shrink-summary]] gives a test ratchets file's `field`."
  [field]
  (keyword (str "test-" (name field))))

(def ^:private count-fields
  (concat policy-count-fields [:config-counts :module-counts] (map test-field policy-count-fields)))

(defn- display-name
  [field linter]
  (let [k (subs (str linter) 1)]
    (case field
      :discouraged-var-counts            (str ":discouraged-var/" k)
      :discouraged-namespace-counts      (str ":discouraged-namespace/" k)
      :config-counts                     (str ":config/" k)
      :module-counts                     (str ":module/" k)
      :test-ignore-counts                (str ":test/" k)
      :test-discouraged-var-counts       (str ":test/discouraged-var/" k)
      :test-discouraged-namespace-counts (str ":test/discouraged-namespace/" k)
      (str linter))))

(defn- shrink-changes
  [before after]
  (->> count-fields
       (into []
             (comp
              (mapcat (fn [field]
                        (map (fn [[linter n]] [field linter n])
                             (get before field))))
              (keep (fn [[field linter before-count]]
                      (let [after-count (get-in after [field linter] 0)]
                        (when (and (integer? before-count)
                                   (integer? after-count)
                                   (< after-count before-count))
                          {:name (display-name field linter)
                           :from before-count
                           :to   after-count}))))))
       (sort-by :name)))

(defn shrink-summary
  "A compact, sorted before/after listing of numeric budgets lowered between two ratchet maps.
  Config and module budgets carry `:config/` and `:module/` prefixes."
  [before after]
  (let [changes (shrink-changes before after)]
    (if (empty? changes)
      "{}"
      (let [column-width                 (fn [k]
                                           (transduce (map (comp count str k)) max 0 changes))
            [name-width from-width to-width] (mapv column-width [:name :from :to])]
        (str "{"
             (str/join "\n "
                       (for [{:keys [name from to]} changes]
                         (format (str "%-" name-width "s  %" from-width "d => %" to-width "d")
                                 name from to)))
             "}")))))

(def ^:private pie-legends
  [["# still our problem" ". fixed, so no longer our problem"]
   ["# stubborn lint" ". lint successfully rolled"]
   ["# TODO" ". TODONE"]])

(def ^:private pie-chart-resource
  "dev/kondo_ratchet_pie.txt")

(defn- pie-chart
  []
  (let [template (some-> pie-chart-resource io/resource slurp)
        legend   (rand-nth pie-legends)]
    (when-not template
      (throw (ex-info (str "missing classpath resource " pie-chart-resource)
                      {:resource pie-chart-resource})))
    (apply format template legend)))

(defn shrink-pr-body
  "Markdown for an automated shrink PR."
  [before after workflow-url]
  (str "## Debt repaid, locking in progress\n\n"
       "### What changed\n\n"
       "```edn\n" (shrink-summary before after) "\n```\n\n"
       "### Executive dashboard\n\n"
       "```text\n" (pie-chart) "```\n\n"
       "Generated by [`./bin/mage kondo-ratchets-shrink`](" workflow-url
       ")\n"))

(defn- read-ratchet-snapshots
  "The budgets in a prod, module, and test ratchet file triple, combined into the shape
  [[shrink-summary]] compares."
  [ratchets-path module-ratchets-path test-ratchets-path]
  (let [read-ratchets* #(binding [*ratchets-file* %] (read-ratchets))
        test-ratchets  (read-ratchets* test-ratchets-path)]
    (into (assoc (read-ratchets* ratchets-path)
                 :module-counts (binding [*module-ratchets-file* module-ratchets-path]
                                  (read-module-ratchets)))
          (for [field policy-count-fields]
            [(test-field field) (get test-ratchets field)]))))

(defn shrink-pr-body-from-files
  "[[shrink-pr-body]] for ratchet files on disk, before and after shrinking."
  [{:keys [before after modules-before modules-after test-before test-after]} workflow-url]
  (shrink-pr-body (read-ratchet-snapshots before modules-before test-before)
                  (read-ratchet-snapshots after modules-after test-after)
                  workflow-url))

(defn- resolve-seed
  "The budgets `seed` (a linter keyword or its `:foo` string form) sets, as a map of count field to keys:
  - `:discouraged-var/<symbol>` (likewise `:discouraged-namespace/<symbol>`) seeds that symbol's budget, named
    by the configured symbol (`clojure.core/println`) or its ratchet key (`search.core/search`)
  - a bare `:discouraged-var` seeds every symbol configured under it, and names its field under `:bulk`
  - any other linter seeds its own `:ignore-counts` budget
  Returns `{}` when `seed` is nil. Throws on a symbol not configured under its linter."
  [seed]
  (if-not seed
    {}
    (let [seed              (str/replace-first seed #"^:" "")
          [linter-name sym] (str/split seed #"/" 2)
          linter            (keyword linter-name)]
      (if-not (contains? discouragement-linters linter)
        {:ignore-counts [(keyword seed)]}
        (let [known (discouraged-count-keys linter)
              k     (some-> sym symbol discouraged-count-key)]
          ;; an empty suffix (`:discouraged-var/`) is a typo, not a request to seed every symbol
          (when (and sym (not (contains? known k)))
            (throw (ex-info (format "%s is not a symbol configured under %s in %s"
                                    (pr-str sym) linter kondo-config-file)
                            {:linter linter, :symbol sym})))
          (if k
            {(discouraged-count-field linter) [k]}
            {(discouraged-count-field linter) (vec (sort-by str known))
             :bulk                            #{(discouraged-count-field linter)}}))))))

(defn- no-attribution
  "The default `:attribute` for [[check]] and [[fix!]], for a tree with no [[discouragement-linters]] ignores.
  Throws when there are some."
  [groups]
  ;; Without a kondo run every per-symbol count would read as zero, and fix! would drop those budgets.
  (when (some #(some discouragement-linters (:linters %)) (apply concat groups))
    (throw (ex-info (str "attributing :discouraged-var/:discouraged-namespace ignores needs a kondo run;"
                         " pass `:attribute mage.kondo-ratchet/attribute-occurrences!`")
                    {})))
  (vec (repeat (count groups) {:actual {}, :unattributed [], :unresolved []})))

(defn- lowered-policies
  "The inline-ignore budgets of `ratchets`, one ratchets file's policies, lowered to the counts in
  `occurrences` and `attribution`, with `seeds` applied (see [[fix!]])."
  [{:keys [ignore-counts comment-exempt], :as ratchets} occurrences attribution seeds]
  (into {:ignore-counts  (lowered-counts (apply dissoc ignore-counts discouragement-linters)
                                         (actual-counts occurrences)
                                         (get seeds :ignore-counts []))
         :comment-exempt comment-exempt}
        (for [linter discouragement-linters
              :let   [field (discouraged-count-field linter)]]
          [field (lowered-counts (get ratchets field)
                                 (get-in attribution [:actual linter] {})
                                 (get seeds field []))])))

(defn- read-policies
  "Validate `ratchets`, the prod policies, against the known linters, and read the module and test ratchet files.
  Returns `{:known _, :configured _, :module-ratchets _, :test-ratchets _, :test-disabled? _}`, with `:configured`
  from [[configured-count-keys]].
  Throws when two configured symbols share a ratchet key."
  [ratchets]
  (let [known (known-linters)]
    (validate-linters! ratchets known)
    (let [test-ratchets (read-validated-test-ratchets known *ratchets-file*)]
      {:known           known
       :configured      (configured-count-keys)
       :module-ratchets (read-module-ratchets)
       :test-ratchets   test-ratchets
       :test-disabled?  (disabled? test-ratchets)})))

(defn- scan-and-attribute
  "The tree's ignores, split into prod and test, and what `attribute` makes of each.
  Test ignores go unattributed when `test-disabled?`.
  Returns `{:prod-occ _, :test-occ _, :attribution _, :test-attribution _}`."
  [attribute test-disabled?]
  (let [{test-occ true, prod-occ false} (group-by test-occurrence? (scan))
        [attribution test-attribution]  (attribute [prod-occ (if test-disabled? [] test-occ)])]
    {:prod-occ         prod-occ
     :test-occ         test-occ
     :attribution      attribution
     :test-attribution test-attribution}))

(defn fix!
  "Lower budgets and normalize the prod, test, and module ratchet files.
  Refuses to touch a file containing an unknown linter or to seed one, rather than silently dropping it.
  `--seed LINTER` (`{:seed \"...\"}` here) sets that budget to the actual count and bounds an unlimited
  one, independently in whichever file(s) actually have occurrences for it; see [[resolve-seed]] for
  seeding [[discouragement-linters]] budgets.
  `:attribute` (default [[no-attribution]]) takes a seq of occurrence seqs from [[scan]] and returns, for each
  in order, the per-symbol counts of the [[discouragement-linters]] ignores among them,
  `{:actual {linter {key count}}, :unattributed _, :unresolved _}`.
  Throws before writing when any `:unresolved` finding has no symbol to budget it under.
  Prints a [[change-report]] per file, or `unchanged` on a no-op.
  Does nothing, including seeding, when [[*ratchets-file*]] sets `:disabled` to `true`; the test ratchets
  file honors its own `:disabled` independently, skipping only its own pass."
  ([]
   (fix! nil))
  ([{:keys [seed attribute], :or {attribute no-attribution}}]
   ;; Attribution is passed in because it needs a kondo run through mage, which isn't on the JVM classpath.
   (let [{:keys [config-counts] :as ratchets} (read-ratchets)]
     (if (disabled? ratchets)
       (println (str *ratchets-file* " is disabled -- nothing to do"))
       (let [{:keys [known module-ratchets test-ratchets test-disabled?]} (read-policies ratchets)
             ;; Seeds are checked before the scan, so a bad --seed fails without waiting on kondo.
             seeds            (resolve-seed seed)
             _                (validate-seed! (:ignore-counts seeds) known)
             {:keys [prod-occ test-occ attribution test-attribution]} (scan-and-attribute attribute test-disabled?)
             unresolved       (concat (:unresolved attribution) (:unresolved test-attribution))
             _                (when (seq unresolved)
                                (throw (ex-info (str/join "\n" (cons unresolved-header (unresolved-lines unresolved)))
                                                {:unresolved unresolved})))
             config-actual    (config-suppressions)
             module-actual    (module-escape-hatches)
             outputs          (cond-> [[*ratchets-file*
                                        (render (assoc (lowered-policies ratchets prod-occ attribution seeds)
                                                       :config-counts (lowered-counts config-counts config-actual [])))]
                                       [*module-ratchets-file*
                                        (render-module-ratchets
                                         (lowered-counts module-ratchets module-actual []))]]
                                (not test-disabled?)
                                (conj [*test-ratchets-file*
                                       (render-test (lowered-policies test-ratchets test-occ test-attribution seeds))]))
             changed          (filterv (fn [[path text]] (not= (slurp path) text)) outputs)]
         (doseq [[path policies] (cond-> [[*ratchets-file* ratchets]]
                                   (not test-disabled?) (conj [*test-ratchets-file* test-ratchets]))
                 linter          (discouraged-in-ignore-counts (:ignore-counts policies))]
           (println (format "dropped stale :ignore-counts entry for %s in %s (tracked per-symbol in %s now)"
                            linter path (discouraged-count-field linter))))
         (run! println (change-report ratchets module-ratchets prod-occ attribution config-actual module-actual seeds))
         (when-not test-disabled?
           (run! println (concat (ignore-change-report test-ratchets test-occ test-attribution seeds)
                                 (some-> (stale-exemptions-warning (:comment-exempt test-ratchets) test-occ)
                                         vector))))
         (if (empty? changed)
           (println "unchanged")
           (doseq [[path text] changed]
             (spit path text)
             (println (str "wrote " path)))))))))

(defn- budget-line
  [[k {:keys [recorded actual]}]]
  (format "  %s: %d recorded, %d actual" k recorded actual))

(defn- ignore-check-lines
  "Budget, justification, and formatting diagnostics for one ratchets file's inline-ignore budgets and
  :comment-exempt, scoped to `occurrences`, plus the unresolved discouraged-var and discouraged-namespace
  findings among them. `attribution` is the `:attribute` result for `occurrences` (see [[fix!]]).
  `ratchets-file` names the file in the not-normalized message, and `render-fn` gives its canonical text.
  Shared by [[check-report]] (the prod ratchets file) and [[check]]'s pass over the test ratchets file."
  [ratchets-file render-fn {:keys [ignore-counts comment-exempt] :or {comment-exempt #{}} :as ratchets}
   occurrences {:keys [unresolved], :as attribution} ratchets-text]
  (let [over        (over-budget ignore-counts (ignore-counts-occurrences occurrences))
        stale-flat  (discouraged-in-ignore-counts ignore-counts)
        uncommented (unjustified comment-exempt occurrences)]
    (concat
     (when (seq stale-flat)
       [(str ":ignore-counts still has a flat budget for " (str/join ", " stale-flat)
             " -- each now has its own field (" (str/join ", " (map discouraged-count-field stale-flat))
             "); run `./bin/mage kondo-ratchets-shrink` to drop the stale entry")])
     (when (seq over)
       (cons (str "over budget -- remove an ignore, or seed the budget with"
                  " `./bin/mage kondo-ratchets-shrink --seed <linter>` and explain the increase in the PR:")
             (mapcat (fn [[_ {:keys [examples]} :as entry]]
                       (cons (budget-line entry) (map #(str "    " %) examples)))
                     over)))
     (mapcat (fn [linter]
               (when-let [over (seq (counts-over-budget (get ratchets (discouraged-count-field linter))
                                                        (get-in attribution [:actual linter] {})))]
                 (cons (str (name linter) " symbols over budget -- remove an ignore, or seed the symbol's budget"
                            " with `./bin/mage kondo-ratchets-shrink --seed <name below>` and explain the"
                            " increase in the PR:")
                       (map (fn [[k v]] (budget-line [(discouraged-seed-name linter k) v])) over))))
             (sort discouragement-linters))
     (when (seq unresolved)
       (cons unresolved-header (unresolved-lines unresolved)))
     (when (seq uncommented)
       (cons (str "ignores without required comments -- add a `;;` comment above the form or at the end"
                  " of the same line, explaining why the suppression is necessary:")
             (map (fn [{:keys [file line linters]}]
                    (format "  %s:%d %s" file line (vec linters)))
                  uncommented)))
     (when (not= ratchets-text (render-fn ratchets))
       [(str ratchets-file " is not normalized -- run `./bin/mage kondo-ratchets-shrink`"
             " to fix the formatting")]))))

(defn check-report
  "Diagnostics for budget violations, unjustified ignores, unresolved discouraged-var and
  discouraged-namespace findings, and noncanonical ratchet text.
  Lower counts are valid; post-merge automation records them.
  `attribution` is the `:attribute` result for `occurrences` (see [[fix!]])."
  [{:keys [config-counts] :as ratchets}
   module-ratchets occurrences attribution config-actual module-actual ratchets-text module-ratchets-text]
  (let [config-over (counts-over-budget config-counts config-actual)
        module-over (counts-over-budget module-ratchets module-actual)]
    (concat
     (ignore-check-lines *ratchets-file* render ratchets occurrences attribution ratchets-text)
     (when (seq config-over)
       (cons (str "config suppressions over budget -- remove the entry from " kondo-config-file
                  ", or raise the budget manually and explain the increase in the PR:")
             (map budget-line config-over)))
     (when (seq module-over)
       (cons (str "module escape hatches over budget -- remove one from " module-config-file
                  ", or raise the budget manually and explain the increase in the PR:")
             (map budget-line module-over)))
     (when (not= module-ratchets-text (render-module-ratchets module-ratchets))
       [(str *module-ratchets-file* " is not normalized -- run `./bin/mage kondo-ratchets-shrink`"
             " to fix the formatting")]))))

(defn- policy-count
  "How many inline-ignore budgets `ratchets` holds, flat and per symbol."
  [ratchets]
  (transduce (map #(count (get ratchets %))) + policy-count-fields))

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
  "Validate the prod, test, and module ratchet files and current counts. Fail on missing or malformed
  configuration, unknown linters, budget violations, unjustified ignores, or discouraged-var and
  discouraged-namespace findings with no symbol to budget them under. Report stale unlimited policies,
  exemptions, discouraged-var and discouraged-namespace ignores, and budgets for symbols no longer configured,
  without failing.
  `{:disabled true}` in [[*ratchets-file*]] disables checking entirely; the test ratchets file honors its
  own `:disabled` independently, skipping only its own checks.
  `:attribute` is as for [[fix!]]."
  ([]
   (check nil))
  ([{:keys [attribute], :or {attribute no-attribution}}]
   ;; Turn validation errors into concise Mage output instead of a Babashka stack trace.
   (try
     (let [ratchets (read-ratchets)]
       (if (disabled? ratchets)
         (println (str *ratchets-file* " is disabled -- nothing to check"))
         (let [{:keys [configured module-ratchets test-ratchets test-disabled?]} (read-policies ratchets)
               {:keys [prod-occ test-occ attribution test-attribution]} (scan-and-attribute attribute test-disabled?)
               lines            (concat
                                 (check-report ratchets module-ratchets prod-occ attribution
                                               (config-suppressions) (module-escape-hatches)
                                               (slurp *ratchets-file*) (slurp *module-ratchets-file*))
                                 (when-not test-disabled?
                                   (ignore-check-lines *test-ratchets-file* render-test test-ratchets test-occ
                                                       test-attribution (slurp *test-ratchets-file*))))]
           (some-> (unexercised-unlimited-warning (:ignore-counts ratchets) (actual-counts prod-occ)) println)
           (some-> (stale-exemptions-warning (:comment-exempt ratchets) prod-occ) println)
           (run! println (unattributed-lines (:unattributed attribution)))
           (run! println (unconfigured-budget-warnings *ratchets-file* ratchets configured))
           (when-not test-disabled?
             (some-> (unexercised-unlimited-warning (:ignore-counts test-ratchets) (actual-counts test-occ)) println)
             (some-> (stale-exemptions-warning (:comment-exempt test-ratchets) test-occ) println)
             (run! println (unattributed-lines (:unattributed test-attribution)))
             (run! println (unconfigured-budget-warnings *test-ratchets-file* test-ratchets configured)))
           (if (empty? lines)
             (do
               (println (format "ok -- %d ignore forms within %d policies"
                                (count prod-occ) (policy-count ratchets)))
               (when-not test-disabled?
                 (println (format "ok -- %d test ignore forms within %d test policies"
                                  (count test-occ) (policy-count test-ratchets)))))
             (do (run! println lines)
                 (exit! "ratchet files drifted from the source tree"))))))
     (catch clojure.lang.ExceptionInfo e
       (if (:babashka/exit (ex-data e))
         (throw e)
         (fail! (ex-message e)))))))
