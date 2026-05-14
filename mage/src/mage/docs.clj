(ns mage.docs
  "Build the Metabase docs site and regenerate the auto-derived source content
  it depends on. Implementations for the `docs-build`, `docs-build-branch`,
  `docs-generate`, `docs-generate-embedding`, and `docs-ensure-generated` mage
  tasks."
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

(defn slugify
  "Filesystem-safe slug for a git ref name."
  [s]
  (str/replace s #"[^A-Za-z0-9._-]" "-"))

(defn base-tail
  "Last segment of a base path: `/docs/v0.55` -> `v0.55`."
  [base-path]
  (last (str/split base-path #"/")))

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
  "Ordered list of auto-doc generators. `:writes` paths are informational —
  the actual sinks are in each generator's source — but they're surfaced in
  log output so users can see where the diff is going to land. Keep the order
  stable: the original generate-docs.sh ran them in this order, and some
  users rely on the deterministic output order."
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
    :writes ["docs/api.json"]}
   {:tag :commands
    :msg "Generating CLI command documentation"
    :cmd ["clojure" "-M:ee:doc" "command-documentation"]
    :writes ["docs/installation-and-operation/commands.md"]}
   {:tag :analytics
    :msg "Generating usage analytics documentation"
    :cmd ["./bin/generate-usage-analytics-docs.bb"]
    :writes ["docs/usage-and-performance-tools/usage-analytics-reference.md"]}])

(defn- run-generate! [selected]
  (let [root u/project-root-directory]
    (doseq [{:keys [tag msg cmd writes]} generators
            :when (contains? selected tag)]
      (step msg)
      (doseq [path writes]
        (println (str "    → " path)))
      (apply shell/sh {:dir root} cmd))
    (println)
    (println (c/green "✓ Docs generated."))
    (println "Review the diff under docs/ and commit alongside your code change.")))

(defn generate [parsed]
  (let [opts        (:options parsed)
        all-tags    (set (map :tag generators))
        chosen      (->> all-tags (filter #(get opts %)) set)
        run-tags    (if (seq chosen) chosen all-tags)]
    (run-generate! run-tags)))

;; ---------------------------------------------------------------------------
;; docs-ensure-generated
;; ---------------------------------------------------------------------------

(defn newest-mtime-ms
  "Newest mtime in millis across all files matching any glob in `sources`,
  relative to `root`. Returns nil if no files match — callers should treat
  nil as 'no source dependency known' and fall back to existence checks."
  [root sources]
  (let [mtimes (->> sources
                    (mapcat #(fs/glob root %))
                    (map fs/last-modified-time)
                    (map #(.toMillis ^java.nio.file.attribute.FileTime %)))]
    (when (seq mtimes)
      (apply max mtimes))))

(defn newest-source
  "Like `newest-mtime-ms` but returns `{:path :mtime}` for the actual newest
  file. Used by `--verbose` mode to attribute staleness to a specific source."
  [root sources]
  (->> sources
       (mapcat #(fs/glob root %))
       (map (fn [p]
              {:path  (str p)
               :mtime (.toMillis ^java.nio.file.attribute.FileTime
                       (fs/last-modified-time p))}))
       (sort-by (comp - :mtime))
       first))

(defn artifact-fresh?
  "True if the artifact at `<root>/<rel-path>` exists, is non-empty, and is
  at least as new as the newest file matching any glob in `sources`
  (relative to `root`). When `sources` is empty or matches no files, falls
  back to existence + non-empty."
  [root rel-path sources]
  (let [f (java.io.File. (str root "/" rel-path))]
    (and (.exists f)
         (pos? (.length f))
         (let [src (newest-mtime-ms root sources)]
           (or (nil? src) (<= src (.lastModified f)))))))

(defn staleness
  "Returns a map describing *why* the artifact at `<root>/<rel-path>` would be
  considered stale by `artifact-fresh?`, or nil when it is fresh. Used by
  `--verbose` mode to make 'regenerating X' lines self-explanatory.

  Shape: `{:reason :missing}` / `{:reason :empty}` /
  `{:reason :stale :artifact-mtime ms :newest-source {:path :mtime}}`."
  [root rel-path sources]
  (let [f (java.io.File. (str root "/" rel-path))]
    (cond
      (not (.exists f))      {:reason :missing}
      (zero? (.length f))    {:reason :empty}
      :else
      (when-let [src (newest-source root sources)]
        (when (> (:mtime src) (.lastModified f))
          {:reason          :stale
           :artifact-mtime  (.lastModified f)
           :newest-source   src})))))

(def ^:private generated-artifacts
  "Files the docs build expects to find on disk, paired with the source globs
  that drive freshness checks and the command that regenerates them. Used
  by `docs-ensure-generated` (and the lazy regen path inside `run-build!`)
  as a pre-flight: anything missing, empty, or older than its newest source
  gets regenerated before the build. Add new auto-generated artifacts here
  so the pre-flight stays in sync."
  [{:path        "docs/embedding/sdk/api/snippets/index.md"
    :missing-msg "embedding docs missing or stale, regenerating (typedoc --pure)..."
    :sources     ["enterprise/frontend/src/embedding-sdk-package/**.ts"
                  "enterprise/frontend/src/embedding-sdk-package/**.tsx"
                  "enterprise/frontend/src/embedding-sdk-bundle/**.ts"
                  "enterprise/frontend/src/embedding-sdk-bundle/**.tsx"
                  "enterprise/frontend/src/embedding-sdk-shared/**.ts"
                  "enterprise/frontend/src/embedding-sdk-shared/**.tsx"]
    :regen       #(run-generate-embedding! true)}
   {:path        "docs-build/public/embedding/sdk/api/index.html"
    :missing-msg "embedding HTML API reference missing or stale, regenerating..."
    :sources     ["enterprise/frontend/src/embedding-sdk-package/**.ts"
                  "enterprise/frontend/src/embedding-sdk-package/**.tsx"
                  "enterprise/frontend/src/embedding-sdk-bundle/**.ts"
                  "enterprise/frontend/src/embedding-sdk-bundle/**.tsx"
                  "enterprise/frontend/src/embedding-sdk-shared/**.ts"
                  "enterprise/frontend/src/embedding-sdk-shared/**.tsx"]
    :regen       #(shell/sh {:dir u/project-root-directory}
                            "bun" "run" "embedding-sdk:docs:generate:html:pure")}
   {:path        "docs/api.json"
    :missing-msg "OpenAPI spec missing or stale, regenerating..."
    :sources     ;; `**` requires a non-empty path element, so we need both
                 ;; the directly-under-src and the nested-module forms.
    ["src/metabase/api/**.clj"
     "src/metabase/**/api/**.clj"
     "enterprise/backend/src/metabase_enterprise/api/**.clj"
     "enterprise/backend/src/metabase_enterprise/**/api/**.clj"]
    :regen       #(run-generate! #{:api})}])

(defn- print-staleness [{:keys [reason artifact-mtime newest-source]}]
  (case reason
    :missing (println "    reason: artifact missing")
    :empty   (println "    reason: artifact is empty (zero bytes)")
    :stale   (do (println "    reason: source newer than artifact")
                 (println (str "    newest source:  " (:path newest-source)))
                 (println (str "    source mtime:   "
                               (java.time.Instant/ofEpochMilli (:mtime newest-source))))
                 (println (str "    artifact mtime: "
                               (java.time.Instant/ofEpochMilli artifact-mtime))))))

(defn- ensure-artifact!
  ([artifact] (ensure-artifact! false artifact))
  ([verbose? {:keys [path missing-msg sources regen]}]
   (when-not (artifact-fresh? u/project-root-directory path sources)
     (println (str "→ " missing-msg))
     (when verbose?
       (when-let [s (staleness u/project-root-directory path sources)]
         (print-staleness s)))
     (regen))))

(defn ensure-generated [parsed]
  (let [verbose? (boolean (:verbose (:options parsed)))]
    (doseq [artifact generated-artifacts]
      (ensure-artifact! verbose? artifact))))

;; ---------------------------------------------------------------------------
;; docs-build
;; ---------------------------------------------------------------------------

(defn- resolve-base-path
  "Compute DOCS_BASE_PATH for a build, honoring (in order):
  1. explicit `base-path` argument
  2. `DOCS_BASE_PATH` env var
  3. `GITHUB_REF_NAME` env var (set in GitHub Actions)
  4. current branch in the caller's checkout"
  [base-path]
  (or base-path
      (System/getenv "DOCS_BASE_PATH")
      (base-path-for-branch
       (or (System/getenv "GITHUB_REF_NAME")
           (current-branch u/project-root-directory)))))

(defn- bun-install! [docs-build-dir]
  (let [has-lock? (or (fs/exists? (str docs-build-dir "/bun.lockb"))
                      (fs/exists? (str docs-build-dir "/bun.lock")))]
    (if has-lock?
      (shell/sh {:dir docs-build-dir} "bun" "install" "--frozen-lockfile")
      (shell/sh {:dir docs-build-dir} "bun" "install"))))

(defn- clear-astro-caches! [docs-build-dir]
  ;; Astro caches processed markdown in node_modules/.astro/data-store.json
  ;; keyed by source mtime — plugin source changes don't invalidate it. We
  ;; nuke the caches and dist on every build to guarantee plugin/markdown
  ;; changes take effect.
  (doseq [d [".astro" "node_modules/.astro" "dist"]]
    (fs/delete-tree (str docs-build-dir "/" d))))

(defn- regen-source!
  "Regenerate the gitignored source-of-truth content the Astro build depends
  on. `:full` rebuilds everything from scratch (multi-minute — used by
  `docs-build` since CI has no pre-built SDK). `:lazy` only regenerates
  missing or stale artifacts (sub-second on hot reruns — used by
  `docs-preview` for fast inner-loop iteration)."
  [mode]
  (case mode
    :full
    (do (step "Regenerating embedding docs")
        (run-generate-embedding! false)
        (step "Regenerating OpenAPI spec")
        (run-generate! #{:api}))
    :lazy
    (do (step "Ensuring generated artifacts present and fresh")
        (doseq [artifact generated-artifacts]
          (ensure-artifact! artifact)))))

(defn- run-build!
  "Run the docs build pipeline in the caller's repo
  (`u/project-root-directory`). For worktree builds, the caller is mage
  re-invoked inside the worktree, so this naturally targets the right tree.
  `:regen-mode` selects between full (default — rebuild everything) and
  lazy (only regenerate missing/stale artifacts). Returns the absolute path
  of the dist/ directory."
  [{:keys [base-path site-url regen-mode]
    :or   {regen-mode :full}}]
  (let [root (str u/project-root-directory)
        base (resolve-base-path base-path)
        env  (cond-> (assoc (into {} (System/getenv)) "DOCS_BASE_PATH" base)
               site-url (assoc "DOCS_SITE_URL" site-url))]
    (println (c/cyan "Building docs site"))
    (println "  repo:" root)
    (println "  base:" base)

    (regen-source! regen-mode)

    (let [docs-build-dir (str root "/docs-build")]
      (step "Installing docs-build dependencies")
      (bun-install! docs-build-dir)
      (step "Clearing Astro caches")
      (clear-astro-caches! docs-build-dir)
      (step "Running Astro build")
      (shell/sh {:dir docs-build-dir :env env} "bun" "run" "build")
      (step "Generating llms.txt artifacts")
      (shell/sh {:dir docs-build-dir :env env}
                "node" "scripts/generate-llms-files.mjs")
      (let [dist (str docs-build-dir "/dist")]
        (println)
        (println (c/green (str "Output: " dist " (base path: " base ")")))
        dist))))

(defn build [parsed]
  (let [opts (:options parsed)]
    (run-build! {:base-path  (:base-path opts)
                 :site-url   (:site-url opts)
                 :regen-mode :full})))

;; ---------------------------------------------------------------------------
;; docs-preview
;; ---------------------------------------------------------------------------

(defn preview
  "Lazy-regen build + Astro preview server. Same output shape as `build`,
  but skips the multi-minute SDK + OpenAPI rebuild when those artifacts are
  already present and not stale. Use for inner-loop preview; use `build`
  for the canonical production build."
  [parsed]
  (let [opts           (:options parsed)
        base           (resolve-base-path (:base-path opts))
        site-url       (or (:site-url opts) (System/getenv "DOCS_SITE_URL"))
        env            (cond-> (assoc (into {} (System/getenv)) "DOCS_BASE_PATH" base)
                         site-url (assoc "DOCS_SITE_URL" site-url))
        docs-build-dir (str u/project-root-directory "/docs-build")]
    (run-build! {:base-path  base
                 :site-url   site-url
                 :regen-mode :lazy})
    (step "Starting Astro preview server")
    (shell/sh {:dir docs-build-dir :env env} "bun" "run" "preview")))

;; ---------------------------------------------------------------------------
;; docs-build-branch
;; ---------------------------------------------------------------------------

(defn- resolve-ref!
  "Verify that `branch` is locally resolvable, preferring the remote-tracking
  ref so we work in a fresh shallow checkout. Returns the canonical ref name."
  [root branch fetch?]
  (when fetch?
    (println (c/yellow (str "Fetching origin/" branch "...")))
    (let [{:keys [exit]} (shell/sh* {:dir root :quiet? true}
                                    "git" "fetch" "origin" branch)]
      (when-not (zero? exit)
        (println (c/yellow
                  (str "warning: git fetch origin " branch " failed; using local ref if present"))))))
  (or (some (fn [ref]
              (let [{:keys [exit]} (shell/sh* {:dir root :quiet? true}
                                              "git" "rev-parse" "--verify" "--quiet"
                                              (str ref "^{commit}"))]
                (when (zero? exit) ref)))
            [(str "refs/remotes/origin/" branch) branch])
      (throw (ex-info (str "Cannot resolve branch '" branch "' locally or on origin")
                      {:branch branch :babashka/exit 1}))))

(defn- worktree-on-branch?
  "True if `worktree-dir` is a git worktree created by this script for
  `branch` (we identify by a marker file we drop on creation)."
  [worktree-dir branch]
  (let [marker (str worktree-dir "/.docs-build-branch")]
    (and (fs/exists? (str worktree-dir "/.git"))
         (fs/exists? marker)
         (= branch (str/trim (slurp marker))))))

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
  "Build the docs site for an arbitrary git branch via a git worktree."
  [parsed]
  (let [[branch]      (:arguments parsed)
        opts          (:options parsed)
        root          u/project-root-directory
        slug          (slugify branch)
        worktree-dir  (or (:worktree-dir opts)
                          (str root "/__worktrees/docs-" slug))
        base-path     (or (:base-path opts)
                          (System/getenv "DOCS_BASE_PATH")
                          (base-path-for-branch branch))
        output-dir    (or (:output opts)
                          (str root "/build/docs/" (base-tail base-path)))
        site-url      (or (:site-url opts) (System/getenv "DOCS_SITE_URL"))
        fetch?        (not (:no-fetch opts))
        keep?         (boolean (:keep opts))]
    (println (c/cyan "Building docs for branch"))
    (println "  branch:   " branch)
    (println "  base path:" base-path)
    (println "  worktree: " worktree-dir)
    (println "  output:   " output-dir)

    (let [resolved-ref (resolve-ref! root branch fetch?)
          existed?     (fs/directory? worktree-dir)
          reuse?       (and existed? (worktree-on-branch? worktree-dir branch))]
      (cond
        reuse?
        (do (println (c/yellow (str "Reusing existing worktree at " worktree-dir)))
            (shell/sh {:dir worktree-dir} "git" "reset" "--hard" resolved-ref))

        existed?
        (throw (ex-info
                (str worktree-dir " already exists and was not created by this script for '"
                     branch "'.\nRemove it or pass --worktree-dir to use a different path.")
                {:worktree-dir worktree-dir :branch branch :babashka/exit 1}))

        :else
        (create-worktree! root worktree-dir resolved-ref branch))

      (let [build-failed? (atom true)]
        (try
          (println)
          (println (c/cyan "Running docs build in worktree..."))
          (println)
          ;; Re-invoke mage in the worktree so its `project-root-directory`,
          ;; bb.edn, and mage sources all resolve to the worktree's checkout.
          ;; A few hundred ms of bb cold start cost vs the multi-minute build —
          ;; rounds to zero.
          (let [cmd (cond-> [(str worktree-dir "/bin/mage") "docs-build"
                             "--base-path" base-path]
                      site-url (into ["--site-url" site-url]))]
            (apply shell/sh {:dir worktree-dir} cmd))

          (let [dist (str worktree-dir "/docs-build/dist")]
            (when-not (fs/directory? dist)
              (throw (ex-info (str "Expected build output at " dist " not found")
                              {:dist dist :babashka/exit 1})))
            (rsync-dist! dist output-dir))

          (reset! build-failed? false)
          (println)
          (println (c/green (str "Done. Output: " output-dir)))

          (finally
            (cond
              @build-failed?
              (do (println)
                  (println (c/red "Build failed. Worktree retained for debugging:"))
                  (println (str "  " worktree-dir))
                  (println (str "Remove with: git worktree remove --force '" worktree-dir "'")))

              (or keep? reuse?)
              (println (str "Worktree retained: " worktree-dir))

              :else
              (remove-worktree! root worktree-dir))))))))
