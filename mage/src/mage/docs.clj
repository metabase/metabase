(ns mage.docs
  "Build the Metabase docs site and regenerate the auto-derived source content
  it depends on. Implementations for the `docs-build`, `docs-build-branch`,
  `docs-generate`, and `docs-generate-embedding` mage tasks."
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Pure helpers
;; ---------------------------------------------------------------------------

(defn base-path-for-branch
  "Mirror bin/build-docs.sh: a `release-x.NN.x` branch publishes under
  `/docs/v0.NN`; everything else publishes under `/docs/latest`."
  [branch]
  (or (when branch
        (when-let [[_ ver] (re-matches #"release-x\.(.+)\.x" branch)]
          (str "/docs/v0." ver)))
      "/docs/latest"))

(defn- current-branch
  "Branch name in `dir`, or nil for detached HEAD."
  [dir]
  (let [{:keys [exit out]} (shell/sh* {:quiet? true :dir dir}
                                      "git" "rev-parse" "--abbrev-ref" "HEAD")]
    (when (zero? exit)
      (let [b (str/trim (str/join "\n" out))]
        (when (and (seq b) (not= b "HEAD")) b)))))

(defn- step [msg]
  (println)
  (println (c/bold (str "==> " msg))))

;; ---------------------------------------------------------------------------
;; docs-generate-embedding
;; ---------------------------------------------------------------------------

(defn- run-generate-embedding! [pure?]
  (let [root u/project-root-directory]
    (if pure?
      (do (println "Generating embedding docs (typedoc only)...")
          (shell/sh {:dir root} "bun" "run" "embedding-sdk:docs:generate:pure"))
      (do (println "Generating embedding docs (full SDK build + typedoc)...")
          (shell/sh {:dir root} "bun" "run" "embedding-sdk:docs:generate")))
    (shell/sh {:dir root} "bun" "run" "embedding-eajs:docs:generate")
    (println "Generating embedding HTML API reference...")
    (shell/sh {:dir root} "bun" "run" "embedding-sdk:docs:generate:html:pure")
    (println)
    (println (c/green "✓ Embedding docs generated."))
    (println)
    (println "If files changed, commit them alongside your type change:")
    (println "    docs/embedding/sdk/api/")
    (println "    docs/embedding/eajs/snippets/")
    (println)
    (println "The HTML API reference under docs-build/public/embedding/sdk/api/")
    (println "is gitignored and regenerated on every build.")))

(defn generate-embedding [parsed]
  (run-generate-embedding! (boolean (:pure (:options parsed)))))

;; ---------------------------------------------------------------------------
;; docs-generate
;; ---------------------------------------------------------------------------

(def ^:private generators
  "Single source of truth for auto-doc artifacts. Each entry has:

    :tag      — keyword used by --<tag> CLI flag selection and for tests
    :msg      — log line when generating
    :cmd      — shell vector to regenerate (nil for `standalone` entries
                that are only reached via the lazy pre-flight, never by
                `docs-generate`)
    :writes   — output paths (informational, surfaced in log output)
    :lazy     — optional pre-flight spec for the `docs-build --lazy` path:
                  :check       — file the lazy path will probe for existence
                  :missing-msg — log line when the check fails
                  :regen       — optional override invocation; defaults to
                                 running this entry's :cmd

  Order is stable: it's the deterministic generate sequence the original
  shell script used, and some users rely on the resulting diff order.
  Freshness is mere existence, not source-mtime — if you edit an SDK type
  and need the typedoc to refresh, run `bun run docs:generate:embedding`."
  [{:tag :env-vars
    :msg "Generating environment variables documentation"
    :cmd ["clojure" "-M:ee:doc" "environment-variables-documentation"]
    :writes ["docs/configuring-metabase/environment-variables.md"]}
   {:tag :config
    :msg "Generating config template documentation"
    :cmd ["clojure" "-M:ee:doc" "config-template"]
    :writes ["docs/configuring-metabase/config-template.md"]}
   {:tag :api
    :msg "Generating REST API documentation"
    :cmd ["clojure" "-M:ee:doc" "api-documentation"]
    :writes ["docs/api.json"]
    :lazy {:check       "docs/api.json"
           :missing-msg "OpenAPI spec missing, regenerating..."}}
   {:tag :commands
    :msg "Generating CLI command documentation"
    :cmd ["clojure" "-M:ee:doc" "command-documentation"]
    :writes ["docs/installation-and-operation/commands.md"]}
   {:tag :analytics
    :msg "Generating usage analytics documentation"
    :cmd ["./bin/generate-usage-analytics-docs.bb"]
    :writes ["docs/usage-and-performance-tools/usage-analytics-reference.md"]}
   {:tag :country-codes
    :msg "Generating country code reference documentation"
    :cmd ["./bin/generate-country-code-docs.bb"]
    :writes ["docs/questions/visualizations/country-codes.md"]}
   ;; Pre-flight-only artifacts (no `:cmd`, so `docs-generate` ignores them).
   ;; The SDK typedoc has a fast `--pure` regen distinct from the full SDK
   ;; rebuild used in `docs-build` non-lazy mode, so it carries an explicit
   ;; `:regen` override.
   {:tag :sdk-typedoc
    :writes ["docs/embedding/sdk/api/snippets/index.md"]
    :lazy {:check       "docs/embedding/sdk/api/snippets/index.md"
           :missing-msg "embedding docs missing, regenerating (typedoc --pure)..."
           :regen       #(run-generate-embedding! true)}}
   {:tag :sdk-html
    :writes ["docs-build/public/embedding/sdk/api/index.html"]
    :lazy {:check       "docs-build/public/embedding/sdk/api/index.html"
           :missing-msg "embedding HTML API reference missing, regenerating..."
           :regen       #(shell/sh {:dir u/project-root-directory}
                                   "bun" "run" "embedding-sdk:docs:generate:html:pure")}}])

(defn- run-generate! [selected]
  (let [root u/project-root-directory]
    (doseq [{:keys [tag msg cmd writes]} generators
            :when (and cmd (contains? selected tag))]
      (step msg)
      (doseq [path writes]
        (println (str "    → " path)))
      (apply shell/sh {:dir root} cmd))
    (println)
    (println (c/green "✓ Docs generated."))
    (println "Review the diff under docs/ and commit alongside your code change.")))

(defn generate [parsed]
  (let [opts        (:options parsed)
        runnable    (filter :cmd generators)
        all-tags    (set (map :tag runnable))
        chosen      (->> all-tags (filter #(get opts %)) set)
        run-tags    (if (seq chosen) chosen all-tags)]
    (run-generate! run-tags)))

;; ---------------------------------------------------------------------------
;; Lazy artifact pre-flight (used by `docs-build --lazy`)
;; ---------------------------------------------------------------------------

(defn artifact-present?
  "True if the artifact at `<root>/<rel-path>` exists."
  [root rel-path]
  (.exists (java.io.File. (str root "/" rel-path))))

(defn- lazy-entries
  "Generator entries that participate in the `docs-build --lazy` pre-flight,
  in generator order. Derived from `generators` so adding a new
  auto-generated artifact is a one-place edit."
  []
  (filter :lazy generators))

(defn- ensure-artifact! [{:keys [tag lazy]}]
  (let [{:keys [check missing-msg regen]} lazy]
    (when-not (artifact-present? u/project-root-directory check)
      (println (str "→ " missing-msg))
      (if regen
        (regen)
        (run-generate! #{tag})))))

(defn- ensure-all-artifacts! []
  (doseq [entry (lazy-entries)]
    (ensure-artifact! entry)))

;; ---------------------------------------------------------------------------
;; docs-build (also serves docs-preview via --preview --lazy)
;; ---------------------------------------------------------------------------

(defn- resolve-base-path
  "Compute DOCS_BASE_PATH for a build, honoring (in order):
  1. explicit `base-path` argument
  2. `DOCS_BASE_PATH` env var
  3. `branch` argument (e.g. from `docs-build-branch`'s positional arg)
  4. `GITHUB_REF_NAME` env var (set in GitHub Actions)
  5. current branch in the caller's checkout"
  ([base-path] (resolve-base-path base-path nil))
  ([base-path branch]
   (or base-path
       (System/getenv "DOCS_BASE_PATH")
       (base-path-for-branch
        (or branch
            (System/getenv "GITHUB_REF_NAME")
            (current-branch u/project-root-directory))))))

(defn- resolve-site-url
  "Absolute site URL from CLI arg or `DOCS_SITE_URL` env var; nil if neither
  is set (Astro will then skip canonicals/sitemap)."
  [site-url]
  (or site-url (System/getenv "DOCS_SITE_URL")))

(defn- build-env
  "Shell env for Astro builds: parent env + DOCS_BASE_PATH, and DOCS_SITE_URL
  when set."
  [base-path site-url]
  (cond-> (assoc (into {} (System/getenv)) "DOCS_BASE_PATH" base-path)
    site-url (assoc "DOCS_SITE_URL" site-url)))

(defn build
  "Build the docs site to docs-build/dist/. With `--preview`, start the Astro
  preview server after the build completes. With `--lazy`, skip the multi-
  minute SDK + OpenAPI rebuild and only regenerate missing artifacts — use
  this for fast inner-loop iteration (`docs:preview` shells to it)."
  [parsed]
  (let [opts           (:options parsed)
        lazy?          (boolean (:lazy opts))
        preview?       (boolean (:preview opts))
        root           (str u/project-root-directory)
        docs-build-dir (str root "/docs-build")
        base           (resolve-base-path (:base-path opts))
        site-url       (resolve-site-url (:site-url opts))
        env            (build-env base site-url)]
    (println (c/cyan "Building docs site"))
    (println "  repo:" root)
    (println "  base:" base)

    (if lazy?
      (do (step "Ensuring generated artifacts present")
          (ensure-all-artifacts!))
      (do (step "Regenerating embedding docs")
          (run-generate-embedding! false)
          (step "Regenerating OpenAPI spec")
          (run-generate! #{:api})))

    (step "Installing docs-build dependencies")
    (let [has-lock? (or (fs/exists? (str docs-build-dir "/bun.lockb"))
                        (fs/exists? (str docs-build-dir "/bun.lock")))]
      (if has-lock?
        (shell/sh {:dir docs-build-dir} "bun" "install" "--frozen-lockfile")
        (shell/sh {:dir docs-build-dir} "bun" "install")))

    (step "Clearing Astro caches")
    ;; Astro caches processed markdown in node_modules/.astro/data-store.json
    ;; keyed by source mtime — plugin source changes don't invalidate it.
    (doseq [d [".astro" "node_modules/.astro" "dist"]]
      (fs/delete-tree (str docs-build-dir "/" d)))

    (step "Running Astro build")
    ;; llms.txt and llms-*-full.txt are emitted as Astro endpoints
    ;; (src/pages/llms*.txt.ts), so they fall out of the Astro build itself —
    ;; no post-build node step needed.
    (shell/sh {:dir docs-build-dir :env env} "bun" "run" "build")

    (let [dist (str docs-build-dir "/dist")]
      (println)
      (println (c/green (str "Output: " dist " (base path: " base ")"))))

    (when preview?
      (step "Starting Astro preview server")
      (shell/sh {:dir docs-build-dir :env env} "bun" "run" "preview"))))

;; ---------------------------------------------------------------------------
;; docs-build-branch
;; ---------------------------------------------------------------------------

(defn- resolve-ref!
  "Verify that `branch` is locally resolvable, preferring the remote-tracking
  ref so we work in a fresh shallow checkout. Returns the canonical ref name."
  [root branch]
  (println (c/yellow (str "Fetching origin/" branch "...")))
  (let [{:keys [exit]} (shell/sh* {:dir root :quiet? true}
                                  "git" "fetch" "origin" branch)]
    (when-not (zero? exit)
      (println (c/yellow
                (str "warning: git fetch origin " branch " failed; using local ref if present")))))
  (or (some (fn [ref]
              (let [{:keys [exit]} (shell/sh* {:dir root :quiet? true}
                                              "git" "rev-parse" "--verify" "--quiet"
                                              (str ref "^{commit}"))]
                (when (zero? exit) ref)))
            [(str "refs/remotes/origin/" branch) branch])
      (throw (ex-info (str "Cannot resolve branch '" branch "' locally or on origin")
                      {:branch branch :babashka/exit 1}))))

(defn- create-worktree! [root worktree-dir resolved-ref branch]
  (fs/create-dirs (fs/parent worktree-dir))
  (println (c/yellow (str "Creating worktree at " worktree-dir "...")))
  ;; --detach avoids "branch already checked out elsewhere" errors when the
  ;; caller's main checkout is also on this branch. We pass DOCS_BASE_PATH
  ;; explicitly into the inner build, so the worktree's symbolic branch name
  ;; doesn't matter to base-path derivation.
  (shell/sh {:dir root} "git" "worktree" "add" "--detach" worktree-dir resolved-ref)
  (spit (str worktree-dir "/.docs-build-branch") (str branch "\n")))

(defn- remove-worktree! [root worktree-dir]
  (println "Removing worktree...")
  (shell/sh* {:dir root :quiet? true}
             "git" "worktree" "remove" "--force" worktree-dir))

(defn list-docs-worktrees
  "Returns a sorted seq of `{:dir :branch :mtime}` for every directory under
  `<root>/__worktrees/` whose name starts with `docs-` and that contains the
  `.docs-build-branch` marker dropped by `create-worktree!`. Sorted oldest
  first so destructive callers process the staler stuff first."
  [root]
  (let [parent (str root "/__worktrees")]
    (when (fs/exists? parent)
      (->> (fs/list-dir parent)
           (filter fs/directory?)
           (filter #(str/starts-with? (fs/file-name %) "docs-"))
           (keep (fn [d]
                   (let [marker (str d "/.docs-build-branch")]
                     (when (fs/exists? marker)
                       {:dir    (str d)
                        :branch (str/trim (slurp marker))
                        :mtime  (.toMillis ^java.nio.file.attribute.FileTime
                                 (fs/last-modified-time d))}))))
           (sort-by :mtime)
           vec))))

(defn- rsync-dist! [dist output-dir]
  (fs/create-dirs output-dir)
  (println)
  (println (str "Copying " dist "/ -> " output-dir "/"))
  ;; rsync's trailing-slash semantics: `dist/` means contents of dist, not the
  ;; dist directory itself. --delete keeps re-runs clean.
  (shell/sh "rsync" "-a" "--delete" (str dist "/") (str output-dir "/")))

(defn clean-worktrees
  "List (dry-run) or remove `__worktrees/docs-*` directories left behind by
  `docs-build-branch`. With `--force`, removes them via `git worktree
  remove --force`; without, prints the list and what each was built for."
  [parsed]
  (let [root  u/project-root-directory
        force? (boolean (:force (:options parsed)))
        wts   (list-docs-worktrees root)]
    (cond
      (empty? wts)
      (println "No docs worktrees found under __worktrees/.")

      force?
      (do (println (str "Removing " (count wts) " docs worktree(s)..."))
          (doseq [{:keys [dir branch]} wts]
            (println (str "  " dir " (built from: " branch ")"))
            (remove-worktree! root dir))
          (println)
          (println (c/green "✓ Done.")))

      :else
      (do (println (str "Found " (count wts) " docs worktree(s):"))
          (println)
          (doseq [{:keys [dir branch mtime]} wts]
            (println (str "  " dir))
            (println (str "    built from:    " branch))
            (println (str "    last touched:  " (str (java.time.Instant/ofEpochMilli mtime)))))
          (println)
          (println "Re-run with --force to remove them.")))))

(defn build-branch
  "Build the docs site for an arbitrary git branch via a git worktree.
  Always creates a fresh worktree, removes it on success, retains it on
  failure so the operator can inspect. Use `docs-clean-worktrees --force`
  to bulk-remove leftovers."
  [parsed]
  (let [[branch]     (:arguments parsed)
        root         u/project-root-directory
        worktree-dir (str root "/__worktrees/docs-"
                          (str/replace branch #"[^A-Za-z0-9._-]" "-"))
        base-path    (resolve-base-path nil branch)
        output-dir   (str root "/build/docs/" (last (str/split base-path #"/")))]
    (println (c/cyan "Building docs for branch"))
    (println "  branch:   " branch)
    (println "  base path:" base-path)
    (println "  worktree: " worktree-dir)
    (println "  output:   " output-dir)

    (when (fs/directory? worktree-dir)
      (throw (ex-info
              (str worktree-dir " already exists (leftover from a previous failed build).\n"
                   "Run `./bin/mage docs-clean-worktrees --force` to remove it.")
              {:worktree-dir worktree-dir :babashka/exit 1})))

    (let [resolved-ref (resolve-ref! root branch)]
      (create-worktree! root worktree-dir resolved-ref branch)
      (try
        (println)
        (println (c/cyan "Running docs build in worktree..."))
        (println)
        ;; Re-invoke mage in the worktree so its `project-root-directory`,
        ;; bb.edn, and mage sources all resolve to the worktree's checkout.
        ;; A few hundred ms of bb cold start cost vs the multi-minute build —
        ;; rounds to zero.
        (shell/sh {:dir worktree-dir}
                  (str worktree-dir "/bin/mage") "docs-build"
                  "--base-path" base-path)

        (let [dist (str worktree-dir "/docs-build/dist")]
          (when-not (fs/directory? dist)
            (throw (ex-info (str "Expected build output at " dist " not found")
                            {:dist dist :babashka/exit 1})))
          (rsync-dist! dist output-dir))

        (println)
        (println (c/green (str "Done. Output: " output-dir)))
        (remove-worktree! root worktree-dir)

        (catch Exception e
          (println)
          (println (c/red "Build failed. Worktree retained for debugging:"))
          (println (str "  " worktree-dir))
          (println "Remove with: ./bin/mage docs-clean-worktrees --force")
          (throw e))))))

;; ---------------------------------------------------------------------------
;; docs-help
;; ---------------------------------------------------------------------------

(def ^:private help-rows
  "Bun aliases for the docs pipeline. Three columns:
    1. The `bun run docs:*` alias.
    2. A one-line purpose (terminal help and dev-guide markdown).
    3. The implementer for the dev-guide \"Implemented by\" column —
       backticked code identifiers, bare words for plain text like Astro / Node.

  This is the single source of truth: the terminal help output uses cols 1
  and 2, and the markdown table in docs/developers-guide/docs.md is the
  output of `docs-help --format md` (regenerate with `docs-help --write`).
  `mage.docs-test` asserts the dev guide's bracketed block matches the
  generated markdown so drift is a CI failure."
  [["bun run docs:dev"                "Hot-reload Astro dev server (skips auto-generated artifacts)" "Astro"]
   ["bun run docs:dev:clean"          "Kill orphaned dev server on port 4321 and restart"            "Astro"]
   ["bun run docs:preview"            "Lazy-regen production build + Astro preview server"           "`./bin/mage docs-build --preview --lazy`"]
   ["bun run docs:build"              "Full production build (what CI runs)"                         "`./bin/mage docs-build`"]
   ["bun run docs:generate"           "Regenerate auto-derived backend docs (env vars, config, …)"   "`./bin/mage docs-generate`"]
   ["bun run docs:generate:embedding" "Regenerate SDK / Embed.js typedoc reference"                  "`./bin/mage docs-generate-embedding`"]
   ["bun run docs:check"              "Astro/TypeScript check + nav.yml reference validator"        "Astro"]
   ["bun run docs:test"               "Unit tests for the custom remark/rehype plugins"             "Node"]
   ["bun run docs:help"               "Print this listing in the terminal"                          "`./bin/mage docs-help`"]])

(def ^:private dev-guide-relpath "docs/developers-guide/docs.md")
(def ^:private help-table-begin "<!-- BEGIN docs-help-table -->")
(def ^:private help-table-end "<!-- END docs-help-table -->")

(defn- pad-right [s width]
  (str s (apply str (repeat (- width (count s)) \space))))

(defn help-table-markdown
  "Return the dev-guide markdown table, bracketed by BEGIN/END HTML
  comments, padded so columns line up visually (cosmetic only — renderers
  ignore the padding)."
  []
  (let [headers ["Command" "Purpose" "Implemented by"]
        rows    (mapv (fn [[cmd purpose impl]] [(str "`" cmd "`") purpose impl])
                      help-rows)
        col     (fn [i] (cons (nth headers i) (map #(nth % i) rows)))
        widths  (mapv #(apply max (map count (col %)))
                      (range (count headers)))
        format-row (fn [r]
                     (str "| "
                          (str/join " | " (map pad-right r widths))
                          " |"))
        separator  (str "| "
                        (str/join " | "
                                  (map #(apply str (repeat % \-)) widths))
                        " |")]
    (str/join "\n"
              (concat [help-table-begin
                       (format-row headers)
                       separator]
                      (map format-row rows)
                      [help-table-end]))))

(defn- rewrite-dev-guide-block!
  "Replace the BEGIN/END-bracketed block in the dev guide with the current
  generated markdown. Throws if the markers can't be found — we don't want
  to silently produce an empty diff after someone removes them. A no-op
  rewrite (block already matches generated output) is success, not failure."
  []
  (let [path (str u/project-root-directory "/" dev-guide-relpath)
        text (slurp path)
        re   #"(?s)<!-- BEGIN docs-help-table -->.*?<!-- END docs-help-table -->"]
    (when-not (re-find re text)
      (throw (ex-info (str "Couldn't find docs-help-table markers in " path
                           "; add `" help-table-begin "` / `" help-table-end
                           "` around the table.")
                      {:path path :babashka/exit 1})))
    (let [replaced (str/replace text re (help-table-markdown))]
      (if (= text replaced)
        (println (str dev-guide-relpath " already up to date."))
        (do (spit path replaced)
            (println (str "Updated " dev-guide-relpath)))))))

(defn- print-terminal-help! []
  (let [width (apply max (map (comp count first) help-rows))]
    (println)
    (println (c/bold "Metabase docs commands"))
    (println)
    (doseq [[cmd desc _] help-rows]
      (println (str "  "
                    (c/cyan cmd)
                    (apply str (repeat (inc (- width (count cmd))) \space))
                    desc)))
    (println)
    (println (str "Run " (c/cyan "./bin/mage <task> --help")
                  " for flag-level help on commands that wrap a mage task"))
    (println "(docs-build, docs-generate, docs-generate-embedding).")
    (println)))

(defn print-help!
  "Print the docs commands. Default: colorized two-column terminal listing.
  With `--format md`: print the dev-guide markdown table to stdout.
  With `--write`: rewrite the bracketed block in docs/developers-guide/docs.md
  in place."
  [parsed]
  (let [opts (:options parsed)]
    (cond
      (:write opts)         (rewrite-dev-guide-block!)
      (= "md" (:format opts)) (println (help-table-markdown))
      :else                 (print-terminal-help!))))
