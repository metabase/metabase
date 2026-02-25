(ns dev.mutation-testing
  "Linear API client and PR template helpers for mutation testing automation.

   Provides functions to create Linear projects and issues, and to generate
   templated PR titles and descriptions for mutation testing PRs.

   Configuration:
   - LINEAR_API_KEY env var must be set
   - Call (set-config! {:team-id \"...\" :project-id \"...\"}) before creating issues"
  (:refer-clojure :exclude [run!])
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.set :as set]
   [clojure.string :as str]
   [dev.coverage :as coverage]))

(set! *warn-on-reflection* true)

;;; --- Configuration ---

(defonce ^:private config (atom {}))

(defn set-config!
  "Set configuration for mutation testing.

   Required keys:
   - :team-id   — Linear team ID
   - :project-id — Linear project ID (can be set after creating a project)

   Optional keys:
   - :base-branch — git branch to create feature branches from (default: \"master\")
   - :project-id  — Linear project ID to add issues to (skips project creation in run!)"
  [m]
  (swap! config merge m))

(defn- base-branch []
  (get @config :base-branch "master"))

(defn- api-key []
  (or (System/getenv "LINEAR_API_KEY")
      (throw (ex-info "LINEAR_API_KEY environment variable is not set" {}))))

(defn- team-id []
  (or (:team-id @config)
      (throw (ex-info "team-id not set. Call (set-config! {:team-id \"...\"})" {}))))

(defn- project-id []
  (or (:project-id @config)
      (throw (ex-info "project-id not set. Call (set-config! {:project-id \"...\"})" {}))))

;;; --- Linear GraphQL API ---

(defn- graphql-request
  "Execute a GraphQL request against the Linear API.
   Returns the parsed response body."
  [query variables]
  (let [response (http/post "https://api.linear.app/graphql"
                            {:headers {"Authorization" (api-key)
                                       "Content-Type" "application/json"}
                             :body (json/generate-string {:query query
                                                          :variables variables})
                             :as :json
                             :throw-exceptions false})]
    (when-let [errors (get-in response [:body :errors])]
      (throw (ex-info "Linear API error" {:errors errors})))
    (:body response)))

(defn list-teams!
  "List all Linear teams accessible to the authenticated user.
   Returns a seq of {:id ... :name ... :key ...} maps."
  []
  (let [query "query { teams { nodes { id name key } } }"
        result (graphql-request query {})]
    (get-in result [:data :teams :nodes])))

(defn create-project!
  "Create a new Linear project.

   Options:
   - :name        — project name (required)
   - :description — short project description, ≤255 chars (optional)
   - :content     — long-form project content as markdown (optional)
   - :status-id   — project status ID (optional)

   Returns a map with :project-id.
   Also updates config with the new project-id."
  [{:keys [name description content status-id]}]
  (let [query "mutation($input: ProjectCreateInput!) {
                     projectCreate(input: $input) {
                       success
                       project { id name }
                     }
                   }"
        variables {:input (cond-> {:name name
                                   :teamIds [(team-id)]}
                            description (assoc :description description)
                            content (assoc :content content)
                            status-id (assoc :statusId status-id))}
        result (graphql-request query variables)
        project (get-in result [:data :projectCreate :project])]
    (set-config! {:project-id (:id project)})
    {:project-id (:id project)
     :name (:name project)}))

(defn create-issue!
  "Create a new Linear issue in the configured team and project.

   Options:
   - :title       — issue title (required)
   - :description — issue description (optional)

   Returns a map with :issue-id and :identifier (e.g., \"QUE-1234\")."
  [{:keys [title description]}]
  (let [query "mutation($input: IssueCreateInput!) {
                     issueCreate(input: $input) {
                       success
                       issue { id identifier title url }
                     }
                   }"
        variables {:input (cond-> {:title title
                                   :teamId (team-id)
                                   :projectId (project-id)}
                            description (assoc :description description))}
        result (graphql-request query variables)
        issue (get-in result [:data :issueCreate :issue])]
    {:issue-id (:id issue)
     :identifier (:identifier issue)
     :title (:title issue)
     :url (:url issue)}))

;;; --- Template helpers ---

(defn pr-title
  "Generate a PR title for a mutation testing PR.

   Example: [Mutation Testing] Kill mutations in metabase.lib.order-by/orderable-columns"
  [target-ns fn-name]
  (str "[Mutation Testing] Kill mutations in " target-ns "/" fn-name))

(defn pr-description
  "Generate a PR description for a mutation testing PR.

   Options:
   - :target-ns           — the namespace under test
   - :fn-names            — seq of function name strings covered by this PR
   - :linear-identifier   — Linear issue identifier (e.g., \"QUE-1234\")
   - :mutations-before    — number of surviving mutations before this PR (for these functions only)
   - :tests-added         — number of new tests being added
   - :killed              — seq of mutation description strings
   - :not-killed          — seq of {:description ... :rationale ...} maps (can be empty)
   - :suggested-changes   — seq of short description strings for code improvements posted as suggested changes"
  [{:keys [target-ns fn-names linear-identifier mutations-before tests-added killed not-killed suggested-changes]}]
  (let [killed-count (count killed)
        remaining (- mutations-before killed-count)]
    (str "Part of the mutation testing project for `" target-ns "`.\n"
         "\n"
         "Closes " linear-identifier "\n"
         "\n"
         "### Functions\n"
         (str/join "\n" (map #(str "- `" target-ns "/" % "`") fn-names))
         "\n"
         "\n"
         "### Stats\n"
         "- **Surviving mutations before:** " mutations-before "\n"
         "- **Tests added:** " tests-added "\n"
         "- **Mutations killed by this PR:** " killed-count "\n"
         "- **Mutations remaining:** " remaining "\n"
         "\n"
         "### Mutations killed\n"
         (if (seq killed)
           (str/join "\n" (map #(str "- " %) killed))
           "- None")
         "\n"
         "\n"
         "### Mutations not killed (with rationale)\n"
         (if (seq not-killed)
           (str/join "\n" (map #(str "- " (:description %) " — " (:rationale %)) not-killed))
           "- None (all mutations killed)")
         "\n"
         (when (seq suggested-changes)
           (str "\n"
                "### Suggested code changes\n"
                "The following improvements are posted as suggested changes on this PR. Please review:\n"
                (str/join "\n" (map #(str "- " %) suggested-changes))
                "\n")))))

(defn linear-issue-title
  "Generate a Linear issue title for a mutation testing issue.

   Example: Mutation testing: metabase.lib.order-by/orderable-columns"
  [target-ns fn-name]
  (str "Mutation testing: " target-ns "/" fn-name))

(defn linear-issue-description
  "Generate a Linear issue description for a mutation testing issue."
  [target-ns fn-name]
  (str "Write targeted tests to kill surviving mutations in `" target-ns "/" fn-name "`.\n"
       "\n"
       "Mutation testing found code paths in this function that are not adequately "
       "verified by the existing test suite. Surviving mutations indicate places where "
       "the code could be changed (e.g., swapping operators, replacing values) without "
       "any test failing — meaning bugs in those paths would go undetected.\n"
       "\n"
       "This issue tracks writing the simplest tests that kill these mutations while "
       "remaining semantically meaningful. The corresponding draft PR will list which "
       "mutations were killed and provide rationale for any that are unkillable."))

;;; --- Convenience ---

;;; --- GitHub helpers ---

(defn- sh
  "Run a shell command and return {:exit ... :out ... :err ...}.
   Throws on non-zero exit."
  [& args]
  (let [result (apply shell/sh args)]
    (when-not (zero? (:exit result))
      (throw (ex-info (str "Shell command failed: " (pr-str args) "\n" (:err result))
                      result)))
    result))

(defn branch-name
  "Generate a branch name for mutation testing a function.
   Example: mutation-testing-lib-order-by-orderable-columns"
  [target-ns fn-name]
  (let [short-ns (last (str/split (str target-ns) #"\."))]
    (str "mutation-testing-lib-" short-ns "-" fn-name)))

(defn create-branch!
  "Create and checkout a new branch from the base branch for mutation testing a function."
  [target-ns fn-name]
  (let [branch (branch-name target-ns fn-name)]
    (sh "git" "checkout" (base-branch))
    (sh "git" "pull")
    (sh "git" "checkout" "-b" branch)
    branch))

(defn commit-and-push!
  "Stage changed files, commit with a message, and push the current branch.
   `files` is a seq of file paths to stage."
  [target-ns fn-name files]
  (doseq [f files]
    (sh "git" "add" f))
  (sh "git" "commit" "-m" (str "[Mutation Testing] Add tests for " target-ns "/" fn-name))
  (let [branch (branch-name target-ns fn-name)]
    (sh "git" "push" "-u" "origin" branch)
    branch))

(defn create-draft-pr!
  "Create a draft PR on GitHub and return the PR URL.

   Options:
   - :target-ns         — the namespace under test
   - :fn-name           — the function name (used for PR title)
   - :fn-names          — seq of function name strings (used in PR body)
   - :linear-identifier — Linear issue identifier (e.g., \"QUE-1234\")
   - :mutations-before  — number of surviving mutations before this PR
   - :tests-added       — number of new tests being added
   - :killed            — seq of mutation description strings
   - :not-killed        — seq of {:description ... :rationale ...} maps
   - :suggested-changes — seq of short description strings"
  [{:keys [target-ns fn-name] :as opts}]
  (let [title (pr-title target-ns fn-name)
        body (pr-description opts)
        result (sh "gh" "pr" "create" "--draft"
                   "--base" (base-branch)
                   "--title" title
                   "--body" body
                   "--label" "no-backport")]
    (str/trim (:out result))))

(defn add-pr-comment!
  "Add a general comment to a PR. `pr-url-or-number` can be a PR URL or number."
  [pr-url-or-number comment-body]
  (sh "gh" "pr" "comment" (str pr-url-or-number) "--body" comment-body))

(defn- pr-number-from-url
  "Extract the PR number from a GitHub PR URL."
  [pr-url]
  (last (str/split (str pr-url) #"/")))

(defn- repo-nwo
  "Get the owner/repo for the current git repo."
  []
  (str/trim (:out (sh "gh" "repo" "view" "--json" "nameWithOwner" "-q" ".nameWithOwner"))))

(defn- head-sha
  "Get the head commit SHA for a PR."
  [pr-url-or-number]
  (str/trim (:out (sh "gh" "pr" "view" (str pr-url-or-number) "--json" "headRefOid" "-q" ".headRefOid"))))

(defn add-suggested-change!
  "Add an inline review comment with a suggested change on a PR.
   This uses GitHub's suggestion syntax so the reviewer can apply it with one click.

   Options:
   - :pr-url       — the PR URL or number
   - :path         — file path relative to repo root
   - :start-line   — first line of the range to replace (1-indexed)
   - :end-line     — last line of the range to replace (1-indexed, can equal start-line for single line)
   - :suggestion   — the replacement code (string, will be placed inside a ```suggestion block)
   - :comment      — explanation of the suggested change"
  [{:keys [pr-url path start-line end-line suggestion comment]}]
  (let [pr-num (pr-number-from-url pr-url)
        nwo (repo-nwo)
        sha (head-sha pr-url)
        body (str comment "\n\n```suggestion\n" suggestion "\n```")
        args (cond-> ["gh" "api" "--method" "POST"
                      (str "/repos/" nwo "/pulls/" pr-num "/comments")
                      "-f" (str "body=" body)
                      "-f" (str "commit_id=" sha)
                      "-f" (str "path=" path)
                      "-F" (str "line=" end-line)
                      "-f" "side=RIGHT"]
               (not= start-line end-line)
               (into ["-F" (str "start_line=" start-line)
                      "-f" "start_side=RIGHT"]))]
    (apply sh args)))

(defn return-to-base!
  "Checkout the configured base branch."
  []
  (sh "git" "checkout" (base-branch))
  nil)

(defn return-to-master!
  "Checkout the configured base branch. Deprecated: use return-to-base! instead."
  []
  (return-to-base!))

;;; --- Report helpers ---

(defn report-stats
  "Parse a mutation testing report file and return summary statistics.
   Returns a map with :total-fns, :uncovered, :partially-covered, :fully-covered,
   :pct-fully-covered, :total-surviving-mutations."
  [report-path]
  (let [content (slurp report-path)
        count-headings (fn [section-re]
                         (let [section (second (re-find section-re content))]
                           (if section
                             (count (re-seq #"(?m)^### " section))
                             0)))
        uncovered (count-headings #"(?s)## Uncovered Functions\n(.*?)(?=\n## |\z)")
        partially (count-headings #"(?s)## Partially Covered Functions\n(.*?)(?=\n## |\z)")
        fully (count-headings #"(?s)## Fully Covered Functions\n(.*?)(?=\n## |\z)")
        total (+ uncovered partially fully)
        surviving (count (re-seq #"(?m)^#### Mutation:" content))]
    {:total-fns total
     :uncovered uncovered
     :partially-covered partially
     :fully-covered fully
     :pct-fully-covered (if (pos? total)
                          (Math/round (* 100.0 (/ fully total)))
                          0)
     :total-surviving-mutations surviving}))

(defn project-name
  "Generate a Linear project name for a namespace.
   Example: Mutation Testing: metabase.lib.order-by"
  [target-ns]
  (str "Mutation Testing: " target-ns))

(defn project-description
  "Generate a Linear project description with business value and report statistics.
   Must be ≤255 characters (Linear limit).

   `stats` is a map from `report-stats`."
  [target-ns stats]
  (str "Mutation testing for " target-ns ". "
       (:total-fns stats) " fns: "
       (:uncovered stats) " untested, "
       (:partially-covered stats) " partial ("
       (:total-surviving-mutations stats) " surviving), "
       (:fully-covered stats) " covered ("
       (:pct-fully-covered stats) "%)"))

(defn project-content
  "Generate long-form markdown content for a Linear project.

   `stats` is a map from `report-stats`."
  [target-ns stats]
  (str "## Goal\n"
       "\n"
       "Improve test coverage in `" target-ns "` to catch regressions and reduce bugs "
       "in production. Mutation testing systematically finds code paths where the "
       "existing test suite would not detect introduced bugs.\n"
       "\n"
       "## Baseline Report\n"
       "\n"
       "| Metric | Count |\n"
       "| --- | --- |\n"
       "| Total functions | " (:total-fns stats) " |\n"
       "| Completely untested | " (:uncovered stats) " |\n"
       "| Partially covered | " (:partially-covered stats) " |\n"
       "| Fully covered | " (:fully-covered stats) " (" (:pct-fully-covered stats) "%) |\n"
       "| Surviving mutations | " (:total-surviving-mutations stats) " |\n"
       "\n"
       "## Process\n"
       "\n"
       "For each function with surviving mutations:\n"
       "1. Write the simplest tests that kill the mutations while remaining semantically meaningful\n"
       "2. Open a draft PR with the new tests\n"
       "3. A dev reviews the tests and any suggested code improvements\n"
       "4. Merge once approved\n"))

(defn create-project-for-namespace!
  "Create a Linear project for mutation testing a specific namespace.
   Reads statistics from the baseline report file.
   Sets status to 'In Progress'.
   Returns the project map and sets :project-id in config."
  [target-ns report-path]
  (let [stats (report-stats report-path)]
    (create-project! {:name (project-name target-ns)
                      :description (project-description target-ns stats)
                      :content (project-content target-ns stats)
                      :status-id "29777ad8-950c-4c88-8e18-89a87dfc880f"})))

(defn create-issue-for-function!
  "Create a Linear issue for mutation testing a specific function.
   Returns the issue map with :identifier, :url, etc."
  [target-ns fn-name]
  (create-issue! {:title (linear-issue-title target-ns fn-name)
                  :description (linear-issue-description target-ns fn-name)}))

;;; --- Orchestration ---

(defn parse-namespace
  "Parse a namespace symbol into all derived paths and names.
   Auto-detects .cljc vs .clj by checking which file exists."
  [target-ns-sym]
  (let [target-ns (str target-ns-sym)
        test-ns (str target-ns "-test")
        short-name (last (str/split target-ns #"\."))
        ns-path (-> target-ns
                    (str/replace "." "/")
                    (str/replace "-" "_"))
        test-path-base (-> test-ns
                           (str/replace "." "/")
                           (str/replace "-" "_"))
        source-ext (cond
                     (.exists (io/file (str "src/" ns-path ".cljc"))) ".cljc"
                     (.exists (io/file (str "src/" ns-path ".clj"))) ".clj"
                     :else ".cljc")
        test-ext (cond
                   (.exists (io/file (str "test/" test-path-base ".cljc"))) ".cljc"
                   (.exists (io/file (str "test/" test-path-base ".clj"))) ".clj"
                   :else ".cljc")]
    {:target-ns (symbol target-ns)
     :test-ns (symbol test-ns)
     :short-name short-name
     :source-path (str "src/" ns-path source-ext)
     :test-path (str "test/" test-path-base test-ext)
     :report-path (str "mutation-testing-report." target-ns ".before.md")}))

(defn group-functions
  "Group functions from coverage results for batch processing.
   Takes the output of coverage/test-namespace.

   Logic:
   - Public functions with surviving mutations each become a group
   - Private functions get assigned to the public function with the most test overlap
   - Functions with zero surviving mutations are skipped
   - Uncovered or unassignable private functions get their own group"
  [coverage-results]
  (let [with-survivors (into {} (filter (fn [[_ v]] (seq (:survived v))) coverage-results))
        public? (fn [fn-sym]
                  (let [v (find-var fn-sym)]
                    (and v (not (:private (meta v))))))
        public-fns (into {} (filter (fn [[k _]] (public? k)) with-survivors))
        private-fns (into {} (remove (fn [[k _]] (public? k)) with-survivors))
        assignments (into {}
                          (for [[priv-fn priv-data] private-fns
                                :let [priv-tests (set (:tests priv-data))
                                      best (when (seq priv-tests)
                                             (->> public-fns
                                                  (map (fn [[pub-fn pub-data]]
                                                         [pub-fn (count (set/intersection
                                                                         priv-tests
                                                                         (set (:tests pub-data))))]))
                                                  (filter (fn [[_ n]] (pos? n)))
                                                  (sort-by second >)
                                                  first))]
                                :when best]
                            [priv-fn (first best)]))
        unassigned-private (into {} (remove (fn [[k _]] (contains? assignments k)) private-fns))
        public-groups (for [[pub-fn pub-data] public-fns
                            :let [attached (keep (fn [[priv-fn assigned-to]]
                                                   (when (= assigned-to pub-fn) priv-fn))
                                                 assignments)
                                  all-fn-names (vec (cons pub-fn attached))
                                  all-mutations (vec (concat (:survived pub-data)
                                                             (mapcat #(:survived (get coverage-results %))
                                                                     attached)))
                                  all-tests (apply set/union
                                                   (keep #(:tests (get coverage-results %))
                                                         all-fn-names))]]
                        {:primary-fn pub-fn
                         :fn-names all-fn-names
                         :mutations all-mutations
                         :tests (or all-tests #{})})
        private-groups (for [[priv-fn priv-data] unassigned-private]
                         {:primary-fn priv-fn
                          :fn-names [priv-fn]
                          :mutations (vec (:survived priv-data))
                          :tests (or (:tests priv-data) #{})})]
    (vec (concat public-groups private-groups))))

(defn build-test-prompt
  "Build a prompt for Claude to write tests that kill surviving mutations."
  [{:keys [target-ns test-ns source-path test-path fn-names mutations]}]
  (let [fn-sources (str/join "\n\n"
                             (for [fn-name fn-names
                                   :let [fn-info (coverage/find-function-source fn-name)
                                         source (when fn-info (coverage/read-function-from-file fn-info))]
                                   :when source]
                               (str ";;; " fn-name "\n" source)))
        mutation-list (str/join "\n\n"
                                (map-indexed
                                 (fn [i {:keys [description mutation]}]
                                   (str "### Mutation " (inc i) ": " description "\n```clojure\n" mutation "\n```"))
                                 mutations))
        test-content (slurp test-path)]
    (str "You are writing mutation tests for functions in `" target-ns "`.\n"
         "\n"
         "## Source Code of Functions Under Test\n"
         "\n"
         "```clojure\n"
         fn-sources
         "\n```\n"
         "\n"
         "## Existing Test File (" test-path ")\n"
         "\n"
         "```clojure\n"
         test-content
         "\n```\n"
         "\n"
         "## Surviving Mutations to Kill\n"
         "\n"
         "Each mutation below represents a change to the source code that no existing test catches.\n"
         "Write the simplest tests that would fail if these mutations were applied.\n"
         "\n"
         mutation-list
         "\n"
         "\n"
         "## Instructions\n"
         "\n"
         "- Write the simplest tests that kill these surviving mutations\n"
         "- Follow the patterns in the existing test file (same helpers, same assertion style)\n"
         "- Never call private functions directly — test through public API\n"
         "- Insert tests near related existing tests, not at the end of the file\n"
         "- Use the Edit tool to modify the test file at: " test-path "\n"
         "- After writing tests, verify they compile by running: clj-nrepl-eval -p $(clj-nrepl-eval --discover-ports | head -1) \"(require '" test-ns " :reload)\"\n"
         "- Each test should verify one meaningful behavior — don't over-engineer\n")))

(defn invoke-claude!
  "Shell out to claude CLI to write tests. Returns the output string."
  [prompt]
  (let [result (shell/sh "claude" "-p"
                         "--allowedTools" "Edit,Read,Bash(clj-nrepl-eval*)"
                         :in prompt)]
    (when-not (zero? (:exit result))
      (throw (ex-info "Claude invocation failed" {:exit (:exit result)
                                                  :err (:err result)})))
    (:out result)))

(defn- all-test-names
  "Get all test var names from a test namespace."
  [test-ns-sym]
  (require test-ns-sym :reload)
  (let [ns-obj (find-ns test-ns-sym)]
    (->> (ns-interns ns-obj)
         vals
         (filter #(:test (meta %)))
         (map #(symbol (str test-ns-sym) (name (.sym ^clojure.lang.Var %))))
         set)))

(defn- count-tests
  "Count test vars in a namespace."
  [test-ns-sym]
  (count (filter #(:test (meta %)) (vals (ns-interns (find-ns test-ns-sym))))))

(defn verify-and-retry!
  "Verify mutations are killed. Retry with Claude if needed.
   Returns {:status :success|:partial, :killed [...], :survived [...]}."
  [{:keys [fn-names test-ns test-path max-retries]
    :or {max-retries 2}}]
  (loop [retries-left max-retries]
    (let [test-names (all-test-names test-ns)
          fn-results (into {}
                           (for [fn-name fn-names
                                 :let [result (coverage/test-mutations fn-name test-names)]
                                 :when result]
                             [fn-name result]))
          all-killed (vec (mapcat :killed (vals fn-results)))
          all-survived (vec (mapcat :survived (vals fn-results)))]
      (if (empty? all-survived)
        {:status :success :killed all-killed :survived []}
        (if (pos? retries-left)
          (do
            (println "  " (count all-survived) "mutations still survive, retrying..."
                     "(" retries-left "retries left)")
            (let [retry-prompt (str "Some mutations still survive after your previous tests. "
                                    "Please write additional tests to kill them.\n\n"
                                    "## Still-Surviving Mutations\n\n"
                                    (str/join "\n\n"
                                              (for [{:keys [description mutation]} all-survived]
                                                (str "### " description "\n```clojure\n" mutation "\n```")))
                                    "\n\n## Instructions\n"
                                    "- The test file is at: " test-path "\n"
                                    "- Use the Edit tool to add more tests\n"
                                    "- Focus specifically on the mutations listed above\n"
                                    "- Do NOT duplicate existing tests\n")]
              (invoke-claude! retry-prompt))
            (recur (dec retries-left)))
          {:status :partial :killed all-killed :survived all-survived})))))

(defn process-group!
  "Process one group of functions: branch → tests → verify → commit → PR.
   Returns {:pr-url ... :issue ... :killed ... :not-killed ...}."
  [session group]
  (let [{:keys [target-ns test-ns test-path]} session
        {:keys [primary-fn fn-names mutations]} group
        primary-fn-name (name primary-fn)]
    ;; 1. Create branch
    (println "  Creating branch...")
    (create-branch! (str target-ns) primary-fn-name)

    ;; 2. Count tests before
    (require test-ns :reload)
    (let [tests-before (count-tests test-ns)]

      ;; 3. Build prompt and invoke Claude
      (println "  Invoking Claude to write tests...")
      (let [prompt (build-test-prompt {:target-ns target-ns
                                       :test-ns test-ns
                                       :source-path (:source-path session)
                                       :test-path test-path
                                       :fn-names fn-names
                                       :mutations mutations})]
        (invoke-claude! prompt))

      ;; 4. Verify and retry
      (println "  Verifying mutations killed...")
      (let [verify-result (verify-and-retry! {:fn-names fn-names
                                              :test-ns test-ns
                                              :test-path test-path
                                              :max-retries 2})
            killed (:killed verify-result)
            survived (:survived verify-result)
            tests-after (count-tests test-ns)
            tests-added (- tests-after tests-before)]

        ;; 5. Commit and push
        (println "  Committing and pushing...")
        (commit-and-push! (str target-ns) primary-fn-name [test-path])

        ;; 6. Create Linear issue
        (println "  Creating Linear issue...")
        (let [issue (create-issue-for-function! (str target-ns) primary-fn-name)

              ;; 7. Create draft PR
              _ (println "  Creating draft PR...")
              pr-url (create-draft-pr!
                      {:target-ns (str target-ns)
                       :fn-name primary-fn-name
                       :fn-names (mapv name fn-names)
                       :linear-identifier (:identifier issue)
                       :mutations-before (count mutations)
                       :tests-added tests-added
                       :killed (mapv :description killed)
                       :not-killed (mapv (fn [m] {:description (:description m)
                                                  :rationale "Could not be killed automatically"})
                                         survived)
                       :suggested-changes []})]

          ;; 8. Return to base branch
          (return-to-base!)

          (println "  Done! PR:" pr-url)
          {:pr-url pr-url
           :issue issue
           :killed killed
           :not-killed survived
           :tests-added tests-added})))))

(defn print-summary!
  "Print a summary of the mutation testing run."
  [{:keys [project groups results]}]
  (println "\n========================================")
  (println "  Mutation Testing Summary")
  (println "========================================")
  (println "Project:" (:name project))
  (println "Groups:" (count groups))
  (let [successful (filter :pr-url results)
        failed (filter :error results)
        total-killed (count (mapcat :killed successful))
        total-unkilled (count (mapcat :not-killed successful))
        total-tests (reduce + 0 (keep :tests-added successful))]
    (println "PRs created:" (count successful))
    (when (seq failed)
      (println "Errors:" (count failed)))
    (println "Tests added:" total-tests)
    (println "Mutations killed:" total-killed)
    (println "Mutations not killed:" total-unkilled)
    (println)
    (when (seq successful)
      (println "PRs:")
      (doseq [r successful]
        (println "  " (:pr-url r))))
    (when (seq failed)
      (println "\nFailed:")
      (doseq [r failed]
        (println "  " (:primary-fn r) "-" (:error r))))
    (println "========================================")))

(defn run!
  "Main entry point. Runs the full mutation testing workflow for a namespace.

   Prerequisites:
   - nREPL running
   - LINEAR_API_KEY env var set
   - gh CLI authenticated
   - team-id configured via (set-config! {:team-id \"...\"})

   Options (optional second arg):
   - :base-branch — git branch to create feature branches from (default: from config, or \"master\")
   - :project-id  — existing Linear project ID to use (skips creating a new project)"
  ([target-ns-sym] (run! target-ns-sym {}))
  ([target-ns-sym opts]
   (when-let [bb (:base-branch opts)]
     (set-config! {:base-branch bb}))
   (when-let [pid (:project-id opts)]
     (set-config! {:project-id pid}))
   (let [parsed (parse-namespace target-ns-sym)
         {:keys [target-ns test-ns report-path]} parsed]
     ;; 1. Generate report
     (println "Generating mutation testing report for" (str target-ns) "...")
     (coverage/generate-report target-ns [test-ns] report-path)
     (println "Report written to" report-path)

     ;; 2. Create or reuse Linear project
     (let [project (if (:project-id @config)
                     (do (println "Using existing Linear project:" (:project-id @config))
                         {:project-id (:project-id @config)
                          :name (str "Existing project " (:project-id @config))})
                     (do (println "Creating Linear project...")
                         (let [p (create-project-for-namespace! (str target-ns) report-path)]
                           (println "Created project:" (:name p))
                           p)))]

       ;; 3. Run coverage and group functions
       (println "Running coverage analysis and grouping...")
       (let [coverage-results (coverage/test-namespace target-ns [test-ns])
             groups (group-functions coverage-results)]
         (println "Found" (count groups) "function groups to process")

         ;; 4. Process each group
         (let [results (vec
                        (for [group groups]
                          (do
                            (println "\n--- Processing:" (:primary-fn group)
                                     "(" (count (:mutations group)) "surviving mutations) ---")
                            (try
                              (process-group! parsed group)
                              (catch Exception e
                                (println "ERROR:" (.getMessage e))
                                (try (return-to-base!) (catch Exception _))
                                {:error (.getMessage e)
                                 :primary-fn (:primary-fn group)})))))]

           ;; 5. Print summary
           (print-summary! {:project project
                            :groups groups
                            :results results})
           results))))))

(comment
  ;; Setup:
  ;; 1. Set LINEAR_API_KEY env var before starting the REPL
  ;; 2. Configure team and project:
  (set-config! {:team-id "your-team-id"})

  ;; Create a project (only needed once):
  (create-project! {:name "Mutation Testing: metabase.lib.*"
                    :description "Kill surviving mutations in core query-building namespaces."})

  ;; Create an issue for a function:
  (create-issue-for-function! "metabase.lib.order-by" "orderable-columns")

  ;; Generate a PR description:
  (println (pr-description {:target-ns "metabase.lib.order-by"
                            :fn-name "orderable-columns"
                            :linear-identifier "QUE-1234"
                            :killed ["Replace :asc with :asc__"
                                     "Replace = with not="]
                            :not-killed [{:description "Replace nil with 0"
                                          :rationale "Default value is never used in practice"}]})))
