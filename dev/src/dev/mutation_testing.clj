(ns dev.mutation-testing
  "Linear API client and PR template helpers for mutation testing automation.

   Provides functions to create Linear projects and issues, and to generate
   templated PR titles and descriptions for mutation testing PRs.

   Configuration:
   - LINEAR_API_KEY env var must be set
   - Call (set-config! {:team-id \"...\" :project-id \"...\"}) before creating issues"
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.java.shell :as shell]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

;;; --- Configuration ---

(defonce ^:private config (atom {}))

(defn set-config!
  "Set configuration for Linear API calls.

   Required keys:
   - :team-id   — Linear team ID
   - :project-id — Linear project ID (can be set after creating a project)"
  [m]
  (swap! config merge m))

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
  (let [short-ns (last (clojure.string/split (str target-ns) #"\."))]
    (str "mutation-testing-lib-" short-ns "-" fn-name)))

(defn create-branch!
  "Create and checkout a new branch from master for mutation testing a function."
  [target-ns fn-name]
  (let [branch (branch-name target-ns fn-name)]
    (sh "git" "checkout" "master")
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
                   "--title" title
                   "--body" body
                   "--label" "no-backport")]
    (clojure.string/trim (:out result))))

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

(defn return-to-master!
  "Checkout master branch."
  []
  (sh "git" "checkout" "master")
  nil)

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
