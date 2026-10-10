(ns mage.kondo-ratchets-history
  "Attribute each change to a ratchet budget to the commits, pull requests and authors behind it.

  A budget changes in one of these ways:

  - shrink: the budget fell.
    The credit belongs to the earlier commits that removed the suppressions, not to the commit that lowered the
    number, which is usually the post-merge automation.
  - grow: the budget of a linter that already existed rose.
    A first budget counts, even when the commit adds the whole ratchet.
  - introduce: a linter got its first budget in the commit that added the linter.
  - limit or unlimit: the budget moved out of or into `:unlimited`.

  A measure is one budgeted count, `[side kind name]`: `[:prod :ignore :deprecated-var]`,
  `[:test :ignore :deprecated-var]`, `[:prod :config :deprecated-var]` or `[:modules :module :ns-prefixes]`.
  The per-symbol budgets of a discouragement linter add up to one measure.
  A commit's diff shows how many `:discouraged-var` ignores it removed, but not which symbols they covered.

  To explain a shrink, walk back from the commit that lowered the budget.
  Every commit on the way contributes its change in the actual count less its own change to the budget.
  The walk ends when the contributions add up to the shrink, or at the previous commit that only lowered budgets.
  That commit is the post-merge automation, which leaves no slack behind it.
  Whatever is left belongs to the commit that lowered the budget, which may have changed what the budget counts.
  When that commit is the automation itself, the rest is reported as unaccounted.

  A verdict in [[verdicts-file]] changes how a commit counts; see [[verdict!]].

  Only the first-parent history of `HEAD` is read.
  The analysis of each commit that changed a ratchet file is cached under its sha in [[cache-dir]]."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [babashka.process :as p]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [dev.kondo-ratchet :as ratchet]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u])
  (:import
   (java.time Instant LocalDate OffsetDateTime)
   (java.time.format DateTimeFormatter)
   (java.time.temporal ChronoUnit)
   (java.util Locale)))

(set! *warn-on-reflection* true)

(def ^:private ratchet-files
  {:prod    ratchet/*ratchets-file*
   :test    ratchet/*test-ratchets-file*
   :modules ratchet/*module-ratchets-file*})

(def ^:private ratchet-paths (set (vals ratchet-files)))

(def ^:private kondo-config-file ".clj-kondo/config.edn")

(def ^:private module-config-file ".clj-kondo/config/modules/config.edn")

;; Bump the last segment when the shape or meaning of a cached record changes.
(def ^:private cache-dir
  (fs/path (fs/home) ".cache" "mage" "kondo-ratchets-history" "v4"))

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
  The commit that adds or removes the test file is viewed with both sides merged.
  Moving a budget from one file to the other is then not a change."
  [before after]
  (let [merged? (not= (some? (:test before)) (some? (:test after)))
        view    (if merged? merge-sides identity)]
    {:merged?        merged?
     :before         (view (measures before))
     :after          (view (measures after))
     :symbols-before (view (symbol-budgets before))
     :symbols-after  (view (symbol-budgets after))}))

(defn- seeded-budgets
  "The budget `changes` gave each measure for symbols it newly discouraged."
  [changes]
  (reduce (fn [acc {:keys [key measure new]}]
            (cond-> acc key (update measure (fnil + 0) new)))
          {}
          changes))

(defn budget-changes
  "Classify what a commit did to each budget in `view` ([[budget-view]]).
  Returns maps of `:measure`, `:kind`, `:old` and `:new`, with a `:delta` for a `:shrink` or `:grow`.
  A newly discouraged symbol is its own `:introduce`, with the symbol as `:key`.
  `new-linter?` and `new-symbol?` say whether the commit also added the linter, or the symbol under `linter`."
  [{:keys [before after symbols-before symbols-after]} {:keys [new-linter? new-symbol?]}]
  (let [symbols (for [[[side linter sym :as k] n] (sort-by (comp str key) symbols-after)
                      :when (and (not (contains? symbols-before k))
                                 (new-symbol? linter sym))]
                  {:measure [side :ignore linter]
                   :kind    :introduce
                   :key     sym
                   :new     n})
        seeded  (seeded-budgets symbols)]
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
  "Explain `shrunk`, a map from measure to its (negative) budget change, by `contributions`.
  Those are `[commit deltas]` pairs, newest first, where `deltas` maps a measure to what that commit added to
  its slack-free count.
  Returns `:causes`, a map from measure to the commits (each with its `:delta`) that explain it, and `:open`,
  the part of each shrink that no commit explains.
  A measure stops collecting causes once it is fully explained."
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

(defn parse-log
  "Commits from the lines of `git log --raw` output in [[log-format]], each with the `:files` it changed."
  [lines]
  (reduce (fn [commits line]
            (cond
              (str/starts-with? line "\u0001")
              (let [[sha author email date subject] (str/split (subs line 1) #"\u001f" 5)]
                (conj commits {:sha     sha
                               :author  author
                               :email   email
                               :date    date
                               :subject subject
                               :pr      (pr-number subject)
                               :files   []}))

              (str/starts-with? line ":")
              (let [[stat path]   (str/split line #"\t" 2)
                    [_ _ old new] (str/split stat #" ")]
                (update-in commits [(dec (count commits)) :files] conj {:path path, :old old, :new new}))

              :else
              commits))
          []
          lines))

(defn- log [& args]
  (parse-log (apply git "log" "--first-parent" "--topo-order" "--diff-merges=first-parent" "--no-renames" "--raw"
                    "--no-abbrev" log-format args)))

(defn- ratchet-commits
  "Shas of the commits that changed a ratchet file, newest first. `args` select the commits, as for `git log`."
  [& args]
  (vec (apply git (concat ["log" "--first-parent" "--format=%H"] args ["--"] ratchet-paths))))

(def ^:private symbol-delimiter "[^A-Za-z0-9*+!?<>=._/-]")

(defn- mentioned?
  "Does a tracked file under `.clj-kondo` other than a ratchet file name one of `names` at `rev`?"
  [rev names]
  (let [quoted (map #(str/replace % #"[.*+?|()\[\]{}^$\\]" "\\\\$0") names)]
    (apply git-ok? "grep" "-q" "-E"
           "-e" (str "(^|" symbol-delimiter ")(" (str/join "|" quoted) ")(" symbol-delimiter "|$)")
           rev "--" ".clj-kondo"
           (map #(str ":(exclude)" %) ratchet-paths))))

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

(defn tightening?
  "Did a commit only lower budgets, as the post-merge automation does?
  `paths` are the files it changed and `kinds` the kinds of its budget changes."
  [paths kinds]
  ;; a commit that also raises or adds a budget, as a seeding one does, may leave slack behind
  (boolean (and (seq paths)
                (every? ratchet-paths paths)
                (every? #{:shrink :limit} kinds)
                (some #{:shrink} kinds))))

(def ^:private tighten?
  "Is commit `sha` one that [[tightening?]] holds for? Such a commit leaves no slack."
  ;; memoized: the search for a shrink's boundary asks this of every older commit, each time with a git call
  (memoize (fn [sha]
             ;; without a merge diff mode a merge commit lists no paths at all
             (tightening? (git "diff-tree" "--no-commit-id" "--name-only" "-r" "--diff-merges=first-parent" sha)
                          (map :kind (commit-changes sha))))))

(defn- blobs
  "`f` of the sha and content of each of the git blobs `shas`, keyed by sha."
  [f shas]
  (if (empty? shas)
    {}
    (let [^bytes out (:out (p/shell {:in (str/join "\n" shas), :out :bytes, :dir u/project-root-directory}
                                    "git" "cat-file" "--batch"))]
      (loop [pos 0, acc {}]
        (if (>= pos (alength out))
          acc
          (let [eol       (long (loop [i pos] (if (= 10 (aget out i)) i (recur (inc i)))))
                [sha _ n] (str/split (String. out (int pos) (int (- eol pos)) "UTF-8") #" ")]
            ;; a missing object has a header and no content
            (if-let [size (some-> n parse-long)]
              (recur (+ eol size 2) (assoc acc sha (f sha (String. out (int (inc eol)) (int size) "UTF-8"))))
              (recur (inc eol) acc))))))))

(def ^:private no-blob (apply str (repeat 40 "0")))

(defn- source-file? [path]
  (and (some #(str/starts-with? path (str % "/")) ratchet/source-roots)
       (some #(str/ends-with? path %) ratchet/source-extensions)))

(defn counts
  "What `content`, the file at `path`, adds to each measure's actual count. Sides are those of the file's path."
  [path content]
  (cond
    (= path kondo-config-file)
    (update-keys (ratchet/config-suppressions (edn/read-string content)) #(vector :prod :config %))

    (= path module-config-file)
    (update-keys (ratchet/module-escape-hatches (:metabase/modules (edn/read-string content)))
                 #(vector :modules :module %))

    (and (source-file? path) (str/includes? content "clj-kondo/ignore"))
    (let [side (if (ratchet/test-occurrence? {:file path}) :test :prod)]
      (update-keys (frequencies (ratchet/ignored-linters content))
                   #(vector side :ignore %)))

    :else
    {}))

(def ^:private tallied
  "The [[tallies]] so far in this run, so that windows that share a blob scan it once."
  (atom {}))

(defn- tallies
  "What each blob in `files`, the files some commits changed, adds to each measure's actual count.
  Returns a map from blob sha to path to [[counts]], or to `::unreadable` when the blob does not parse at that
  path. Only the counts are kept, since a window can change far more source than fits in memory."
  [files]
  (let [paths   (reduce (fn [acc {:keys [path old new]}]
                          (-> acc
                              (update old (fnil conj #{}) path)
                              (update new (fnil conj #{}) path)))
                        {}
                        files)
        seen    @tallied
        pending (for [[sha at] (dissoc paths no-blob)
                      :when    (not-every? (get seen sha {}) at)]
                  sha)
        tally   (fn [sha content]
                  (into {}
                        (for [path (paths sha)]
                          [path (try
                                  (counts path content)
                                  (catch Exception _
                                    ::unreadable))])))]
    (swap! tallied #(merge-with merge % (into {} (mapcat (partial blobs tally)) (partition-all 500 pending))))))

(defn actual-delta
  "How far `commit` moved each measure's actual count, from the [[tallies]] of its files.
  A file that cannot be read on both sides counts nothing."
  [tallies commit]
  (apply merge-with + {}
         (for [{:keys [path old new]} (:files commit)
               :let  [before (get-in tallies [old path] {})
                      after  (get-in tallies [new path] {})]
               :when (not-any? #{::unreadable} [before after])]
           (subtract after before))))

(defn- load-window
  "The commits after `boundary` up to `sha`, newest first, that could have moved an actual count or a budget.
  Returns them as `:commits`, with `:actual`, a function from one of them to how far it moved each actual count."
  [boundary sha]
  (let [counted? (some-fn source-file? ratchet-paths #{kondo-config-file module-config-file})
        commits  (mapv (fn [commit] (update commit :files #(filterv (comp counted? :path) %)))
                       (apply log (str boundary ".." sha) "--"
                              (concat ratchet/source-roots [kondo-config-file module-config-file] ratchet-paths)))
        by-blob  (tallies (mapcat :files commits))]
    {:boundary boundary
     :commits  commits
     :actual   (memoize #(actual-delta by-blob %))}))

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
        ratchet? (fn [commit] (some ratchet-paths (map :path (:files commit))))
        ;; commits older than the one that split test budgets out are viewed merged, like that commit itself
        split    (first (keep-indexed (fn [i commit]
                                        (when (and (ratchet? commit) (:merged? (commit-view (:sha commit))))
                                          i))
                                      commits))
        split?   (some? (:test (budgets-at sha)))
        seeded   (seeded-budgets changes)]
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

;;; -------------------------------------------------- Verdicts ------------------------------------------------

(def ^:private uncounted-linters
  "Linters whose suppressions say nothing about the code, each with the reason. Their budgets are left out."
  {:metabase/prefer-with-dynamic-fn-redefs "Ignoring it works around a bug in the linter itself."})

(def ^:private verdicts-file
  "Verdicts on commits, relative to the repo root. [[verdict!]] writes it."
  "mage/resources/kondo-ratchets-verdicts.edn")

(def ^:private verdicts-header
  [";; Verdicts on the budget raises `./bin/mage kondo-ratchets-history` questions: a raise beyond the"
   ";; suppressions its commit added. A :pardon counts the commit's raises against nobody; a :confirm keeps them."
   ";; A :recount marks a commit that only changed how suppressions are counted: none of its changes count."
   ";; Written by `./bin/mage kondo-ratchets-history --pardon`, `--confirm` and `--recount`."])

(defn- read-verdicts []
  (let [file (fs/file u/project-root-directory verdicts-file)]
    (if (fs/exists? file)
      (edn/read-string (slurp file))
      [])))

(defn render-verdicts
  "The text of [[verdicts-file]] holding `verdicts`: a vector of maps, one key per line."
  [verdicts]
  (let [entry (fn [verdict]
                (str "{"
                     (str/join "\n  "
                               (for [k     [:sha :pr :subject :verdict :why]
                                     :when (some? (get verdict k))]
                                 (format "%-8s %s" k (pr-str (get verdict k)))))
                     "}"))]
    (str (str/join "\n" verdicts-header)
         "\n["
         (str/join "\n " (map entry verdicts))
         "]\n")))

(defn- covered-kinds
  "The kinds of change that a verdict of `kind` is about."
  [kind]
  (if (= :recount kind)
    #{:grow :shrink}
    #{:grow}))

(defn suspects
  "The commits in `records` not in `settled` that raised a budget beyond the suppressions they added.
  Each keeps only those raises as its `:changes`."
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

(defn- split-causes
  "The `causes` of the shrinks in commit `sha`, per measure, split in two.
  `:returned` is how much of them only takes back a pardoned raise of another commit: up to the size of that
  raise in `pardons`, or the whole cause when the commit is one that `recount?` holds for.
  `:kept` holds the causes with what is left of each."
  [pardons recount? sha causes]
  (into {}
        (for [[measure entries] causes]
          [measure (reduce (fn [acc {cause :sha, :keys [delta], :as entry}]
                             (let [raise    (when (not= sha cause) (get-in pardons [cause measure]))
                                   returned (cond
                                              (nil? raise)     0
                                              (recount? cause) delta
                                              ;; what the commit removed beyond its own raise is a real improvement
                                              :else            (min 0 (max delta (- raise))))
                                   left     (- delta returned)]
                               (cond-> (update acc :returned + returned)
                                 (not (zero? left)) (update :kept conj (assoc entry :delta left)))))
                           {:returned 0, :kept []}
                           entries)])))

(defn pardon
  "`records` with the verdicts applied.
  A raise in `pardons`, a map from commit to measure to the size of the raise, turns from `:grow` into `:pardon`.
  A shrink loses the part that only takes a pardoned raise back, and the credit for it.
  A commit in `recounts` only changed how suppressions are counted, so its own shrinks go too."
  [{:keys [pardons recounts]} records]
  (let [recount? (or recounts #{})]
    (for [{:keys [sha causes], :as record} records
          :let [split  (split-causes pardons recount? sha causes)
                settle (fn [{:keys [kind measure delta], :as change}]
                         (case kind
                           :grow   (cond-> change (get-in pardons [sha measure]) (assoc :kind :pardon))
                           :shrink (let [delta (- delta (get-in split [measure :returned] 0))]
                                     (when-not (or (recount? sha) (zero? delta))
                                       (assoc change :delta delta :kind (if (neg? delta) :shrink :grow))))
                           change))]]
      (cond-> (update record :changes #(keep settle %))
        causes (assoc :causes (update-vals split :kept))))))

(defn counted
  "`records` without the changes to budgets of [[uncounted-linters]], and without the commits that leaves empty."
  [records]
  (->> records
       (map (fn [record]
              (update record :changes (partial remove (comp uncounted-linters peek :measure)))))
       (filter (comp seq :changes))))

;;; -------------------------------------------------- Report --------------------------------------------------

(defn- instant ^Instant [date]
  (.toInstant (OffsetDateTime/parse date)))

(defn unify-authors
  "`records` with one name per person.
  Every commit, and every cause of a shrink, whose author email matches takes the author name of the newest of
  them. Commits under one name already count as one person."
  [records]
  (let [newest (reduce (fn [acc {:keys [email author date]}]
                         (cond-> acc
                           ;; committer dates carry offsets, so compare them as instants, not as text
                           (and email (.isBefore ^Instant (get-in acc [email :at] Instant/MIN) (instant date)))
                           (assoc email {:at (instant date), :author author})))
                       {}
                       (concat records (mapcat #(apply concat (vals (:causes %))) records)))
        rename (fn [{:keys [email], :as commit}]
                 (cond-> commit (newest email) (assoc :author (:author (newest email)))))]
    (for [record records]
      (cond-> (rename record)
        (:causes record) (update :causes update-vals #(mapv rename %))))))

(defn attributions
  "One entry per commit and measure it is responsible for moving, across `records`.
  An entry is the commit's `:sha`, `:author`, `:pr` and `:subject`, with the `:measure` and its `:delta`.
  A grow belongs to the commit that raised the budget and a shrink to its causes.
  A grow that has causes was a shrink before a pardoned raise was taken out of it, and belongs to them too.
  The unexplained part of a shrink belongs to the shrinking commit too.
  When that commit only lowered budgets, the entry is `:unattributed?` and has no `:author`."
  [records]
  (for [{:keys [changes causes unaccounted tighten?], :as record} records
        :let  [commit (dissoc record :changes :causes :unaccounted :tighten? :email)]
        {:keys [kind measure delta]} changes
        :when (#{:shrink :grow} kind)
        :let  [explained (concat (get causes measure)
                                 (when-let [left (get unaccounted measure)]
                                   [(cond-> (assoc commit :delta left)
                                      tighten? (assoc :author nil :unattributed? true))]))]
        ;; a shrink can turn into a net raise once a pardoned raise is taken out of it, and keeps its causes
        entry (if (and (= kind :grow) (empty? explained))
                [(assoc commit :delta delta)]
                explained)]
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
  (->> (remove :unattributed? entries)
       (group-by :sha)
       (map (fn [[_ entries]]
              (assoc (dissoc (first entries) :measure :delta)
                     :net      (reduce + (map :delta entries))
                     :measures (update-vals (group-by :measure entries) #(reduce + (map :delta %))))))
       (sort-by (juxt :net :sha))))

(defn leaderboard
  "One row per author across `records`, in author order.
  A row holds how far they `:shrunk` and `:grown` budgets and the `:net` of the two, and the `:linters` they
  introduced with the `:ignores` those started with.
  A newly discouraged symbol counts as a linter: it is a new rule with its own budget.
  A linter that starts with more ignores was the bigger one to land, and an `:unlimited` one counts none.
  The row for what no commit explains is `:unattributed?` and has no `:author`."
  [records]
  (let [blank      {:shrunk  0
                    :grown   0
                    :net     0
                    :linters 0
                    :ignores 0}
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
         (map (fn [[author row]]
                (cond-> (merge blank row {:author author})
                  (nil? author) (assoc :unattributed? true))))
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

(defn- commit-ref [commit]
  (select-keys commit [:sha :pr :author :subject :date]))

(defn- named-deltas
  "The entries of `by-measure`, a map from measure to delta, largest change first, with the measure named."
  [by-measure]
  (for [[measure delta] (sort-by (juxt (comp - abs val) (comp str key)) by-measure)]
    {:measure (measure-name measure), :delta delta}))

(defn- by-kind
  "The commits in `records` that made a change of one of `kinds`, each with `describe` of those changes as its
  `:items`."
  [records kinds describe]
  (for [record records
        :let   [changes (filter (comp kinds :kind) (:changes record))]
        :when  (seq changes)]
    {:commit (commit-ref record), :items (map describe changes)}))

(defn report
  "What `records` say once `verdicts` are applied, as plain data: measures are named and budgets are strings.
  `verdicts` holds `:pardons` and `:recounts` as [[pardon]] takes them, and `:settled`, every commit with a
  verdict.

  - `:commits` counts the commits that changed a counted budget.
  - `:totals` has a row of `:measure`, `:shrunk`, `:grown` and `:net` per measure, and `:total` their sums.
  - `:best` and `:worst` are the commits behind the largest net shrink and net raise, if any: the `:commit`,
    its `:net` and its `:measures`.
  - `:introduced`, `:unlimited`, `:unaccounted` and `:suspects` each list commits with `:items`: the new
    linters, the moves into or out of `:unlimited`, the shrinks of the automation that no commit explains, and
    the raises beyond the suppressions added that have no verdict.
  - `:board` is the [[leaderboard]]."
  [{:keys [settled], :as verdicts} records]
  (let [doubted (suspects settled records)
        records (counted (pardon verdicts records))
        ranked  (by-commit (attributions records))
        biggest (fn [{:keys [net measures], :as entry}]
                  {:commit (commit-ref entry), :net net, :measures (named-deltas measures)})
        rows    (->> (totals records)
                     (map (fn [[measure {:keys [shrink grow] :or {shrink 0, grow 0}}]]
                            {:measure (measure-name measure)
                             :shrunk  shrink
                             :grown   grow
                             :net     (+ shrink grow)}))
                     (sort-by (juxt :net :measure)))]
    {:commits     (count records)
     :totals      rows
     :total       (into {} (for [k [:shrunk :grown :net]] [k (reduce + (map k rows))]))
     :best        (when (some-> (first ranked) :net neg?) (biggest (first ranked)))
     :worst       (when (some-> (last ranked) :net pos?) (biggest (last ranked)))
     :introduced  (by-kind records #{:introduce}
                           (fn [{:keys [measure key new]}]
                             {:measure (str (measure-name measure) (when key (str " " (subs (str key) 1))))
                              :budget  (budget-name new)}))
     :unlimited   (by-kind records #{:limit :unlimit}
                           (fn [{:keys [measure old new]}]
                             {:measure (measure-name measure), :old (budget-name old), :new (budget-name new)}))
     :board       (leaderboard records)
     :unaccounted (for [{:keys [unaccounted tighten?], :as record} records
                        :when (and tighten? (seq unaccounted))]
                    {:commit (commit-ref record), :items (named-deltas unaccounted)})
     :suspects    (for [record doubted]
                    {:commit (commit-ref record)
                     :items  (for [{:keys [measure delta added]} (:changes record)]
                               {:measure (measure-name measure), :delta delta, :added added})})}))

(defn series
  "One point per commit in `records`, which run newest first, in the order they landed.
  A point holds how far the commit `:shrunk` and `:grown` the counted budgets once `verdicts` are applied, as
  for [[report]], and the `:level` after it: the sum of every counted numeric budget."
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
                        (assoc (commit-ref record)
                               :shrunk (get-in moved [sha :shrink] 0)
                               :grown  (get-in moved [sha :grow] 0)
                               :level  (+ (:level point) (raised record))))
                      {:level 0}
                      (reverse records)))))

(defn- spans
  "The `[start end]` dates of each `unit`, newest first, from the one holding `today` back to the one holding
  `oldest`. `floor` moves a date to the start of its unit."
  [floor ^ChronoUnit unit oldest today]
  (let [first-start ^LocalDate (floor oldest)]
    (for [^LocalDate start (take-while #(not (.isBefore ^LocalDate % first-start))
                                       (iterate #(.minus ^LocalDate % 1 unit) (floor today)))]
      [start (.plus start 1 unit)])))

(defn periods
  "All time, then every week (from its Monday) and every calendar month from the first of `records` up to
  `today`, an ISO date, newest first.
  Each is a map of `:id`, `:kind`, `:label`, the `:from` date and the `:to` date it ends before, and the
  [[report]] of the records committed in it. `verdicts` are those [[report]] takes."
  [verdicts today records]
  (let [day    (fn [record] (LocalDate/parse (subs (:date record) 0 10)))
        today  (LocalDate/parse today)
        oldest (reduce (fn [^LocalDate a ^LocalDate b] (if (.isBefore b a) b a)) today (map day records))
        monday (fn [^LocalDate date] (.minusDays date (dec (.getValue (.getDayOfWeek date)))))
        month  (fn [^LocalDate date] (.withDayOfMonth date 1))
        text   (fn [pattern ^LocalDate date]
                 (.format (DateTimeFormatter/ofPattern pattern Locale/ENGLISH) date))
        within (fn [^LocalDate start ^LocalDate end]
                 (report verdicts
                         (filter (fn [record]
                                   (let [^LocalDate date (day record)]
                                     (and (not (.isBefore date start)) (.isBefore date end))))
                                 records)))]
    (concat
     [{:id "all", :kind "all", :label "All time", :report (report verdicts records)}]
     (for [[^LocalDate start end] (spans monday ChronoUnit/WEEKS oldest today)]
       {:id     (str "week-" start)
        :kind   "week"
        :label  (str (text "d MMM" start) " to " (text "d MMM yyyy" (.plusDays start 6)))
        :from   (str start)
        :to     (str end)
        :report (within start end)})
     (for [[start end] (spans month ChronoUnit/MONTHS oldest today)]
       {:id     (str "month-" (text "yyyy-MM" start))
        :kind   "month"
        :label  (text "MMMM yyyy" start)
        :from   (str start)
        :to     (str end)
        :report (within start end)}))))

(def ^:private page-template
  "The HTML page [[page]] fills in, relative to the repo root."
  "mage/resources/kondo-ratchets-history.html")

(defn script-json
  "`data` as JSON that is safe inside an HTML script element."
  [data]
  ;; a `<` can end the element or, as `<!--<script>`, stop its real end from being seen
  (str/replace (json/write-str data) "<" "\\u003c"))

(defn- page
  "The single-file HTML page showing `data`."
  [data]
  (str/replace (slurp (fs/file u/project-root-directory page-template)) "__DATA__" (script-json data)))

;;; ------------------------------------------------- Terminal -------------------------------------------------

(defn- signed [n]
  (if (zero? n) "0" (format "%+d" n)))

(defn- commit-line [{:keys [sha pr author subject]}]
  (str (subs sha 0 (min 10 (count sha))) (when pr (str " #" pr)) "  " author "  " (c/dark subject)))

(defn- author-name [{:keys [author]}]
  (or author "(unattributed)"))

(defn- table
  "Lines for `rows` of strings, the first of them the header.
  The first column is left-aligned and the rest right-aligned.
  `colors` holds, per column, a function from a cell below the header to its color function, or nil."
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

(defn- totals-lines [totals total]
  (when (seq totals)
    (let [cells (juxt (comp signed :shrunk) (comp signed :grown) (comp signed :net))]
      (table [nil (tint c/green) (tint c/red) net-tint]
             (concat [["" "shrunk" "grown" "net"]]
                     (for [row totals] (cons (:measure row) (cells row)))
                     [(cons "total" (cells total))])))))

(def ^:private biggest-shown 8)

(defn- biggest-lines
  "Lines for a `:best` or `:worst` of a [[report]]: the commit, its net change, then that change per linter.
  The linters past [[biggest-shown]] are summed."
  [{:keys [commit net measures]}]
  (let [[shown more] (split-at biggest-shown measures)
        width        (apply max (map (comp count signed :delta) measures))
        row          (fn [delta label]
                       (str "  " (colored-delta delta) (apply str (repeat (- width (count (signed delta))) " "))
                            "  " label))]
    (concat [(commit-line commit)
             (format "%s net, across %d linter%s:" (colored-delta net) (count measures)
                     (if (= 1 (count measures)) "" "s"))]
            (for [{:keys [measure delta]} shown]
              (row delta measure))
            (when (seq more)
              [(row (reduce + (map :delta more)) (format "%d more linters" (count more)))]))))

(defn- group-lines
  "Lines for `groups`, the commits of a [[report]] list: each commit, then `describe` of each of its `:items`."
  [groups describe]
  (for [{:keys [commit items]} groups
        line (cons (commit-line commit) (map #(str "  " (describe %)) items))]
    line))

(defn- suspect-lines [groups]
  (when (seq groups)
    (concat
     (for [{:keys [commit items]} groups
           line (cons (commit-line commit)
                      (if (< 5 (count items))
                        [(format "  %s over %d budgets, with %d suppressions added"
                                 (colored-delta (reduce + (map :delta items)))
                                 (count items)
                                 (reduce + (map :added items)))]
                        (for [{:keys [measure delta added]} items]
                          (format "  %s %s, with %d suppressions added" (colored-delta delta) measure added))))]
       line)
     ["Settle each with: ./bin/mage kondo-ratchets-history --pardon|--confirm <commit or PR> --why <reason>"])))

(def ^:private columns
  {:shrunk  {:header "shrunk", :key :shrunk, :show signed, :color (tint c/green)}
   :grown   {:header "grown", :key :grown, :show signed, :color (tint c/red)}
   :net     {:header "net", :key :net, :show signed, :color net-tint}
   :ignores {:header "ignores", :key :ignores, :show str, :color (tint c/green)}
   :linters {:header "linters", :key :linters, :show str, :color (tint c/green)}})

;; TODO (Chris 2026-10-10) -- also rank by team. The module config gives each module a `:team`, so a count could be
;; charged to the team that owns the file. People move between teams, so a ranking by author's team needs a
;; record of who was on which team when.
(def ^:private rankings
  "The author rankings of a [[summary]].
  `:order` gives a [[leaderboard]] row its rank, as a vector to sort by, or nil to leave the row out."
  [{:title   "Most shrunk"
    :order   (fn [{:keys [shrunk]}] (when (neg? shrunk) [shrunk]))
    :columns [:shrunk]}
   {:title   "Most grown"
    :order   (fn [{:keys [grown]}] (when (pos? grown) [(- grown)]))
    :columns [:grown]}
   {:title   "Net, from most shrunk to most grown"
    :order   (fn [{:keys [shrunk grown net]}] (when-not (= 0 shrunk grown) [net]))
    :columns [:shrunk :grown :net]}
   {:title   "Most introduced, by the ignores the new linters started with"
    :order   (fn [{:keys [linters ignores]}] (when (pos? linters) [(- ignores) (- linters)]))
    :columns [:ignores :linters]}])

(defn- ranking-lines
  "Table lines for one of the [[rankings]] of `board`, a [[leaderboard]]."
  [board {:keys [order], column-keys :columns}]
  (let [shown (map columns column-keys)]
    (when-let [rows (seq (sort-by (juxt order author-name) (filter order board)))]
      (table (into [nil] (map :color) shown)
             (cons (cons "" (map :header shown))
                   (for [row rows]
                     (cons (author-name row) (map (fn [{:keys [key show]}] (show (get row key))) shown))))))))

(defn summary
  "Lines for the terminal saying what `report` ([[report]]) holds, for the period called `period`."
  [period {:keys [commits totals total best worst introduced unlimited board unaccounted suspects]}]
  (concat
   [(c/bold (format "Ratchet changes %s: %d commits" period commits))]
   (section "Total deltas" (totals-lines totals total))
   (section "Biggest improvement" (some-> best biggest-lines))
   (section "Biggest regression" (some-> worst biggest-lines))
   (section "New linters"
            (group-lines introduced (fn [{:keys [measure budget]}]
                                      (c/green (str measure "  starting at " budget)))))
   (section "Moved into or out of :unlimited"
            (group-lines unlimited (fn [{:keys [measure old new]}]
                                     (str measure "  " old " -> " new))))
   (mapcat (fn [ranking] (section (:title ranking) (ranking-lines board ranking))) rankings)
   (section "Shrinks no commit accounts for"
            (group-lines unaccounted (fn [{:keys [measure delta]}]
                                       (str (signed delta) " " measure))))
   (section "Raises beyond the suppressions added, with no verdict" (suspect-lines suspects))))

;;; ---------------------------------------------------- Task --------------------------------------------------

(defn- resolve-commit [rev]
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "git" "rev-parse" "--verify" "--quiet" (str rev "^{commit}"))]
    (if (zero? exit)
      (first out)
      (u/exit (str "Not a commit: " rev) 1))))

(def ^:private default-days 7)

(defn request
  "What the task is asked to do, from its `since` commit and `options`.
  Returns `[:since sha]`, `[:all]` or `[:days n]` for a summary, `[:html file]` for the page of every period, or
  `[:verdict [kind target]]` to record a verdict.
  Exits when more than one is asked for, or when `--why` comes without a verdict."
  [since {:keys [all days html pardon confirm recount why]}]
  (let [asked (cond-> []
                since   (conj "a commit")
                all     (conj "--all")
                days    (conj "--days")
                html    (conj "--html")
                pardon  (conj "--pardon")
                confirm (conj "--confirm")
                recount (conj "--recount"))]
    (when (next asked)
      (u/exit (str "Give only one of " (str/join ", " asked) ".") 1))
    (when (and why (not (or pardon confirm recount)))
      (u/exit "Give --why only with --pardon, --confirm or --recount." 1))
    (cond
      since   [:since since]
      pardon  [:verdict [:pardon pardon]]
      confirm [:verdict [:confirm confirm]]
      recount [:verdict [:recount recount]]
      html    [:html html]
      all     [:all]
      :else   [:days (or days default-days)])))

(defn- ratchet-commit
  "The sha in `all`, the commits that changed a ratchet file, that `target` names.
  A target is a commit, or a PR as `1234` or `#1234`. Exits when there is not exactly one."
  [all target]
  (if-let [pr (second (re-matches #"#?(\d{1,6})" target))]
    (let [found (for [line  (apply git "log" "--first-parent" "--format=%H %s" "HEAD" "--" ratchet-paths)
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
  the reason `why`.
  A `:pardon` counts the commit's budget raises against nobody and a `:confirm` keeps them as growth.
  A `:recount` says the commit only changed how suppressions are counted, so neither its raises nor its own
  shrinks count."
  [kind target why]
  (let [all     (ratchet-commits (resolve-commit "HEAD"))
        sha     (ratchet-commit all target)
        record  (record! all sha)
        changes (filter (comp (covered-kinds kind) :kind) (:changes record))
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

(defn- verdict-options
  "The verdicts [[report]] takes, from the `entries` of [[verdicts-file]]. `record` gives the record of a sha."
  [entries record]
  {:settled  (set (map :sha entries))
   :recounts (set (map :sha (filter #(= :recount (:verdict %)) entries)))
   :pardons  (into {}
                   (for [{:keys [sha verdict]} entries
                         :when (#{:pardon :recount} verdict)]
                     [sha (into {}
                                (for [{:keys [kind measure delta]} (:changes (record sha))
                                      :when (= :grow kind)]
                                  [measure delta]))]))})

(defn- rulings
  "The `entries` of [[verdicts-file]] for the page: each commit, its verdict and reason, and the changes the
  verdict is about. `record` gives the record of a sha."
  [entries record]
  (for [{:keys [sha verdict why]} entries
        :let [commit (record sha)]]
    {:commit  (commit-ref commit)
     :verdict (name verdict)
     :why     why
     :raises  (for [{:keys [kind measure delta]} (:changes commit)
                    :when (contains? (covered-kinds verdict) kind)]
                {:measure (measure-name measure), :delta delta})}))

(defn- repo-url
  "The https URL of the repo on GitHub, from its `origin` remote."
  []
  (-> (first (git "remote" "get-url" "origin"))
      (str/replace #"^git@github\.com:" "https://github.com/")
      (str/replace #"\.git$" "")))

(defn- backfill!
  "Analyse and cache the commits in `all` after `resume`, or all of them when it is nil, up to `head`."
  [all head resume]
  (let [pending (remove cached (if resume (ratchet-commits (str resume ".." head)) all))]
    (when (seq pending)
      (println (c/dark (format "Analysing %d commits that changed a ratchet file" (count pending)))))
    (doseq [sha pending]
      (println (c/dark (str "  " (commit-line (record! all sha))))))
    (remember-tip! head)))

(defn- summarize
  "Bring the cache up to `HEAD`, then print or write what `by` and `arg`, from [[request]], ask for."
  [by arg]
  (let [head    (resolve-commit "HEAD")
        all     (ratchet-commits head)
        record  #(record! all %)
        entries (filter (comp (set all) :sha) (read-verdicts))]
    (backfill! all head (case by
                          :since       arg
                          (:all :html) nil
                          :days        (last-analysed head)))
    (let [verdicts (verdict-options entries record)
          ;; the period can reach behind the commit the backfill resumed from, to commits no run has analysed yet
          records  (unify-authors
                    (mapv record (case by
                                   :since       (ratchet-commits (str arg ".." head))
                                   (:all :html) all
                                   :days        (ratchet-commits (format "--since=%d.days.ago" arg) head))))]
      (if (= :html by)
        (let [today (str (LocalDate/now))]
          (spit arg (page {:repo      (repo-url)
                           :generated today
                           :series    (series verdicts records)
                           :verdicts  (rulings entries record)
                           :excluded  (for [[linter why] uncounted-linters]
                                        {:linter (str linter), :why why})
                           :periods   (periods verdicts today records)}))
          (println "Wrote" arg))
        (run! println (summary (case by
                                 :since (str "since " (subs arg 0 10))
                                 :all   "of all time"
                                 :days  (format "in the last %d days" arg))
                               (report verdicts records)))))))

(defn history
  "Bring the cache up to `HEAD`, then print a [[summary]] of the ratchet changes since the commit given as the
  first argument, over all time with `--all`, or else over the last `--days` days.
  With `--html`, write the [[page]] of every week, every month and all time to that file instead.
  With `--pardon`, `--confirm` or `--recount`, record that [[verdict!]] on a commit and print nothing else."
  [{:keys [options arguments]}]
  (let [[by arg] (request (some-> (first arguments) resolve-commit) options)]
    (if (= :verdict by)
      (verdict! (first arg) (second arg) (:why options))
      (summarize by arg))))
