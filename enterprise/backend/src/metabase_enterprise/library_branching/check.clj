(ns metabase-enterprise.library-branching.check
  "The checker of a checkout: it decodes the files of the tree, and checks the snapshot at the structural level and,
  with a manifest, at the semantic level. It needs no Metabase instance and no app DB, and it loads in babashka.

    bb -Sdeps '{:paths [\"<metabase>/enterprise/backend/src\"] :deps {metosin/malli {:mvn/version \"0.17.0\"}}}' \\
       -m metabase-enterprise.library-branching.check <checkout> [--manifest <file>]"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.library-branching.engine.semantic :as semantic]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.manifest :as manifest]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.roots :as roots])
  (:import
   (java.io File)
   (java.nio.file Files Path)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Files ------------------------------------------------------

(defn- git-dir?
  [^File f]
  (= ".git" (.getName f)))

(defn tree-files
  "`{path bytes}` of the files of the checkout in directory `dir`, with relative paths separated by /: every regular
  file, except the files of the git directory `.git`."
  [dir]
  (let [^File top  (io/file dir)
        ^Path root (.toPath top)]
    (into {}
          (comp (filter #(and (.isFile ^File %) (not (git-dir? %))))
                (map (fn [^File f] [(str/join "/" (map str (.relativize root (.toPath f))))
                                    (Files/readAllBytes (.toPath f))])))
          (tree-seq #(and (.isDirectory ^File %) (not (git-dir? %)))
                    #(seq (.listFiles ^File %))
                    top))))

;;; ------------------------------------------------------ Check ------------------------------------------------------

(defn- decode-findings
  [paths findings]
  (mapv (fn [{:keys [file files] :as f}]
          (cond-> (assoc (dissoc f :file :files) :level :decode)
            file  (assoc :path (nth paths file))
            files (assoc :paths (mapv paths files))))
        findings))

(defn- with-path
  [level path-of finding]
  (let [path (some-> (:id finding) path-of)]
    (cond-> (assoc finding :level level)
      path (assoc :path path))))

(defn- lints
  "The canonical-path lints of `s`. An item with no file (a system item that decode completed) has none."
  [codecs s path-of]
  (vec (for [[id p] (sort-by (comp path-of key) (layout/layout codecs s))
             :let   [at (path-of id)]
             :when  (and at (not= p at))]
         {:rule :canonical-path :id id :path at :canonical p})))

(defn check
  "The result of the check of the tree `files`, `{path bytes}`, with the codecs `codecs` (default `kinds/codecs`):

    {:green?    true iff no finding
     :findings  [f ...]
     :lints     [l ...]
     :semantic? true iff a manifest was given
     :snapshot  the snapshot of the tree, or nil when it does not decode}

  The check decodes the item files and the format version file of `claims/item-claims`, and completes the snapshot
  with `claims/with-system-items`. Each finding has `:level`: `:decode` (a finding of `tree/decode-tree`, with
  `:path` or `:paths` in place of `:file` or `:files`), `:manifest` (a finding of `manifest/decode`), `:structural`
  (a finding of `validate/validate`, with the fixed roots of `roots/root-ids`) or `:semantic` (a finding of
  `semantic/validate`). A structural or semantic finding has `:path`, the path of the file of its `:id`, when the
  item has a file. The semantic check runs only when the tree decodes and `opts` has `:manifest`, the bytes of a
  manifest. The lints do not change `:green?`: first `claims/foreign-lints`, then, when there is no finding,
  `{:rule :canonical-path :id i :path p :canonical q}` for each item whose file is not at the path that the layout
  gives."
  ([files opts]
   (check kinds/codecs files opts))
  ([codecs files {manifest-bytes :manifest}]
   (let [claims   (claims/item-claims files)
         paths    (vec (sort (keys (claims/claimed-files claims))))
         decoded  (tree/decode-files codecs (mapv files paths))
         s        (some-> (:snapshot decoded) claims/with-system-items)
         path-of  (fn [id] (some-> (get (:files decoded) id) paths))
         env      (some-> manifest-bytes manifest/decode)
         findings (vec (if s
                         (concat (map (partial with-path :structural path-of)
                                      (validate/validate s {:roots (roots/root-ids s)}))
                                 (map #(assoc % :level :manifest) (:findings env))
                                 (when-let [env (:env env)]
                                   (map (partial with-path :semantic path-of) (semantic/validate s env))))
                         (decode-findings paths (:findings decoded))))
         green?   (empty? findings)]
     {:green?    green?
      :findings  findings
      :lints     (into (claims/foreign-lints claims) (when (and s green?) (lints codecs s path-of)))
      :semantic? (some? manifest-bytes)
      :snapshot  s})))

;;; ------------------------------------------------------ Report -----------------------------------------------------

(defn- id-text
  [id]
  (if (string? id) id (str/join "." (map #(or % "") id))))

(defn- item-text
  "`kind \"name\" (id)` of item `id` of snapshot `s`, or the identity alone when `s` does not have it."
  [s id]
  (if-let [{:keys [kind name]} (get s id)]
    (str (clojure.core/name kind) " \"" name "\" (" (id-text id) ")")
    (id-text id)))

(defn- target-text
  [s [role target]]
  (str (name role) " "
       (if (and (vector? target) (= :env (first target)))
         (id-text (second target))
         (item-text s target))))

(defn- structural-text
  [s {:keys [rule id place ids ref] :as finding}]
  (case rule
    :place-inside (str (item-text s id) " is in " (id-text place) ", which is not in the tree.")
    :acyclic      (str "These items contain each other: "
                       (str/join ", " (map (partial item-text s) (sort-by id-text ids))) ".")
    :kind-fits    (str (item-text s id) " is in " (item-text s place) ", which cannot contain it.")
    :refs-closed  (str (item-text s id) " refers to " (target-text s ref) ", which is not in the tree.")
    :root         (str (item-text s id) " is at the root level, and it is not a fixed root.")
    (pr-str (dissoc finding :level :path))))

(defn- finding-text
  [s {:keys [level path paths reason id ref] :as finding}]
  (str (cond path (str path ": ") paths (str (str/join ", " paths) ": ") :else "")
       (case level
         (:decode :manifest) (if reason (str/replace reason #"\s*\n\s*" " ") (pr-str (dissoc finding :level)))
         :semantic           (str (item-text s id) " refers to " (target-text s ref) ", which is not in the manifest.")
         :structural         (structural-text s finding))))

(defn- lint-text
  [s {:keys [rule id path canonical]}]
  (case rule
    :canonical-path (str path ": the canonical path of " (item-text s id) " is " canonical "; the next push moves it.")
    :foreign-file   (str path ": this YAML file is not an item file, so sync ignores it.")))

(defn report
  "The lines of text that describe `result` (of [[check]]) to a person: one line for each finding and each lint, then
  a last line, \"green\" or \"red\" with the number of findings. A finding about two items names both."
  [{:keys [findings lints snapshot]}]
  (let [n (count findings)]
    (conj (into (mapv (partial finding-text snapshot) findings) (map (partial lint-text snapshot)) lints)
          (if (zero? n) "green" (str "red: " n (if (= 1 n) " finding" " findings"))))))

;;; ---------------------------------------------------- The command --------------------------------------------------

(defn- print-lines!
  [lines]
  ;; The checker is a command-line tool: its output is the report on stdout.
  (run! println lines))

(defn run
  "Checks directory `dir`, with the manifest at `manifest-path`, or at `manifest/path` in `dir` when it is nil and
  that file exists. Prints the [[report]] and returns the exit code: 0 green, 1 red."
  [dir manifest-path]
  (let [^File m (if manifest-path (io/file manifest-path) (io/file dir manifest/path))
        result  (check (tree-files dir) {:manifest (when (or manifest-path (.isFile m))
                                                     (Files/readAllBytes (.toPath m)))})]
    (print-lines! (report result))
    (if (:green? result) 0 1)))

(defn parse-args
  "`{:dir d :manifest m}` of the command-line arguments `<checkout> [--manifest <file>]`, or nil for other arguments."
  [args]
  (let [[dir flag manifest & more] args]
    (when (and dir (empty? more) (if flag (and (= "--manifest" flag) manifest) (nil? manifest)))
      {:dir dir :manifest manifest})))

(defn -main
  "`<checkout> [--manifest <file>]`: [[run]], then exit with its code; exit 2 for other arguments."
  [& args]
  (System/exit (if-let [{:keys [dir manifest]} (parse-args args)]
                 (run dir manifest)
                 (do (print-lines! ["Usage: <checkout> [--manifest <file>]"]) 2))))
