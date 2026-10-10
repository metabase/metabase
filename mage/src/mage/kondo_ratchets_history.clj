(ns mage.kondo-ratchets-history
  "Attribute each change to a ratchet budget to the commits, pull requests and authors behind it.

  A budget changes in one of these ways:

  - shrink: the budget fell. The credit belongs to the earlier commits that removed the suppressions, not to the
    commit that lowered the number, which is usually the post-merge automation.
  - grow: the budget of a linter that already existed rose. A first budget counts, even when the commit adds the
    whole ratchet.
  - introduce: a linter got its first budget in the commit that added the linter.
  - pardon: a raise that says nothing about the commit that made it; see [[verdict]].

  A budget can also move into or out of `:unlimited`.

  A measure is one budgeted count, `[side kind name]`: `[:prod :ignore :deprecated-var]`,
  `[:test :ignore :deprecated-var]`, `[:prod :config :deprecated-var]` or `[:modules :module :ns-prefixes]`.
  The per-symbol budgets of a discouragement linter add up to one measure, because a commit's diff shows how many
  `:discouraged-var` ignores it removed but not which symbols they covered.

  To explain a shrink, walk back from the commit that lowered the budget.
  Every commit on the way contributes its change in the actual count less its own change to the budget.
  The walk ends when the contributions add up to the shrink, or at the previous commit that only lowered budgets:
  the post-merge automation, which leaves no slack behind it. Whatever is left then is the doing of
  the commit that lowered the budget, for example by changing what the budget counts. When that commit is the
  automation itself, the rest is reported as unaccounted.

  Only the first-parent history of `HEAD` is read. The analysis of each commit that changed a ratchet file is
  cached under its sha in [[cache-dir]]."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [babashka.process :as p]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [dev.kondo-ratchet :as ratchet]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private ratchet-files
  {:prod    ratchet/*ratchets-file*
   :test    ratchet/*test-ratchets-file*
   :modules ratchet/*module-ratchets-file*})

(def ^:private kondo-config-file ".clj-kondo/config.edn")

(def ^:private module-config-file ".clj-kondo/config/modules/config.edn")

(def ^:private cache-dir
  "Bump the last segment when the shape or meaning of a cached record changes."
  (fs/path (fs/home) ".cache" "mage" "kondo-ratchets-history" "v3"))

(def ^:private unattributed "(unattributed)")

;;; ------------------------------------------------- Budgets --------------------------------------------------

(defn- add-budgets [a b]
  (if (or (= :unlimited a) (= :unlimited b))
    :unlimited
    (+ a b)))

(defn- kondo-measures [side policies]
  (apply merge-with add-budgets
         (update-keys (:ignore-counts policies {}) #(vector side :ignore %))
         (update-keys (:config-counts policies {}) #(vector side :config %))
         (for [linter ratchet/discouragement-linters
               :let   [budgets (get policies (ratchet/discouraged-count-field linter))]
               :when  (seq budgets)]
           {[side :ignore linter] (reduce + (vals budgets))})))

(defn measures
  "Budget per measure for `files`, the parsed ratchet files keyed by `:prod`, `:test` and `:modules`."
  [{:keys [prod test modules]}]
  (merge (kondo-measures :prod prod)
         (kondo-measures :test test)
         (update-keys (or modules {}) #(vector :modules :module %))))

(defn symbol-budgets
  "Budget per discouraged symbol for `files`, keyed by `[side linter symbol-key]`."
  [files]
  (into {}
        (for [side    [:prod :test]
              linter  ratchet/discouragement-linters
              [sym n] (get-in files [side (ratchet/discouraged-count-field linter)])]
          [[side linter sym] n])))

(defn- merge-sides
  "Fold the `:test` entries of `by-measure` into `:prod`: the view from before test code had its own budgets."
  [by-measure]
  (reduce-kv (fn [acc k v]
               (update acc (assoc k 0 (if (= :test (first k)) :prod (first k))) (fnil add-budgets 0) v))
             {}
             by-measure))

(defn budget-view
  "The budgets on each side of a commit, from the parsed ratchet files `before` and `after` it.
  The commit that adds or removes the test file is viewed with both sides merged, so that moving a budget from
  one file to the other is not a change."
  [before after]
  (let [merged? (not= (some? (:test before)) (some? (:test after)))
        view    (if merged? merge-sides identity)]
    {:merged?        merged?
     :before         (view (measures before))
     :after          (view (measures after))
     :symbols-before (view (symbol-budgets before))
     :symbols-after  (view (symbol-budgets after))}))

(defn budget-changes
  "Classify what a commit did to each budget in `view` ([[budget-view]]), as maps of `:measure`, `:kind`, `:old`
  and `:new`, with a `:delta` for a `:shrink` or `:grow`, and a `:key` for a newly discouraged symbol.
  `new-linter?` and `new-symbol?` say whether the commit also added the linter, or the symbol under `linter`."
  [{:keys [before after symbols-before symbols-after]} {:keys [new-linter? new-symbol?]}]
  (let [symbols   (for [[[side linter sym :as k] n] (sort-by (comp str key) symbols-after)
                        :when (and (not (contains? symbols-before k))
                                   (new-symbol? linter sym))]
                    {:measure [side :ignore linter], :kind :introduce, :key sym, :new n})
        seeded    (reduce (fn [acc {:keys [measure new]}] (update acc measure (fnil + 0) new)) {} symbols)]
    (concat
     symbols
     (for [measure (sort-by str (set (concat (keys before) (keys after))))
           :let    [seed   (get seeded measure 0)
                    ;; the budget of a newly discouraged symbol is an introduction, not growth of its linter
                    old    (cond-> (get before measure) (pos? seed) (or 0))
                    new    (get after measure)
                    new    (cond-> new (and (pos? seed) (number? new)) (- seed))
                    change {:measure measure, :old old, :new new}]
           :when   (not= old new)]
       (cond
         (and (nil? old) (new-linter? (peek measure)))
         (assoc change :kind :introduce)

         (= :unlimited old) (assoc change :kind :limit)
         (= :unlimited new) (assoc change :kind :unlimit)
         :else              (let [delta (- (or new 0) (or old 0))]
                              (assoc change :kind (if (neg? delta) :shrink :grow) :delta delta)))))))

(defn- subtract
  "`new` less `old`, per key, without the zeros."
  [new old]
  (into {} (remove (comp zero? val)) (merge-with + new (update-vals old -))))

(defn- budget-delta
  "How far a commit moved each numeric budget it did not add, from its `view`.
  A move into or out of `:unlimited` is no number."
  [{:keys [before after]}]
  (into {}
        (for [measure (keys before)
              :let    [old (get before measure)
                       new (get after measure 0)]
              :when   (and (number? old) (number? new) (not= old new))]
          [measure (- new old)])))

;;; ------------------------------------------------ Attribution -----------------------------------------------

(defn attribute
  "Explain `shrunk`, a map from measure to its (negative) budget change, by `contributions`: `[commit deltas]`
  pairs, newest first, where `deltas` maps a measure to what that commit added to its slack-free count.
  Returns `:causes`, a map from measure to the commits (each with its `:delta`) that explain it, and `:open`, the
  part of each shrink that no commit explains. A measure stops collecting causes once it is fully explained."
  [shrunk contributions]
  (reduce (fn [acc [commit deltas]]
            (if (empty? (:open acc))
              (reduced acc)
              (reduce-kv (fn [acc measure delta]
                           (if-let [open (get-in acc [:open measure])]
                             (-> acc
                                 (update-in [:causes measure] (fnil conj []) (assoc commit :delta delta))
                                 (update :open (if (= open delta)
                                                 #(dissoc % measure)
                                                 #(assoc % measure (- open delta)))))
                             acc))
                         acc
                         deltas)))
          {:open shrunk, :causes {}}
          contributions))

;;; ---------------------------------------------------- Git ---------------------------------------------------

(defn- git [& args]
  (apply shell/sh {:quiet? true} "git" args))

(defn- git-ok? [& args]
  (zero? (:exit (apply shell/sh* {:quiet? true} "git" args))))

(defn- file-at [rev path]
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "git" "show" (str rev ":" path))]
    (when (zero? exit)
      (str/join "\n" out))))

(def ^:private budgets-at
  (memoize (fn [rev]
             (update-vals ratchet-files #(some-> (file-at rev %) edn/read-string)))))

;; %aN and %aE follow the repo's .mailmap, when it has one
(def ^:private log-format "--format=%x01%H%x1f%aN%x1f%aE%x1f%cI%x1f%s")

(defn- pr-number [subject]
  (some-> (re-find #"\(#(\d+)\)\s*$" (or subject "")) second parse-long))

(defn- parse-log
  "Commits from `git log --raw` output in [[log-format]], each with the `:files` it changed."
  [lines]
  (reduce (fn [commits line]
            (cond
              (str/starts-with? line "\u0001")
              (let [[sha author email date subject] (str/split (subs line 1) #"\u001f" 5)]
                (conj commits {:sha sha, :author author, :email email, :date date, :subject subject
                               :pr  (pr-number subject), :files []}))

              (str/starts-with? line ":")
              (let [[stat path]   (str/split line #"\t" 2)
                    [_ _ old new] (str/split stat #" ")]
                (update-in commits [(dec (count commits)) :files] conj {:path path, :old old, :new new}))

              :else
              commits))
          []
          lines))

(defn- log [& args]
  (parse-log (apply git "log" "--first-parent" "--diff-merges=first-parent" "--no-renames" "--raw" "--no-abbrev"
                    log-format args)))

(defn- ratchet-commits
  "Shas of the commits that changed a ratchet file, newest first. `args` select the commits, as for `git log`."
  [& args]
  (vec (apply git (concat ["log" "--first-parent" "--format=%H"] args ["--"] (vals ratchet-files)))))

(def ^:private symbol-delimiter "[^A-Za-z0-9*+!?<>=._/-]")

(defn- mentioned?
  "Does a tracked file under `.clj-kondo` other than a ratchet file name one of `names` at `rev`?"
  [rev names]
  (let [quoted (map #(str/replace % #"[.*+?|()\[\]{}^$\\]" "\\\\$0") names)]
    (apply git-ok? "grep" "-q" "-E"
           "-e" (str "(^|" symbol-delimiter ")(" (str/join "|" quoted) ")(" symbol-delimiter "|$)")
           rev "--" ".clj-kondo"
           (map #(str ":(exclude)" %) (vals ratchet-files)))))

(defn- added-in?
  "Did commit `sha` add the first mention of one of `names` to the kondo config or hooks?"
  [sha names]
  (and (not (mentioned? (str sha "^") names))
       (mentioned? sha names)))

(defn- symbol-names
  "The symbols a discouraged-symbol ratchet key may stand for; see [[ratchet/discouraged-count-key]]."
  [sym-key]
  (let [s (subs (str sym-key) 1)]
    (if (str/starts-with? s "ee.")
      [(str "metabase-enterprise." (subs s 3))]
      [s (str "metabase." s)])))

(def ^:private commit-view
  (memoize (fn [sha]
             (budget-view (budgets-at (str sha "^")) (budgets-at sha)))))

(def ^:private commit-changes
  (memoize (fn [sha]
             ;; TODO (Chris 2026-10-10) -- also report linters that landed with no budget at all, because nothing
             ;; needed an ignore. No ratchet file changes for those, so this history never sees them.
             (vec (budget-changes (commit-view sha)
                                  {:new-linter? #(added-in? sha [(str %)])
                                   :new-symbol? (fn [_linter sym] (added-in? sha (symbol-names sym)))})))))

(defn- shrink? [sha]
  (boolean (some #(= :shrink (:kind %)) (commit-changes sha))))

(defn- blobs
  "The contents of the git blobs `shas`, keyed by sha."
  [shas]
  (if (empty? shas)
    {}
    (let [^bytes out (:out (p/shell {:in (str/join "\n" shas), :out :bytes, :dir u/project-root-directory}
                                    "git" "cat-file" "--batch"))]
      (loop [pos 0, acc {}]
        (if (>= pos (alength out))
          acc
          (let [eol        (long (loop [i pos] (if (= 10 (aget out i)) i (recur (inc i)))))
                [sha _ n]  (str/split (String. out (int pos) (int (- eol pos)) "UTF-8") #" ")]
            ;; a missing object has a header and no content
            (if-let [size (some-> n parse-long)]
              (recur (+ eol size 2) (assoc acc sha (String. out (int (inc eol)) (int size) "UTF-8")))
              (recur (inc eol) acc))))))))

(def ^:private no-blob (apply str (repeat 40 "0")))

(defn- source-file? [path]
  (and (some #(str/starts-with? path (str % "/")) ratchet/source-roots)
       (some #(str/ends-with? path %) ratchet/source-extensions)))

(defn- counts
  "What `content`, the file at `path`, adds to each measure's actual count. Sides are those of the file's path."
  [path content]
  (cond
    (nil? content)
    {}

    (= path kondo-config-file)
    (update-keys (ratchet/config-suppressions (edn/read-string content)) #(vector :prod :config %))

    (= path module-config-file)
    (update-keys (ratchet/module-escape-hatches (:metabase/modules (edn/read-string content)))
                 #(vector :modules :module %))

    (and (source-file? path) (str/includes? content "clj-kondo/ignore"))
    (let [side (if (ratchet/test-occurrence? {:file path}) :test :prod)]
      (update-keys (frequencies (mapcat :linters (ratchet/ignore-matches content)))
                   #(vector side :ignore %)))

    :else
    {}))

(defn- actual-delta
  "How far `commit` moved each measure's actual count. A file that cannot be read on both sides counts nothing."
  [contents commit]
  (apply merge-with + {}
         (for [{:keys [path old new]} (:files commit)]
           (try
             (subtract (counts path (contents new)) (counts path (contents old)))
             (catch Exception _
               {})))))

(defn- tighten?
  "Did commit `sha` only lower budgets, as the post-merge automation does? Such a commit leaves no slack."
  [sha]
  (and (every? (set (vals ratchet-files)) (git "diff-tree" "--no-commit-id" "--name-only" "-r" sha))
       (shrink? sha)))

(defn- load-window
  "The commits after `boundary` up to `sha`, newest first, that could have moved an actual count or a budget, and
  `:actual`, a function from one of them to how far it moved each actual count."
  [boundary sha]
  (let [span     (str boundary ".." sha)
        touched  (concat (apply log span "-Gclj-kondo/ignore" "--" ratchet/source-roots)
                         (log span "--" kondo-config-file module-config-file)
                         (apply log span "--" (vals ratchet-files)))
        by-sha   (reduce (fn [acc commit]
                           (update acc (:sha commit) #(update commit :files into (:files %))))
                         {}
                         touched)
        commits  (vec (keep by-sha (git "rev-list" "--first-parent" span)))
        contents (blobs (distinct (remove #{no-blob} (mapcat (juxt :old :new) (mapcat :files commits)))))]
    {:boundary boundary
     :commits  commits
     :actual   (memoize #(actual-delta contents %))}))

(def ^:private last-window (atom nil))

(defn- window
  "[[load-window]], reusing the last one loaded when it has the same `boundary` and reaches `sha`.
  Commits are analysed newest first, so the shrinks that share a boundary share the first window loaded for it."
  [boundary sha]
  (let [from-sha (fn [commits] (drop-while #(not= sha (:sha %)) commits))
        cached   @last-window]
    (if (and (= boundary (:boundary cached)) (seq (from-sha (:commits cached))))
      (update cached :commits (comp vec from-sha))
      (reset! last-window (load-window boundary sha)))))

(defn- seeded-budgets
  "The budget `changes` gave each measure for symbols it newly discouraged."
  [changes]
  (reduce (fn [acc {:keys [key measure new]}] (cond-> acc key (update measure (fnil + 0) new)))
          {}
          changes))

(defn- with-added
  "`changes`, the budget changes of commit `sha`, with the suppressions it `:added` on each `:grow`."
  [sha changes]
  (if (not-any? #(= :grow (:kind %)) changes)
    changes
    (let [{:keys [commits actual]} (load-window (str sha "^") sha)
          merged? (or (:merged? (commit-view sha)) (nil? (:test (budgets-at sha))))
          added   (subtract (cond-> (actual (first commits)) merged? merge-sides) (seeded-budgets changes))]
      (mapv (fn [{:keys [kind measure], :as change}]
              (cond-> change (= :grow kind) (assoc :added (get added measure 0))))
            changes))))

(defn- contributions
  "The `[commit deltas]` pairs [[attribute]] takes, for the shrink in commit `sha` and the commits back to
  `boundary`."
  [boundary sha changes]
  (let [{:keys [commits actual]} (window boundary sha)
        ratchet?  (fn [commit] (some (set (vals ratchet-files)) (map :path (:files commit))))
        ;; commits older than the one that split test budgets out are viewed merged, like that commit itself
        split     (first (keep-indexed (fn [i commit]
                                         (when (and (ratchet? commit) (:merged? (commit-view (:sha commit))))
                                           i))
                                       commits))
        split?    (some? (:test (budgets-at sha)))
        seeded    (seeded-budgets changes)]
    (map-indexed (fn [i commit]
                   (let [merged? (if split (>= i split) (not split?))
                         actual  (cond-> (actual commit) merged? merge-sides)]
                     [(dissoc commit :files)
                      (cond
                        (= sha (:sha commit)) (subtract actual seeded)
                        (ratchet? commit)     (let [view (commit-view (:sha commit))]
                                                ;; a first budget is taken to match the count, leaving no slack
                                                (apply dissoc (subtract actual (budget-delta view))
                                                       (remove (set (keys (:before view))) (keys (:after view)))))
                        :else                 actual)]))
                 commits)))

(defn- analyse
  "The record for `sha`, a commit that changed a ratchet file. `history` is every such commit, newest first."
  [history sha]
  (let [changes  (commit-changes sha)
        shrunk   (into {} (for [{:keys [kind measure delta]} changes :when (= kind :shrink)] [measure delta]))
        older    (rest (drop-while #(not= sha %) history))
        boundary (or (first (filter tighten? older)) (last older))
        {:keys [open causes]} (when (and boundary (seq shrunk))
                                (attribute shrunk (contributions boundary sha changes)))]
    (cond-> (-> (first (parse-log (git "log" "-1" log-format sha)))
                (dissoc :files)
                (assoc :changes (with-added sha changes)))
      (seq causes)   (assoc :causes causes)
      (seq open)     (assoc :unaccounted open)
      (tighten? sha) (assoc :tighten? true))))

;;; --------------------------------------------------- Cache --------------------------------------------------

(defn- cached [sha]
  (let [file (fs/file cache-dir (str sha ".edn"))]
    (when (fs/exists? file)
      (edn/read-string (slurp file)))))

(defn- record!
  "The record for `sha`, from the cache when it is there."
  [history sha]
  (or (cached sha)
      (let [record (analyse history sha)]
        (fs/create-dirs cache-dir)
        (spit (fs/file cache-dir (str sha ".edn")) (pr-str record))
        record)))

(def ^:private tips-file (fs/file cache-dir "tips.edn"))

(defn- analysed-tips []
  (if (fs/exists? tips-file)
    (edn/read-string (slurp tips-file))
    []))

(defn- last-analysed
  "The most recently analysed commit that `head` descends from, if any."
  [head]
  (first (filter #(git-ok? "merge-base" "--is-ancestor" % head) (analysed-tips))))

(defn- remember-tip! [head]
  (fs/create-dirs cache-dir)
  (spit tips-file (pr-str (vec (take 50 (distinct (cons head (analysed-tips))))))))

;;; -------------------------------------------------- Summary -------------------------------------------------

(defn unify-authors
  "`records` with one name per person: every commit, and every cause of a shrink, whose author email matches
  takes the author name of the newest of them. Commits under one name already count as one person."
  [records]
  (let [newest (reduce (fn [acc {:keys [email author date]}]
                         (cond-> acc
                           (and email (neg? (compare (get-in acc [email :date] "") date)))
                           (assoc email {:date date, :author author})))
                       {}
                       (concat records (mapcat #(apply concat (vals (:causes %))) records)))
        rename (fn [{:keys [email], :as commit}]
                 (cond-> commit (newest email) (assoc :author (:author (newest email)))))]
    (for [record records]
      (cond-> (rename record)
        (:causes record) (update :causes update-vals #(mapv rename %))))))

(defn attributions
  "One entry per commit and measure it is responsible for moving, across `records`: the commit's `:sha`,
  `:author`, `:pr` and `:subject`, with the `:measure` and its `:delta`.
  A grow belongs to the commit that raised the budget and a shrink to its causes.
  The unexplained part of a shrink belongs to the shrinking commit too, unless that commit only lowered budgets:
  then it is an entry under the [[unattributed]] author."
  [records]
  (for [{:keys [changes causes unaccounted tighten?], :as record} records
        :let  [commit (dissoc record :changes :causes :unaccounted :tighten? :email)]
        {:keys [kind measure delta]} changes
        :when (#{:shrink :grow} kind)
        entry (if (= kind :grow)
                [(assoc commit :delta delta)]
                (concat (get causes measure)
                        (when-let [left (get unaccounted measure)]
                          [(cond-> (assoc commit :delta left) tighten? (assoc :author unattributed))])))]
    (assoc entry :measure measure)))

(defn totals
  "Per measure, how far `records` shrank and grew its budget: `{measure {:shrink n, :grow n}}`."
  [records]
  (reduce (fn [acc {:keys [kind measure delta]}]
            (cond-> acc
              (#{:shrink :grow} kind) (update-in [measure kind] (fnil + 0) delta)))
          {}
          (mapcat :changes records)))

(defn by-commit
  "Net change each commit is responsible for in `entries` ([[attributions]]), best first.
  Leaves out what no commit explains."
  [entries]
  (->> (remove #(= unattributed (:author %)) entries)
       (group-by :sha)
       (map (fn [[_ entries]]
              (assoc (dissoc (first entries) :measure :delta)
                     :net      (reduce + (map :delta entries))
                     :measures (update-vals (group-by :measure entries) #(reduce + (map :delta %))))))
       (sort-by (juxt :net :sha))))

(defn leaderboard
  "Per author across `records`: how far they `:shrunk` and `:grew` budgets and the `:net` of the two, and the
  `:linters` they introduced with the `:ignores` those started with. A linter that starts with more ignores was
  the bigger one to land, and an `:unlimited` one counts none."
  [records]
  (let [blank      {:shrunk 0, :grown 0, :net 0, :linters 0, :ignores 0}
        moved      (update-vals (group-by :author (attributions records))
                                (fn [entries]
                                  (let [deltas (map :delta entries)]
                                    {:shrunk (reduce + (filter neg? deltas))
                                     :grown  (reduce + (filter pos? deltas))
                                     :net    (reduce + deltas)})))
        introduced (reduce (fn [acc [author budget]]
                             (-> acc
                                 (update-in [author :linters] (fnil inc 0))
                                 (update-in [author :ignores] (fnil + 0) (if (number? budget) budget 0))))
                           {}
                           (for [{:keys [author changes]} records
                                 {:keys [kind new]}       changes
                                 :when (= kind :introduce)]
                             [author new]))]
    (->> (merge-with merge moved introduced)
         (map (fn [[author row]] (merge blank row {:author author})))
         (sort-by :author))))

(def ^:private measure-suffixes
  {[:prod :ignore]    ""
   [:test :ignore]    " (test)"
   [:prod :config]    " (config)"
   [:modules :module] " (modules)"})

(defn- measure-name [[side kind linter]]
  (str linter (measure-suffixes [side kind])))

(defn- budget-name [budget]
  (cond
    (nil? budget)     "none"
    (keyword? budget) (name budget)
    :else             (str budget)))

(defn- signed [n]
  (if (zero? n) "0" (format "%+d" n)))

(defn- commit-line [{:keys [sha pr author subject]}]
  (str (subs sha 0 10) (when pr (str " #" pr)) "  " author "  " (c/dark subject)))

(defn- table
  "Lines for `rows` of strings, the first of them the header: the first column left-aligned, the rest
  right-aligned. `colors` holds, per column, a function from a cell below the header to its color function, or
  nil."
  [colors rows]
  (let [widths (apply map (fn [& cells] (apply max (map count cells))) rows)]
    (map-indexed (fn [r row]
                   (str/trimr
                    (str/join "  "
                              (map-indexed (fn [i cell]
                                             (let [color (cond
                                                           (zero? r)      c/dark
                                                           (nth colors i) ((nth colors i) cell)
                                                           :else          identity)]
                                               (color (format (str "%" (when (zero? i) "-") (nth widths i) "s")
                                                              cell))))
                                           row))))
                 rows)))

(defn- tint
  "A column color for [[table]]: `color`, with a zero left dim."
  [color]
  (fn [cell]
    (if (= "0" cell) c/dark color)))

(defn- net-tint
  "The column color for a net change: green for a net shrink, red for a net raise and the default color for none."
  [cell]
  (case (first cell)
    \- c/green
    \+ c/red
    identity))

(defn- colored-delta
  "`n` with its sign: green for a shrink and red for a raise."
  [n]
  (cond
    (neg? n) (c/green (signed n))
    (pos? n) (c/red (signed n))
    :else    "0"))

(defn- section [title lines]
  (when (seq lines)
    (concat ["" (c/bold title)] (map #(str "  " %) lines))))

(defn- ranking
  "Table lines for the `rows` of a [[leaderboard]] that `order` gives a rank, a vector to sort by.
  `columns` are `[header key format color]` tuples."
  [rows order columns]
  (when-let [rows (seq (sort-by (juxt order :author) (filter order rows)))]
    (table (vec (cons nil (map #(nth % 3) columns)))
           (cons (cons "" (map first columns))
                 (for [row rows]
                   (cons (:author row) (map (fn [[_ column fmt]] (fmt (get row column))) columns)))))))

(defn- totals-lines [records]
  (let [rows (->> (totals records)
                  (map (fn [[measure {:keys [shrink grow] :or {shrink 0, grow 0}}]]
                         [(measure-name measure) shrink grow (+ shrink grow)]))
                  (sort-by (juxt peek first)))]
    (when (seq rows)
      (table [nil (tint c/green) (tint c/red) net-tint]
             (concat [["" "shrunk" "grown" "net"]]
                     (map (fn [row] (cons (first row) (map signed (rest row)))) rows)
                     [(cons "total" (map (fn [i] (signed (reduce + (map #(nth % i) rows)))) [1 2 3]))])))))

(def ^:private biggest-shown 8)

(defn- biggest-lines
  "Lines for the commit responsible for the most change: the commit, its net change, then that change per
  linter, largest first, with the tail past [[biggest-shown]] summed."
  [{:keys [net measures], :as commit}]
  (let [ranked (sort-by (juxt (comp - abs val) (comp str key)) measures)
        [shown more] (split-at biggest-shown ranked)
        width  (apply max (map (comp count signed val) ranked))
        row    (fn [delta label]
                 (str "  " (colored-delta delta) (apply str (repeat (- width (count (signed delta))) " "))
                      "  " label))]
    (concat [(commit-line commit)
             (format "%s net, across %d linter%s:" (colored-delta net) (count measures)
                     (if (= 1 (count measures)) "" "s"))]
            (for [[measure delta] shown]
              (row delta (measure-name measure)))
            (when (seq more)
              [(row (reduce + (vals more)) (format "%d more linters" (count more)))]))))

(defn- change-lines
  "Lines for the changes of the given `kinds` in `records`, grouped under the commit that made them."
  [records kinds describe]
  (for [record records
        :let   [changes (filter (comp kinds :kind) (:changes record))]
        :when  (seq changes)
        line   (cons (commit-line record) (map #(str "  " (describe %)) changes))]
    line))

(defn- suspect-lines [records]
  (when (seq records)
    (concat
     (for [record records
           :let   [raises (:changes record)]
           line   (cons (commit-line record)
                        (if (< 5 (count raises))
                          [(format "  %s over %d budgets, with %d suppressions added"
                                   (colored-delta (reduce + (map :delta raises)))
                                   (count raises)
                                   (reduce + (map :added raises)))]
                          (for [{:keys [measure delta added]} raises]
                            (format "  %s %s, with %d suppressions added"
                                    (colored-delta delta) (measure-name measure) added))))]
       line)
     ["Settle each with: ./bin/mage kondo-ratchets-history --pardon|--confirm <commit or PR> --why <reason>"])))

(defn- unaccounted-lines [records]
  (for [{:keys [unaccounted tighten?], :as record} records
        :when (and tighten? (seq unaccounted))
        line  (cons (commit-line record)
                    (for [[measure left] (sort-by (comp str key) unaccounted)]
                      (str "  " (signed left) " " (measure-name measure))))]
    line))

(def ^:private uncounted-linters
  "Linters whose suppressions say nothing about the code, so the summary leaves their budgets out, each with
  the reason."
  {:metabase/prefer-with-dynamic-fn-redefs "Ignoring it works around a bug in the linter itself."})

(def ^:private verdicts-file
  "Verdicts on budget raises, relative to the repo root. [[verdict]] writes it."
  "mage/resources/kondo-ratchets-verdicts.edn")

(defn- read-verdicts []
  (let [file (fs/file u/project-root-directory verdicts-file)]
    (if (fs/exists? file)
      (edn/read-string (slurp file))
      [])))

(defn- render-verdicts [verdicts]
  (str ";; Verdicts on the budget raises `./bin/mage kondo-ratchets-history` questions: a raise beyond the
"
       ";; suppressions its commit added. A :pardon counts the commit's raises against nobody; a :confirm keeps them.
"
       ";; A :recount marks a commit that only changed how suppressions are counted: none of its changes count.
"
       ";; Written by `./bin/mage kondo-ratchets-history --pardon`, `--confirm` and `--recount`.
"
       "["
       (str/join "
 "
                 (for [verdict verdicts]
                   (str "{"
                        (str/join "
  "
                                  (for [k [:sha :pr :subject :verdict :why]
                                        :when (some? (get verdict k))]
                                    (format "%-8s %s" k (pr-str (get verdict k)))))
                        "}")))
       "]
"))

(defn suspects
  "The commits in `records` not in `settled` that raised a budget beyond the suppressions they added, each with
  only those raises as its `:changes`."
  [settled records]
  (for [record records
        :when  (not (settled (:sha record)))
        :let   [raises (filter (fn [{:keys [kind measure delta added]}]
                                 (and (= :grow kind)
                                      (some-> added (< delta))
                                      (not (uncounted-linters (peek measure)))))
                               (:changes record))]
        :when  (seq raises)]
    (assoc record :changes raises)))

(defn pardon
  "`records` with the raises in `pardons`, a map from commit to the measures it raised, turned from `:grow`
  into `:pardon`. A shrink loses the part that only takes a pardoned raise back, and the credit for it.
  A commit in `recounts` only changed how suppressions are counted, so its own shrinks go too."
  [{:keys [pardons recounts]} records]
  (let [recounts  (or recounts #{})
        pardoned? (fn [sha measure]
                    (when-let [measures (pardons sha)]
                      (or (= :all measures) (contains? measures measure))))]
    (for [{:keys [sha causes], :as record} records
          :let [taken-back? (fn [measure cause] (and (not= sha (:sha cause)) (pardoned? (:sha cause) measure)))
                taken-back  (into {}
                                  (for [[measure entries] causes
                                        :let  [n (reduce + (map :delta (filter #(taken-back? measure %) entries)))]
                                        :when (not (zero? n))]
                                    [measure n]))]]
      (cond-> (update record :changes
                      (partial keep (fn [{:keys [kind measure delta], :as change}]
                                      (cond
                                        (and (= :grow kind) (pardoned? sha measure))
                                        (assoc change :kind :pardon)

                                        (and (= :shrink kind) (recounts sha))
                                        nil

                                        (and (= :shrink kind) (taken-back measure))
                                        (let [delta (- delta (taken-back measure))]
                                          (when-not (zero? delta)
                                            (assoc change :delta delta :kind (if (neg? delta) :shrink :grow))))

                                        :else
                                        change))))
        causes (assoc :causes (into {}
                                    (for [[measure entries] causes]
                                      [measure (vec (remove #(taken-back? measure %) entries))])))))))

(defn counted
  "`records` without the changes to budgets of [[uncounted-linters]], and without the commits that leaves empty."
  [records]
  (->> records
       (map (fn [record]
              (update record :changes (partial remove (comp uncounted-linters peek :measure)))))
       (filter (comp seq :changes))))

(defn summary
  "Lines summarizing `records`, the analysed commits of the period called `period`.
  `pardons` maps a pardoned commit to the measures it raised, and `settled` holds every commit with a verdict.
  Leaves out the [[uncounted-linters]]."
  [{:keys [settled], :as verdicts} period records]
  (let [doubted (suspects settled records)
        records (counted (pardon verdicts records))
        ranked (by-commit (attributions records))
        board  (leaderboard records)
        best   (first ranked)
        worst  (last ranked)]
    (concat
     [(c/bold (format "Ratchet changes %s: %d commits" period (count records)))]
     (section "Total deltas" (totals-lines records))
     (section "Biggest improvement" (when (some-> best :net neg?) (biggest-lines best)))
     (section "Biggest regression" (when (some-> worst :net pos?) (biggest-lines worst)))
     (section "New linters"
              (change-lines records #{:introduce}
                            (fn [{:keys [measure key new]}]
                              (c/green (measure-name measure) (when key (str " " (subs (str key) 1)))
                                       "  starting at " (budget-name new)))))
     (section "Moved into or out of :unlimited"
              (change-lines records #{:limit :unlimit}
                            (fn [{:keys [measure old new]}]
                              (str (measure-name measure) "  " (budget-name old) " -> " (budget-name new)))))
     (section "Most shrunk"
              (ranking board #(when (neg? (:shrunk %)) [(:shrunk %)]) [["shrunk" :shrunk signed (tint c/green)]]))
     (section "Most grown"
              (ranking board #(when (pos? (:grown %)) [(- (:grown %))]) [["grown" :grown signed (tint c/red)]]))
     (section "Net, from most shrunk to most grown"
              (ranking board #(when-not (= 0 (:shrunk %) (:grown %)) [(:net %)])
                       [["shrunk" :shrunk signed (tint c/green)] ["grown" :grown signed (tint c/red)]
                        ["net" :net signed net-tint]]))
     (section "Most introduced, by the ignores the new linters started with"
              (ranking board #(when (pos? (:linters %)) [(- (:ignores %)) (- (:linters %))])
                       [["ignores" :ignores str (tint c/green)] ["linters" :linters str (tint c/green)]]))
     (section "Shrinks no commit accounts for" (unaccounted-lines records))
     (section "Raises beyond the suppressions added, with no verdict" (suspect-lines doubted)))))

(defn report
  "What a [[summary]] of `records` says, as plain data for the HTML page: measures are named and budgets are
  strings. Takes the same verdicts as [[summary]]."
  [{:keys [settled], :as verdicts} records]
  (let [doubted (suspects settled records)
        records (counted (pardon verdicts records))
        ranked  (by-commit (attributions records))
        commit  #(select-keys % [:sha :pr :author :subject :date])
        deltas  (fn [by-measure]
                  (for [[measure delta] (sort-by (juxt (comp - abs val) (comp str key)) by-measure)]
                    {:measure (measure-name measure), :delta delta}))
        biggest (fn [entry]
                  {:commit (commit entry), :net (:net entry), :measures (deltas (:measures entry))})
        grouped (fn [kinds describe]
                  (for [record records
                        :let   [changes (filter (comp kinds :kind) (:changes record))]
                        :when  (seq changes)]
                    {:commit (commit record), :items (map describe changes)}))
        rows    (->> (totals records)
                     (map (fn [[measure {:keys [shrink grow] :or {shrink 0, grow 0}}]]
                            {:measure (measure-name measure), :shrunk shrink, :grown grow, :net (+ shrink grow)}))
                     (sort-by (juxt :net :measure)))]
    {:commits     (count records)
     :totals      rows
     :total       (into {} (for [k [:shrunk :grown :net]] [k (reduce + (map k rows))]))
     :best        (when (some-> (first ranked) :net neg?) (biggest (first ranked)))
     :worst       (when (some-> (last ranked) :net pos?) (biggest (last ranked)))
     :introduced  (grouped #{:introduce}
                           (fn [{:keys [measure key new]}]
                             {:measure (str (measure-name measure) (when key (str " " (subs (str key) 1))))
                              :budget  (budget-name new)}))
     :unlimited   (grouped #{:limit :unlimit}
                           (fn [{:keys [measure old new]}]
                             {:measure (measure-name measure), :old (budget-name old), :new (budget-name new)}))
     :board       (leaderboard records)
     :unaccounted (for [{:keys [unaccounted tighten?], :as record} records
                        :when (and tighten? (seq unaccounted))]
                    {:commit (commit record), :items (deltas unaccounted)})
     :suspects    (for [record doubted]
                    {:commit (commit record)
                     :items  (for [{:keys [measure delta added]} (:changes record)]
                               {:measure (measure-name measure), :delta delta, :added added})})}))

(defn series
  "One point per commit in `records`, which run newest first, in the order they landed: how far the commit
  `:shrunk` and `:grew` the counted budgets once the verdicts [[report]] takes are applied, and the `:level`
  after it, the sum of every counted numeric budget."
  [verdicts records]
  (let [numeric #(if (number? %) % 0)
        moved   (into {}
                      (for [{:keys [sha changes]} (counted (pardon verdicts records))]
                        [sha (reduce (fn [acc {:keys [kind delta]}]
                                       (cond-> acc (#{:shrink :grow} kind) (update kind + delta)))
                                     {:shrink 0, :grow 0}
                                     changes)]))
        raised  (fn [{:keys [changes]}]
                  (reduce + (for [{:keys [measure key old new]} changes
                                  :when (not (uncounted-linters (peek measure)))]
                              ;; a newly discouraged symbol carries its own budget; see [[budget-changes]]
                              (if key (numeric new) (- (numeric new) (numeric old))))))]
    (rest (reductions (fn [point {:keys [sha], :as record}]
                        (assoc (select-keys record [:sha :pr :author :subject :date])
                               :shrunk (get-in moved [sha :shrink] 0)
                               :grown  (get-in moved [sha :grow] 0)
                               :level  (+ (:level point) (raised record))))
                      {:level 0}
                      (reverse records)))))

(defn periods
  "All time, then every week (from its Monday) and every calendar month from the first of `records` up to
  `today`, an ISO date, newest first: maps of `:id`, `:kind`, `:label`, the `:from` date and the `:to` date it
  ends before, and the [[report]] of the records committed in it. `verdicts` are those [[report]] takes."
  [verdicts today records]
  (let [day    (fn [record] (java.time.LocalDate/parse (subs (:date record) 0 10)))
        today  (java.time.LocalDate/parse today)
        oldest ^java.time.LocalDate (reduce (fn [^java.time.LocalDate a ^java.time.LocalDate b]
                                              (if (.isBefore b a) b a))
                                            today
                                            (map day records))
        monday (fn [^java.time.LocalDate date] (.minusDays date (dec (.getValue (.getDayOfWeek date)))))
        text   (fn [pattern ^java.time.LocalDate date]
                 (.format (java.time.format.DateTimeFormatter/ofPattern pattern java.util.Locale/ENGLISH) date))
        from   (fn [^java.time.LocalDate start step]
                 (take-while (fn [^java.time.LocalDate date] (not (.isBefore date start))) (iterate step today)))
        within (fn [^java.time.LocalDate start ^java.time.LocalDate end]
                 (report verdicts
                         (filter (fn [record]
                                   (let [^java.time.LocalDate date (day record)]
                                     (and (not (.isBefore date start)) (.isBefore date end))))
                                 records)))]
    (concat
     [{:id "all", :kind "all", :label "All time", :report (report verdicts records)}]
     (for [^java.time.LocalDate start (map monday (from (monday oldest) #(.minusWeeks ^java.time.LocalDate % 1)))]
       {:id     (str "week-" start)
        :kind   "week"
        :label  (str (text "d MMM" start) " to " (text "d MMM yyyy" (.plusDays start 6)))
        :from   (str start)
        :to     (str (.plusWeeks start 1))
        :report (within start (.plusWeeks start 1))})
     (for [^java.time.LocalDate start (map #(.withDayOfMonth ^java.time.LocalDate % 1)
                                           (from (.withDayOfMonth oldest 1) #(.minusMonths ^java.time.LocalDate % 1)))]
       {:id     (str "month-" (text "yyyy-MM" start))
        :kind   "month"
        :label  (text "MMMM yyyy" start)
        :from   (str start)
        :to     (str (.plusMonths start 1))
        :report (within start (.plusMonths start 1))}))))

(def ^:private page-template
  "The HTML page [[page]] fills in, relative to the repo root."
  "mage/resources/kondo-ratchets-history.html")

(defn- page
  "The single-file HTML page showing `data`: the `:repo` URL, the `:generated` date and the [[periods]]."
  [data]
  (str/replace (slurp (fs/file u/project-root-directory page-template))
               "__DATA__"
               ;; the JSON sits in a script element, which a literal closing tag would end
               (str/replace (json/write-str data) "</" "<\\/")))

;;; ---------------------------------------------------- Task --------------------------------------------------

(defn- resolve-commit [rev]
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "git" "rev-parse" "--verify" "--quiet" (str rev "^{commit}"))]
    (if (zero? exit)
      (first out)
      (u/exit (str "Not a commit: " rev) 1))))

(def ^:private default-days 7)

(defn- period
  "What to do, from the task's `since` commit and `options`: a summary by `[:since sha]`, `[:all]` or
  `[:days n]`, `[:html file]` for the page of every period, or `[:verdict [kind target]]` to record a verdict.
  Exits when more than one is asked for."
  [since {:keys [all days html pardon confirm recount]}]
  (let [asked (cond-> []
                since (conj "a commit")
                all   (conj "--all")
                days  (conj "--days")
                html    (conj "--html")
                pardon  (conj "--pardon")
                confirm (conj "--confirm")
                recount (conj "--recount"))]
    (when (next asked)
      (u/exit (str "Give only one of " (str/join ", " asked) ".") 1))
    (cond
      since   [:since since]
      pardon  [:verdict [:pardon pardon]]
      confirm [:verdict [:confirm confirm]]
      recount [:verdict [:recount recount]]
      html    [:html html]
      all     [:all]
      :else [:days (or days default-days)])))

(defn- ratchet-commit
  "The sha in `all`, the commits that changed a ratchet file, that `target` names: a commit, or a PR as `1234`
  or `#1234`. Exits when there is not exactly one."
  [all target]
  (if-let [pr (second (re-matches #"#?(\d{1,6})" target))]
    (let [found (for [line  (apply git "log" "--first-parent" "--format=%H %s" "HEAD" "--" (vals ratchet-files))
                      :let  [[sha subject] (str/split line #" " 2)]
                      :when (= (parse-long pr) (pr-number subject))]
                  sha)]
      (if (= 1 (count found))
        (first found)
        (u/exit (format "Found %d commits for PR #%s that changed a ratchet file." (count found) pr) 1)))
    (let [sha (resolve-commit target)]
      (if (some #{sha} all)
        sha
        (u/exit (str "Commit " (subs sha 0 10) " did not change a ratchet file.") 1)))))

(defn- verdict!
  "Record in [[verdicts-file]] a verdict of `kind` on the commit `target` names, as a sha or a PR number, with
  the reason `why`. A `:pardon` counts the commit's budget raises against nobody and a `:confirm` keeps them as
  growth. A `:recount` says the commit only changed how suppressions are counted, so neither its raises nor its
  own shrinks count."
  [kind target why]
  (let [all     (ratchet-commits (resolve-commit "HEAD"))
        sha     (ratchet-commit all target)
        record  (record! all sha)
        covered (if (= :recount kind) #{:grow :shrink} #{:grow})
        changes (filter (comp covered :kind) (:changes record))
        entry   (cond-> (assoc (select-keys record [:sha :pr :subject]) :verdict kind)
                  why (assoc :why why))
        others  (remove #(= sha (:sha %)) (read-verdicts))]
    (when (empty? changes)
      (u/exit (str "Nothing to " (name kind) ": " (commit-line record) " raised no budget.") 1))
    (when (and (not= :confirm kind) (not why))
      (u/exit (str "A " (name kind) " needs a reason: add --why <reason>.") 1))
    (spit (fs/file u/project-root-directory verdicts-file) (render-verdicts (concat others [entry])))
    (println (str ({:pardon "Pardoned ", :confirm "Confirmed ", :recount "Recounted "} kind) (commit-line record)))
    (doseq [{:keys [measure delta]} changes]
      (println (str "  " (signed delta) " " (measure-name measure))))))

(defn- summarize
  "Bring the cache up to `HEAD`, then print or write what `by` and `arg`, from [[period]], ask for."
  [by arg]
  (let [head      (resolve-commit "HEAD")
        all       (ratchet-commits head)
        resume    (case by
                    :since       arg
                    (:all :html) nil
                    :days        (last-analysed head))
        backfill  (remove cached (if resume (ratchet-commits (str resume ".." head)) all))
        verdicts  (filter (comp (set all) :sha) (read-verdicts))
        origin    (fn []
                    (-> (first (git "remote" "get-url" "origin"))
                        (str/replace #"^git@github\.com:" "https://github.com/")
                        (str/replace #"\.git$" "")))]
    (when (seq backfill)
      (println (c/dark (format "Analysing %d commits that changed a ratchet file" (count backfill)))))
    (doseq [sha backfill]
      (let [record (record! all sha)]
        (println (c/dark (str "  " (commit-line record))))))
    (remember-tip! head)
    (let [rulings  (for [{:keys [sha verdict why]} verdicts
                         :let [record (record! all sha)]]
                     {:commit  (select-keys record [:sha :pr :author :subject :date])
                      :verdict (name verdict)
                      :why     why
                      :raises  (for [{:keys [kind measure delta]} (:changes record)
                                     :when (or (= :grow kind) (and (= :recount verdict) (= :shrink kind)))]
                                 {:measure (measure-name measure), :delta delta})})
          verdicts {:settled  (set (map :sha verdicts))
                    :recounts (set (map :sha (filter #(= :recount (:verdict %)) verdicts)))
                    :pardons  (into {}
                                    (for [{:keys [sha verdict]} verdicts
                                          :when (#{:pardon :recount} verdict)]
                                      [sha (set (map :measure (filter #(= :grow (:kind %))
                                                                      (:changes (record! all sha)))))]))}
          ;; the period can reach behind the commit the backfill resumed from, to commits no run has analysed yet
          records  (unify-authors
                    (mapv #(record! all %)
                          (case by
                            :since       (ratchet-commits (str arg ".." head))
                            (:all :html) all
                            :days        (ratchet-commits (format "--since=%d.days.ago" arg) head))))]
      (if (= :html by)
        (let [today (str (java.time.LocalDate/now))]
          (spit arg (page {:repo      (origin)
                           :generated today
                           :series    (series verdicts records)
                           :verdicts  rulings
                           :excluded  (for [[linter why] uncounted-linters]
                                        {:linter (str linter), :why why})
                           :periods   (periods verdicts today records)}))
          (println "Wrote" arg))
        (run! println (summary verdicts
                               (case by
                                 :since (str "since " (subs arg 0 10))
                                 :all   "of all time"
                                 :days  (format "in the last %d days" arg))
                               records))))))

(defn history
  "Bring the cache up to `HEAD`, then print a [[summary]] of the ratchet changes since the commit given as the
  first argument, over all time with `--all`, or else over the last `--days` days.
  With `--html`, write the [[page]] of every week, every month and all time to that file instead.
  With `--pardon`, `--confirm` or `--recount`, record that [[verdict!]] on a commit and print nothing else."
  [{:keys [options arguments]}]
  (let [[by arg] (period (some-> (first arguments) resolve-commit) options)]
    (if (= :verdict by)
      (verdict! (first arg) (second arg) (:why options))
      (summarize by arg))))
