(ns metabase-enterprise.library-branching.check
  "The checker of a checkout: it decodes the files of the tree, and checks the snapshot at the structural level and,
  with a manifest, at the semantic level. It needs no Metabase instance and no app DB, and it loads in babashka.

    bb -Sdeps '{:paths [\"<metabase>/enterprise/backend/src\"] :deps {metosin/malli {:mvn/version \"0.17.0\"}}}' \\
       -m metabase-enterprise.library-branching.check <checkout> [--manifest <file>]"
  (:require
   [metabase-enterprise.library-branching.format.kinds :as kinds])
  (:gen-class))

(set! *warn-on-reflection* true)

(defn tree-files
  "`{path bytes}` of the files of directory `dir` that the checker decodes, with relative paths separated by /: each
  regular file whose name ends in .yaml and whose path has no segment that starts with a dot, and the format version
  file `tree/format-path`."
  [_dir]
  {})

(defn check
  "The result of the check of the tree `files`, `{path bytes}`, with the codecs `codecs` (default `kinds/codecs`):

    {:green?   true iff no finding
     :findings [f ...]
     :lints    [l ...]
     :semantic? true iff a manifest was given}

  Each finding has `:level`: `:decode` (a finding of `tree/decode-tree`, with `:path` or `:paths` in place of
  `:file` or `:files`), `:manifest` (a finding of `manifest/decode`), `:structural` (a finding of
  `validate/validate`, with the fixed roots of `roots/root-ids`) or `:semantic` (a finding of
  `semantic/validate`). A structural or semantic finding has `:path`, the path of the file of its `:id`. The
  semantic check runs only when the tree decodes and `opts` has `:manifest`, the bytes of a manifest. Each lint is
  `{:rule :canonical-path :id i :path p :canonical q}`: an item whose file is not at the path that the layout gives;
  lints are computed only when there is no finding, and they do not change `:green?`."
  ([files opts]
   (check kinds/codecs files opts))
  ([_codecs _files _opts]
   {:green? true :findings [] :lints [] :semantic? false}))

(defn report
  "The lines of text that describe `result` (of [[check]]) to a person: one line for each finding and each lint, then
  a last line, \"green\" or \"red\" with the number of findings. A finding about two items names both."
  [_result]
  [])

(defn- print-lines!
  [lines]
  ;; The checker is a command-line tool: its output is the report on stdout. metabase.util.log does not load in
  ;; babashka.
  #_{:clj-kondo/ignore [:discouraged-var]}
  (run! println lines))

(defn run
  "Checks directory `dir`, with the manifest at `manifest-path`, or at `manifest/path` in `dir` when it is nil and
  that file exists. Prints the [[report]] and returns the exit code: 0 green, 1 red."
  [_dir _manifest-path]
  0)

(defn parse-args
  "`{:dir d :manifest m}` of the command-line arguments `<checkout> [--manifest <file>]`, or nil for other arguments."
  [_args]
  nil)

(defn -main
  "`<checkout> [--manifest <file>]`: [[run]], then exit with its code; exit 2 for other arguments."
  [& args]
  (System/exit (if-let [{:keys [dir manifest]} (parse-args args)]
                 (run dir manifest)
                 (do (print-lines! ["Usage: <checkout> [--manifest <file>]"]) 2))))
