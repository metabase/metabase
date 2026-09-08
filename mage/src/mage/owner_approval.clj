(ns mage.owner-approval
  "Audit whether merged PRs were approved by a member of every module-owner team, point-in-time.

  For each squash-merge PR commit back to `default-boundary-sha`, ownership and membership are read from
  git at that commit (no checkout): changed files resolve to modules via `config.edn@commit`, modules to
  `:team`, teams to members via `team.json@commit`. The PR's approver logins (fetched once, cached) then
  say which owner teams signed off. Results go to a wide CSV for upload to Metabase; a second command
  renders an HTML summary."
  (:require
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.modules :as modules]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def default-boundary-sha
  "Default audit boundary: the earliest commit whose module config assigns files to owner teams."
  "b6dff656d7c705c90d45833bd92d69deb4c8f741")

(def ^:private repo "metabase/metabase")
(def ^:private config-path ".clj-kondo/config/modules/config.edn")
(def ^:private team-path ".github/team.json")

(def ^:private cache-dir ".mage-cache/owner-approval")
(def ^:private reviews-dir (str cache-dir "/reviews"))
(def ^:private report-csv (str cache-dir "/report.csv"))
(def ^:private report-html (str cache-dir "/report.html"))

;; Increment whenever the cached review shape or fetch semantics change. In particular, version 1 records
;; distinguish genuine missing PRs from the false `:missing` entries the old, permissive fetch path could
;; write after a failed GraphQL request.
(def ^:private review-cache-version 1)

;;;; =============================================================================
;;;; git plumbing (blob reads, no checkout)
;;;; =============================================================================

(defn- git-lines [& args]
  (let [{:keys [exit out err]} (apply shell/sh* {:quiet? true} "git" args)]
    (when-not (zero? exit)
      (throw (ex-info (str "git " (str/join " " args) " failed") {:err err})))
    out))

(defn- git-str [& args]
  (str/join "\n" (apply git-lines args)))

(def ^:private read-config-blob
  "Parse a config.edn blob (by blob sha) to its `:metabase/modules` map. Memoized: the window holds only a
  handful of distinct versions."
  (memoize
   (fn [blob-sha]
     (:metabase/modules (edn/read-string (git-str "cat-file" "-p" blob-sha))))))

(def ^:private read-team-blob
  "Parse a team.json blob (by blob sha) to `{team-name #{member-login ...}}`. Memoized."
  (memoize
   (fn [blob-sha]
     (into {}
           (map (fn [t] [(:name t) (set (:members t))]))
           (:teams (json/parse-string (git-str "cat-file" "-p" blob-sha) true))))))

;;;; =============================================================================
;;;; PR commit list with point-in-time ownership/membership blobs
;;;; =============================================================================

(def ^:private pr-number-re #"\(#(\d+)\)$")

(defn- pr-commits
  "Squash-merge PR commits in `(boundary, ref]`, oldest→newest, each tagged with the config.edn and
  team.json blob shas in effect at that commit. One `git log --name-only` walk plus a `rev-parse` only
  when those files actually change."
  [ref boundary]
  (let [record-sep ""
        field-sep  ""
        out        (git-str "log" "--reverse" (str boundary ".." ref)
                            (str "--format=" record-sep "%H" field-sep "%ct" field-sep "%s")
                            "--name-only")
        seed-cfg   (git-str "rev-parse" (str boundary ":" config-path))
        seed-team  (git-str "rev-parse" (str boundary ":" team-path))]
    (loop [records (rest (str/split out (re-pattern record-sep)))
           cfg     seed-cfg
           team    seed-team
           acc     (transient [])]
      (if-let [rec (first records)]
        (let [[header & file-lines] (str/split-lines rec)
              [sha ct subject]      (str/split header (re-pattern field-sep))
              files                 (into #{} (remove str/blank?) file-lines)
              cfg'                  (if (files config-path) (git-str "rev-parse" (str sha ":" config-path)) cfg)
              team'                 (if (files team-path) (git-str "rev-parse" (str sha ":" team-path)) team)
              pr                    (some-> (re-find pr-number-re subject) second parse-long)]
          (recur (rest records) cfg' team'
                 (cond-> acc
                   pr (conj! {:sha sha
                              :ct (parse-long ct)
                              :subject subject
                              :pr pr
                              :files files
                              :config-blob cfg'
                              :team-blob team'}))))
        (persistent! acc)))))

;;;; =============================================================================
;;;; ownership resolution (pure, over parsed blobs)
;;;; =============================================================================

(def ^:private build-prefix->module @#'modules/build-prefix->module)
(def ^:private file->module @#'modules/file->module)
(def ^:private module->src-path-prefix @#'modules/module->src-path-prefix)

(defn- file-owner-teams
  "Per-file owner team for `files`, dropping files outside any module (frontend, docs, config). One entry
  per owned file, so `set` gives the required teams and `count` the owned-file total."
  [modules-config files]
  (let [prefix->module (build-prefix->module modules-config)]
    (keep (fn [f]
            (:team (get modules-config (file->module prefix->module f))))
          files)))

(defn- approving-teams
  "Subset of `required` teams with at least one member among `approver-logins`."
  [team->members required approver-logins]
  (into (sorted-set)
        (filter (fn [team]
                  (boolean (some approver-logins (team->members team)))))
        required))

;;;; =============================================================================
;;;; PR reviews (GitHub GraphQL, batched + cached)
;;;; =============================================================================

(defn- review-cache-file [pr]
  (io/file (str reviews-dir "/" pr ".json")))

(defn- valid-cached-review?
  [review]
  (and (= review-cache-version (:cache-version review))
       (int? (:pr review))
       (or (true? (:missing review))
           (and (int? (:n-reviews review))
                (not (neg? (:n-reviews review)))
                (sequential? (:approvers review))))))

(defn- cached-review [pr]
  (let [f (review-cache-file pr)]
    (when (.isFile f)
      (try
        (let [review (json/parse-string (slurp f) true)]
          (when (valid-cached-review? review)
            review))
        (catch Exception _
          nil)))))

(defn- graphql-query [prs]
  (str "query{repository(owner:\"" (first (str/split repo #"/")) "\",name:\""
       (second (str/split repo #"/")) "\"){"
       (str/join
        (for [n prs]
          (format "pr%d:pullRequest(number:%d){number author{login} mergedAt reviews(first:100){totalCount nodes{state author{login}}}}"
                  n n)))
       "}}"))

(def ^:private reviews-page-size
  "GraphQL caps a reviews page at 100. A PR with more reviews than this has its tail unread; we surface
  that per PR rather than paginating, since PRs with 100+ reviews are vanishingly rare here."
  100)

(defn- parse-pr-node
  "Reduce a GraphQL pullRequest node to `{:pr :author :merged-at :n-reviews :approvers}` (approvers = set of
  logins with an APPROVED review). `nil` when the node is null (number wasn't a PR)."
  [node]
  (when node
    {:pr        (:number node)
     :author    (get-in node [:author :login])
     :merged-at (:mergedAt node)
     :n-reviews (get-in node [:reviews :totalCount])
     :approvers (into #{}
                      (keep (fn [r] (when (= "APPROVED" (:state r)) (get-in r [:author :login]))))
                      (get-in node [:reviews :nodes]))}))

(defn- fetch-fatal-errors
  "Errors that mean the whole request failed, or nil when the response is usable.

  `nil` `by-pr` means no repository came back at all. Otherwise only errors whose `:type` is not
  `NOT_FOUND` are fatal: GitHub answers with partial data, and `gh` exits non-zero, when one queried
  number doesn't resolve to a live PR, and those nodes are legitimately `:missing`. Pure so the
  classification can be tested without shelling out; treating a benign `NOT_FOUND` as fatal is what
  previously wedged the audit."
  [by-pr errors]
  (cond
    (nil? by-pr) (or (seq errors) [{:type "NO_REPOSITORY"}])
    :else        (seq (remove #(= "NOT_FOUND" (:type %)) errors))))

(defn- fetch-batch!
  "Fetch reviews for a batch of PR numbers via one GraphQL call, writing each to the cache. Throws when
  the request failed as a whole, so a transient failure can't poison the cache with false `:missing`
  entries; existing cache files are left untouched. Warns per PR whose review count exceeds the page
  size, since its later approvals may be unread.

  A `NOT_FOUND` entry in `:errors` is not a failed request. GitHub answers with partial data, and `gh`
  exits non-zero, when one queried number doesn't resolve to a live PR: a deleted or transferred PR, or
  a subject whose trailing `(#N)` was never a PR number. Treating that as fatal threw before any of the
  batch reached the cache, and because only uncached PRs are re-fetched, every later run hit the same
  batch and threw again, wedging the audit for that range with no way to make progress. Such nodes come
  back null and become `{:missing true}` below, which is the honest answer. Exit status alone is not a
  signal either, since `gh` returns non-zero for exactly this benign case."
  [prs]
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "gh" "api" "graphql" "-f" (str "query=" (graphql-query prs)))
        body   (json/parse-string (str/join "\n" out) true)
        by-pr  (get-in body [:data :repository])]
    (when-let [fatal (fetch-fatal-errors by-pr (:errors body))]
      (throw (ex-info "GraphQL review fetch failed; leaving cache untouched"
                      {:exit exit, :errors (vec fatal), :prs (vec prs)})))
    (doseq [n prs
            :let [node (get by-pr (keyword (str "pr" n)))
                  data (assoc (or (parse-pr-node node) {:pr n :missing true})
                              :cache-version review-cache-version)]]
      (when (< reviews-page-size (or (:n-reviews data) 0))
        (println (c/yellow (format "warning: PR #%d has %d reviews; only the first %d were read, later approvals may be missed"
                                   n (:n-reviews data) reviews-page-size))))
      (io/make-parents (review-cache-file n))
      (spit (review-cache-file n) (json/generate-string data)))
    (count prs)))

(defn- ensure-reviews!
  "Fetch and cache reviews for every PR without a valid current-version cache record. Returns nothing."
  [prs batch-size]
  (let [uncached (remove cached-review prs)]
    (when (seq uncached)
      (println (format "Fetching reviews for %s PRs (%s cached)..."
                       (c/yellow (count uncached)) (c/green (- (count prs) (count uncached)))))
      (let [batches (partition-all batch-size uncached)
            done    (atom 0)]
        (doseq [batch batches]
          (fetch-batch! batch)
          (swap! done + (count batch))
          (print (format "\r  %s/%s" @done (count uncached)))
          (flush))
        (println)))))

;;;; =============================================================================
;;;; report rows + CSV
;;;; =============================================================================

(defn- pr-row
  "One report map for a PR commit, joining its point-in-time ownership with its cached approvers."
  [{:keys [pr sha ct files config-blob team-blob]} captured-at]
  (let [review         (or (cached-review pr) {})
        modules-config (read-config-blob config-blob)
        team->members  (read-team-blob team-blob)
        teams-per-file (file-owner-teams modules-config files)
        required-all   (into (sorted-set) teams-per-file)
        ;; A required team is "known" only if team.json@commit resolves it to members. Teams it can't
        ;; resolve (renamed, not yet added) are unknown — we can't say whether they approved, so they get
        ;; their own bucket instead of counting as a missed approval.
        known          (into (sorted-set) (filter (comp seq team->members)) required-all)
        unknown        (into (sorted-set) (remove (comp seq team->members)) required-all)
        owned-files    (count teams-per-file)
        approvers      (set (:approvers review))
        approving      (approving-teams team->members known approvers)
        missing        (into (sorted-set) (remove approving) known)
        status         (cond
                         (empty? required-all) "no-owner"
                         (empty? known)        "n/a"
                         (empty? missing)      "full"
                         (empty? approving)    "none"
                         :else                 "partial")]
    {:pr pr
     :sha sha
     :merged_at (or (:merged-at review) (str (java.time.Instant/ofEpochSecond ct)))
     :author (:author review)
     :n_files (count files)
     :n_owned_files owned-files
     :required_teams (str/join ";" known)
     :n_required (count known)
     :approving_teams (str/join ";" approving)
     :n_approving (count approving)
     :missing_teams (str/join ";" missing)
     :n_missing (count missing)
     :unknown_teams (str/join ";" unknown)
     :n_unknown (count unknown)
     :status status
     :approver_logins (str/join ";" (sort approvers))
     :captured_at captured-at
     :config_blob (subs config-blob 0 12)
     :team_blob (subs team-blob 0 12)}))

(def ^:private csv-columns
  [:pr :sha :merged_at :author :n_files :n_owned_files :required_teams :n_required
   :approving_teams :n_approving :missing_teams :n_missing :unknown_teams :n_unknown
   :status :approver_logins :captured_at :config_blob :team_blob])

(defn- csv-cell [v]
  (let [s (str v)]
    (if (re-find #"[\",\n]" s)
      (str \" (str/replace s "\"" "\"\"") \")
      s)))

(defn- write-csv! [rows]
  (io/make-parents report-csv)
  (with-open [w (io/writer report-csv)]
    (.write w (str (str/join "," (map name csv-columns)) "\n"))
    (doseq [row rows]
      (.write w (str (str/join "," (map (comp csv-cell row) csv-columns)) "\n")))))

;;;; =============================================================================
;;;; commands
;;;; =============================================================================

(defn cli-audit
  "Walk merged PRs back to the boundary (or `N` commits, or `--back-to SHA`), resolve point-in-time owner
  approval, and write the report CSV."
  [cli-args]
  (let [{:keys [options arguments]} cli-args
        ref        (or (:ref options) "origin/master")
        boundary   (or (:back-to options) default-boundary-sha)
        limit      (some-> (first arguments) parse-long)
        batch-size (or (some-> (:batch options) parse-long) 50)
        captured   (str (java.time.Instant/now))
        _          (println (format "Collecting PR commits on %s back to %s..." (c/cyan ref) (c/cyan (subs boundary 0 12))))
        commits    (cond->> (pr-commits ref boundary)
                     limit (take-last limit))
        _          (println (format "%s PR commits." (c/green (count commits))))]
    (ensure-reviews! (map :pr commits) batch-size)
    (let [rows (map #(pr-row % captured) commits)]
      (write-csv! rows)
      (let [by-status (frequencies (map :status rows))]
        (println)
        (doseq [s ["full" "partial" "none" "n/a" "no-owner"]]
          (println (format "  %-9s %s" s (get by-status s 0))))
        (println (str "\nWrote " (c/green report-csv))))
      (u/exit 0))))

(defn- pct [n d] (if (zero? d) 0.0 (* 100.0 (/ (double n) d))))

(defn- bar [label n total color-fn]
  (let [width 40
        filled (int (Math/round (* width (/ (double n) (max 1 total)))))]
    (format "%-9s %s%s %s (%.1f%%)"
            label (color-fn (apply str (repeat filled "█")))
            (apply str (repeat (- width filled) " ")) n (pct n total))))

(defn- read-csv-rows []
  (let [lines (str/split-lines (slurp report-csv))
        header (map keyword (str/split (first lines) #","))]
    (for [line (rest lines) :when (seq line)]
      (zipmap header (str/split line #"," -1)))))

(defn- split-teams [s] (if (str/blank? s) [] (str/split s #";")))

(def ^:private unassessable-statuses
  "Statuses that mean we could not judge the PR at all, rather than a judgement of poor. Both the
  `assessable` row filter and the assessable rail/chart derive from this, so the two cannot drift."
  #{"no-owner" "n/a"})

(defn- assessable
  "Rows we could actually judge: they have an owner team whose membership was known at merge."
  [rows]
  (remove #(unassessable-statuses (:status %)) rows))

;;; Every status, in stacking order (green at the bottom, no-owner grey on top), with its color.
(def ^:private status-cats
  [["full" "#30a46c"] ["partial" "#f5a623"] ["none" "#e5484d"] ["n/a" "#8b8d98"] ["no-owner" "#d0d3d9"]])

(defn- monthly-stats
  "Ordered `[[month {status count ... :total n}] ...]` over all `rows`, keyed by status string."
  [rows]
  (->> rows
       (group-by #(subs (:merged_at %) 0 7))
       (sort-by key)
       (map (fn [[month rs]]
              [month (assoc (frequencies (map :status rs)) :total (count rs))]))))

(defn- team-stats
  "Per required-team `[[team {:required n :approved n}] ...]`, sorted by required desc."
  [owner-rows]
  (->> owner-rows
       (mapcat (fn [r]
                 (let [approving (set (split-teams (:approving_teams r)))]
                   (for [t (split-teams (:required_teams r))]
                     [t (contains? approving t)]))))
       (reduce (fn [acc [t approved?]]
                 (-> acc
                     (update-in [t :required] (fnil inc 0))
                     (update-in [t :approved] (fnil + 0) (if approved? 1 0))))
               {})
       (sort-by (comp - :required val))))

(def ^:private no-team-label "(no team)")

(def ^:private read-team-assignees-blob
  "Parse a team.json blob (by blob sha) to `{team-name codeowners-handle}`, dropping teams without an
  `:assignee`. Memoized, like [[read-team-blob]]."
  (memoize
   (fn [blob-sha]
     (into {}
           (keep (fn [t] (when (:assignee t) [(:name t) (:assignee t)])))
           (:teams (json/parse-string (git-str "cat-file" "-p" blob-sha) true))))))

(defn- assignees-at
  "Team name => GitHub CODEOWNERS handle from team.json at `ref`. Read from the same ref as ownership and
  CODEOWNERS so the join can't skew against a dirty working tree. Teams without an assignee are absent."
  [ref]
  (read-team-assignees-blob (git-str "rev-parse" (str ref ":" team-path))))

(defn- codeowners-rules
  "Active CODEOWNERS entries at `ref` as `[normalized-path #{owner-handle ...}]`, sorted longest path first
  so the first ancestor match is the most specific — GitHub resolves a path to its last matching line, and
  for these prefix-style rules that is the deepest one. An entry with no owners (an exclusion line, path
  followed only by a comment) keeps an empty owner set, so a specific exclusion overrides a broad owner."
  [ref]
  (let [rules (->> (str/split-lines (git-str "show" (str ref ":.github/CODEOWNERS")))
                   (map str/trim)
                   (remove #(or (str/blank? %) (str/starts-with? % "#")))
                   (keep (fn [line]
                           (let [toks (str/split line #"\s+")
                                 path (-> (first toks) (str/replace #"^/" "") (str/replace #"/$" ""))
                                 owners (into #{}
                                              (comp (take-while #(not (str/starts-with? % "#")))
                                                    (filter #(str/starts-with? % "@")))
                                              (rest toks))]
                             (when (seq path) [path owners]))))
                   (sort-by (comp count first) >))
        globs (filter #(re-find #"[*?\[]" (first %)) rules)]
    ;; path-owners matches by directory prefix, so a glob rule (e.g. *.clj) would silently mis-resolve.
    ;; CODEOWNERS has none today; warn loudly if one ever lands rather than report a wrong number.
    (when (seq globs)
      (println (c/yellow (format "warning: %d CODEOWNERS rule(s) use glob patterns (e.g. %s) — path matching is prefix-only and will misresolve them"
                                 (count globs) (pr-str (ffirst globs))))))
    rules))

(defn- path-owners
  "Owner handles governing `path`: the owner set of its most specific ancestor-or-equal `rules` entry, or
  `nil` when no entry covers it. An empty set means a rule covers the path but assigns no owner."
  [rules path]
  (some (fn [[p owners]] (when (or (= p path) (str/starts-with? path (str p "/"))) owners)) rules))

(defn- enforced-for?
  "True when `path` is code-owned in a way that gates `team`'s review: for a real team, a covering rule
  names its CODEOWNERS `handle`; for `(no team)`, any owner at all counts (we don't care which team or
  whether it's an individual)."
  [rules path team handle]
  (let [owners (path-owners rules path)]
    (boolean (if (= team no-team-label)
               (seq owners)
               (and handle (contains? owners handle))))))

(def ^:private no-team-buckets
  "`[label pred]` in priority order for splitting the `(no team)` namespaces; first match wins, the last is
  the catch-all. Product code and drivers are the actionable gaps (code that should get an owner);
  everything else is tooling expected to stay ownerless."
  [["unmoduled backend" (fn [p] (or (re-find #"^(src|test)/metabase\b" p)
                                    (re-find #"^enterprise/backend/(src|test)/" p)))]
   ["drivers"           (fn [p] (str/starts-with? p "modules/"))]
   ["tooling & scripts" (constantly true)]])

(def ^:private actionable-no-team-buckets #{"unmoduled backend" "drivers"})

(defn- no-team-bucket
  "Label for a `(no team)` file `path`, the first matching [[no-team-buckets]] entry."
  [path]
  (some (fn [[label pred]] (when (pred path) label)) no-team-buckets))

(defn- ownership-stats
  "Current backend ownership at `ref`, resolved entirely from git (config.edn, team.json, CODEOWNERS, and
  the `git ls-tree` file list). Returns:

    :teams   `[[team {:handle :modules :enforced-modules :namespaces :enforced-namespaces}]]`, ns desc.
             `enforced-*` is the subset code-owned by that team's own CODEOWNERS handle, so a team with no
             `:handle` (team.json `:assignee`) enforces nothing.
    :no-team `[[bucket {:namespaces :enforced-namespaces :actionable?}]]`, ns desc — the namespaces in no
             module, split into product code / drivers (actionable) vs tooling. `enforced?` here is any
             owner at all.
    :summary rollups for the headline: owned vs enforced ns/modules, teams with no handle, and the
             actionable unowned-namespace count."
  [ref]
  (let [config          (read-config-blob (git-str "rev-parse" (str ref ":" config-path)))
        prefix->module  (build-prefix->module config)
        rules           (codeowners-rules ref)
        assignees       (assignees-at ref)
        team-of         (fn [f] (:team (get config (file->module prefix->module f))))
        clj-files       (filter #(re-find #"\.clj[cs]?$" %)
                                (git-lines "ls-tree" "-r" "--name-only" ref))
        {teamed true noteam false} (group-by (comp boolean team-of) clj-files)
        ns-by-team      (frequencies (map team-of teamed))
        enf-ns-by-team  (frequencies (keep (fn [f] (let [t (team-of f)]
                                                     (when (enforced-for? rules f t (get assignees t)) t)))
                                           teamed))
        modules-by-team (frequencies (keep (comp :team val) config))
        enf-mods-by-team (frequencies (keep (fn [[m cfg]]
                                              (let [t (:team cfg)]
                                                (when (enforced-for? rules (module->src-path-prefix config m)
                                                                     t (get assignees t))
                                                  t)))
                                            config))
        teams           (->> (into (set (keys ns-by-team)) (keys modules-by-team))
                             (map (fn [team] [team {:handle (get assignees team)
                                                    :modules (get modules-by-team team 0)
                                                    :enforced-modules (get enf-mods-by-team team 0)
                                                    :namespaces (get ns-by-team team 0)
                                                    :enforced-namespaces (get enf-ns-by-team team 0)}]))
                             (sort-by (comp - :namespaces second)))
        no-team         (->> (group-by no-team-bucket noteam)
                             (map (fn [[bucket fs]]
                                    [bucket {:namespaces (count fs)
                                             :enforced-namespaces (count (filter #(enforced-for? rules % no-team-label nil) fs))
                                             :actionable? (contains? actionable-no-team-buckets bucket)}]))
                             (sort-by (comp - :namespaces second)))
        sum             (fn [k rows] (reduce + (map (comp k second) rows)))
        no-handle       (filter (fn [[_ m]] (and (nil? (:handle m)) (pos? (:namespaces m)))) teams)]
    {:teams   teams
     :no-team no-team
     :summary {:owned-ns          (sum :namespaces teams)
               :enforced-ns       (sum :enforced-namespaces teams)
               :owned-mod         (reduce + (vals modules-by-team))
               :enforced-mod      (reduce + (vals enf-mods-by-team))
               :no-handle-teams   (count no-handle)
               :no-handle-ns      (sum :namespaces no-handle)
               :actionable-no-team-ns (sum :namespaces (filter (comp :actionable? second) no-team))}}))

(defn- h [s] (-> (str s) (str/replace "&" "&amp;") (str/replace "<" "&lt;") (str/replace ">" "&gt;")))

(defn- rail
  "A horizontal proportion bar plus legend for `counts` (status=>n) over `total`, using `cats` in order."
  [cats counts total]
  (str "<div class=rail>"
       (str/join (for [[k color] cats
                       :let [n (get counts k 0)]]
                   (format "<span class=seg style=\"width:%.3f%%;background:%s\" title=\"%s %s\"></span>"
                           (pct n total) color k n)))
       "</div><p class=legend>"
       (str/join (for [[k color] cats]
                   (format "<span><i class=sw style=\"background:%s\"></i>%s (%s, %.1f%%)</span>"
                           color (h k) (get counts k 0) (pct (get counts k 0) total))))
       "</p>"))

(defn- bars-cell
  "A right-aligned total plus a bar scaled to `max-v`: a red track spanning the whole owned count with the
  CODEOWNERS-enforced subset overlaid in green, so the red left showing through is the unenforced gap."
  [total enf max-v]
  (format "<td class=num>%s</td><td><div class=bars><span class=\"b gap\" style=\"width:%.1f%%\"></span><span class=\"b enf\" style=\"width:%.1f%%\" title=\"%s of %s enforced by CODEOWNERS\"></span></div></td>"
          total (pct total max-v) (pct enf max-v) enf total))

(defn- handle-cell [handle]
  (if handle
    (str "<span class=code>" (h (str/replace handle #"^@metabase/" "")) "</span>")
    "<span class=none>—</span>"))

(defn- ownership-table [teams]
  (let [max-mod (apply max 1 (map (comp :modules second) teams))
        max-ns  (apply max 1 (map (comp :namespaces second) teams))
        rows    (for [[team {:keys [handle modules enforced-modules namespaces enforced-namespaces]}] teams]
                  (str (format "<tr><td>%s</td><td>%s</td>" (h team) (handle-cell handle))
                       (bars-cell modules enforced-modules max-mod)
                       (bars-cell namespaces enforced-namespaces max-ns)
                       "</tr>"))]
    (str "<table><tr><th>Team</th><th>Assignee</th><th class=num>Modules</th><th></th><th class=num>Namespaces</th><th></th></tr>"
         (str/join rows) "</table>")))

(defn- gaps-table
  "Teams ranked by unenforced-namespace gap (owned minus enforced), largest first — the CODEOWNERS
  rollout's to-do list. Teams already fully enforced drop out."
  [teams]
  (let [rows (->> teams
                  (map (fn [[team {:keys [handle namespaces enforced-namespaces]}]]
                         {:team team :handle handle :owned namespaces :enf enforced-namespaces
                          :gap (- namespaces enforced-namespaces)}))
                  (filter (comp pos? :gap))
                  (sort-by (comp - :gap))
                  (take 8))]
    (str "<table><tr><th>Team</th><th>Assignee</th><th class=num>Owned</th><th class=num>Enforced</th><th class=num>Gap</th><th class=num>Covered</th></tr>"
         (str/join (for [{:keys [team handle owned enf gap]} rows]
                     (format "<tr><td>%s</td><td>%s</td><td class=num>%s</td><td class=num>%s</td><td class=num>%s</td><td class=num>%.0f%%</td></tr>"
                             (h team) (handle-cell handle) owned enf gap (pct enf owned))))
         "</table>")))

(defn- no-team-table
  "The `(no team)` namespaces split into buckets: product code and drivers that should get an owner vs
  tooling expected to stay ownerless. `Has owner` is the subset any CODEOWNERS handle already covers."
  [no-team]
  (str "<table><tr><th>Unowned bucket</th><th class=num>Namespaces</th><th class=num>Has owner</th><th></th></tr>"
       (str/join (for [[bucket {:keys [namespaces enforced-namespaces actionable?]}] no-team]
                   (format "<tr%s><td>%s</td><td class=num>%s</td><td class=num>%s</td><td>%s</td></tr>"
                           (if actionable? "" " class=noteam")
                           (h bucket) namespaces enforced-namespaces
                           (if actionable? "<span class=flag>needs an owner</span>" "<span class=none>tooling</span>"))))
       "</table>"))

(defn- month-chart
  "Stacked-proportion column per month. `cats` are the `[status color]` pairs to stack (bottom-up) and
  `total-of` yields each month's denominator, so the assessable view normalizes to just its statuses. The
  month total rides in the column's hover title and a caption under the axis label."
  [monthly cats total-of]
  (str "<div class=chart>"
       (str/join
        (for [[m stats] monthly
              :let [total (total-of stats)]]
          (str "<div class=col title=\"" m " — " total " PRs\"><div class=stack>"
               (str/join (for [[k color] cats]
                           (format "<div style=\"height:%.2f%%;background:%s\"></div>"
                                   (pct (get stats k 0) total) color)))
               "</div><div class=xlabel>" (subs m 2) "</div><div class=n>" total "</div></div>")))
       "</div>"))

(defn- render-html [rows ownership ref-desc]
  (let [n-total    (count rows)
        assess     (assessable rows)
        n-assess   (count assess)
        all-counts (frequencies (map :status rows))
        assess-cats (remove (comp unassessable-statuses first) status-cats)
        {:keys [teams no-team summary]} ownership
        {:keys [owned-ns enforced-ns owned-mod enforced-mod
                no-handle-teams no-handle-ns actionable-no-team-ns]} summary
        monthly    (monthly-stats rows)
        assess-total (fn [stats] (reduce + (map #(get stats (first %) 0) assess-cats)))
        team-rows  (for [[t {:keys [required approved]}] (team-stats assess)]
                     (format "<tr><td>%s</td><td class=num>%s</td><td class=num>%s</td><td class=num>%.0f%%</td><td class=barcell><span style=\"width:%.1f%%\"></span></td></tr>"
                             (h t) required approved (pct approved required) (pct approved required)))]
    (str "<!doctype html><meta charset=utf-8><title>Owner approval audit</title>
<style>
 body{font:14px/1.5 -apple-system,system-ui,sans-serif;max-width:920px;margin:2rem auto;padding:0 1rem;color:#1a1a1a}
 h1{font-size:20px} h2{font-size:15px;margin-top:2rem;color:#444}
 .meta{color:#888;font-size:12px} .meta b{color:#555;font-weight:600}
 .note{color:#999;font-size:12px;margin:.35rem 0 0} .note b{color:#666}
 .rail{display:flex;height:26px;border-radius:5px;overflow:hidden;margin:.5rem 0}
 .seg{display:block;height:100%}
 .legend span{margin-right:1rem;font-size:12px} .sw{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:middle;margin-right:4px}
 .chart{display:flex;align-items:flex-end;gap:4px;height:180px;border-bottom:1px solid #ddd;margin-top:1rem;padding-bottom:2px}
 .col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;min-width:0}
 .stack{width:100%;height:100%;display:flex;flex-direction:column-reverse;border-radius:3px 3px 0 0;overflow:hidden}
 .xlabel{font-size:10px;color:#888;margin-top:5px;white-space:nowrap} .n{font-size:10px;color:#bbb;font-variant-numeric:tabular-nums}
 .toggle{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:#555;cursor:pointer;user-select:none;margin:.6rem 0 .2rem}
 .toggle .hint{color:#aaa} .toggle input{cursor:pointer}
 #graphs[data-mode=all] .g-assessable{display:none} #graphs[data-mode=assessable] .g-all{display:none}
 table{border-collapse:collapse;width:100%;margin-top:1rem} td,th{padding:4px 8px;border-bottom:1px solid #eee;text-align:left}
 h3{font-size:13px;margin-top:1.6rem;color:#555}
 .num{text-align:right;font-variant-numeric:tabular-nums} .barcell{width:160px} .barcell span{display:block;height:10px;background:#30a46c;border-radius:2px}
 .code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#555} .none{color:#ccc}
 tr.noteam td{color:#999;font-style:italic} .flag{color:#c0392b;font-size:12px}
 .headline{font-size:13px;color:#555;margin:.5rem 0} .headline .big{font-size:22px;font-weight:700;color:#1a1a1a}
 .bars{position:relative;width:150px;height:10px} .bars .b{position:absolute;left:0;top:0;height:10px;border-radius:2px}
 .bars .gap{background:#f1c7c7} .bars .enf{background:#30a46c}
</style>
<h1>Owner approval audit</h1>
<p class=meta><b>" n-total "</b> merged PRs &nbsp;·&nbsp; " (subs (:merged_at (first rows)) 0 10) " to " (subs (:merged_at (last rows)) 0 10) " &nbsp;·&nbsp; captured " (subs (str (:captured_at (first rows))) 0 10) "</p>
<label class=toggle><input type=checkbox onchange=\"document.getElementById('graphs').dataset.mode=this.checked?'assessable':'all'\"> Owner approval only <span class=hint>(drop n/a &amp; no-owner; normalize to the " n-assess " assessable PRs)</span></label>
<div id=graphs data-mode=all>
<h2>Merged PRs by owner approval</h2>
<div class=g-all>" (rail status-cats all-counts n-total) "</div>
<div class=g-assessable>" (rail assess-cats all-counts n-assess) "</div>
<p class=note><b>no-owner</b> — the PR touches no owned backend module (frontend, docs, config). &nbsp; <b>n/a</b> — the owner team's membership was unknown in team.json at that commit.</p>
<h2>By month merged</h2>
<div class=g-all>" (month-chart monthly status-cats :total) "</div>
<div class=g-assessable>" (month-chart monthly assess-cats assess-total) "</div>
</div>
<h2>By owner team (when required to approve)</h2>
<table><tr><th>Team</th><th class=num>Required</th><th class=num>Approved</th><th class=num>Rate</th><th>&nbsp;</th></tr>" (str/join team-rows) "</table>
<h2>Module ownership &amp; CODEOWNERS enforcement</h2>
<p class=headline><span class=big>" (format "%.0f%%" (pct enforced-ns owned-ns)) "</span> of owned backend namespaces are gated by CODEOWNERS (" enforced-ns " of " owned-ns ").<br>
Modules: " enforced-mod " of " owned-mod " (" (format "%.0f%%" (pct enforced-mod owned-mod)) ").<br>
<span class=meta>" ref-desc "</span></p>
<p class=note><b>" no-handle-teams " teams</b> own <b>" no-handle-ns "</b> namespaces with no CODEOWNERS handle yet &mdash; the precondition for any enforcement.<br>
A further <b>" actionable-no-team-ns "</b> namespaces (product code &amp; drivers) sit in no module at all.</p>
<h3>Biggest coverage gaps</h3>
<p class=note>Owned namespaces that no CODEOWNERS rule with the team's own handle gates yet.<br>
Close by giving the team a team.json assignee, then generating its rules.</p>
" (gaps-table teams) "
<h3>Ownership by team</h3>
<p class=note>Each bar's <b>green</b> span is the CODEOWNERS-enforced subset; the <b>red</b> remainder is owned-but-ungated.<br>
<b>Assignee</b> is the team's handle from team.json &mdash; blank means none yet, so the team enforces nothing.</p>
" (ownership-table teams) "
<h3>Unowned code (no module)</h3>
<p class=note>Namespaces resolving to no module.<br>
<b>Product code</b> and <b>drivers</b> should get an owner; tooling (dev, mage, linter hooks, bin) is expected to stay ownerless.<br>
<b>Has owner</b> is the subset any CODEOWNERS handle already covers.</p>
" (no-team-table no-team) "")))

(defn cli-viz
  "Render report.csv to a standalone HTML summary of with-vs-without owner approval."
  [_cli-args]
  (when-not (.isFile (io/file report-csv))
    (println (c/red (str report-csv " not found — run `./bin/mage owner-approval-audit` first.")))
    (u/exit 1))
  (when (empty? (read-csv-rows))
    (println (c/red (str report-csv " has no PR rows — run the audit over a non-empty range first.")))
    (u/exit 1))
  (let [rows      (read-csv-rows)
        n-total   (count rows)
        n-assess  (count (assessable rows))
        by-status (frequencies (map :status rows))]
    ;; terminal glimpse: full composition over all PRs, then the rate among assessable
    (println (format "\n%s merged PRs (%s assessable)\n" n-total n-assess))
    (doseq [[s color-fn] [["full" c/green] ["partial" c/yellow] ["none" c/red]
                          ["n/a" c/gray] ["no-owner" c/dark]]]
      (println (bar s (get by-status s 0) n-total color-fn)))
    ;; Snapshot the current checkout (HEAD): the assignees + generated CODEOWNERS the metric measures live
    ;; on the working branch, so origin/master reads 0% until the work merges.
    (let [ref-desc (str "HEAD " (git-str "show" "-s" "--format=%h, %cs" "HEAD"))]
      (spit report-html (render-html rows (ownership-stats "HEAD") ref-desc)))
    (println (str "\nWrote " (c/green report-html)))
    (u/exit 0)))
