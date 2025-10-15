#!/usr/bin/env bb
;; CLI Test Utility for Markdown Parser
;; Usage: bb hackathon/markdown-parser/cli-test.clj <markdown-file>

(require '[clojure.java.io :as io]
         '[clojure.java.shell :as shell]
         '[clojure.string :as str]
         '[cheshire.core :as json])

(defn parse-markdown-with-node
  "Parse markdown using Node.js prosemirror-markdown library"
  [markdown-text]
  (let [temp-file (java.io.File/createTempFile "metabase-markdown-" ".md")
        script-path (str (System/getProperty "user.dir")
                         "/hackathon/markdown-parser/parse-markdown.mjs")]
    (try
      ;; Write markdown to temp file
      (spit temp-file markdown-text)

      ;; Call Node.js script
      (let [{:keys [exit out err]} (shell/sh "node"
                                             script-path
                                             (.getAbsolutePath temp-file))]
        (when-not (zero? exit)
          (println "Error parsing markdown:" err)
          (System/exit 1))

        ;; Parse JSON output
        (json/parse-string out true))

      (finally
        ;; Clean up temp file
        (io/delete-file temp-file :silently)))))

(defn markdown-file->json
  "Read markdown file and convert to ProseMirror JSON"
  [file-path]
  (when-not (.exists (io/file file-path))
    (println "Error: File not found:" file-path)
    (System/exit 1))

  (let [markdown-text (slurp file-path)
        pm-doc (parse-markdown-with-node markdown-text)]
    pm-doc))

(defn print-summary
  "Print a summary of the parsed document"
  [pm-doc]
  (println "\n=== Document Structure ===")
  (println "Type:" (:type pm-doc))
  (println "Content blocks:" (count (:content pm-doc)))

  (println "\n=== Content Breakdown ===")
  (doseq [[idx node] (map-indexed vector (:content pm-doc))]
    (println (format "  [%d] %s" idx (:type node)))))

(defn print-json
  "Pretty print the ProseMirror JSON"
  [pm-doc]
  (println (json/generate-string pm-doc {:pretty true})))

(defn main [args]
  (when (empty? args)
    (println "Usage: bb cli-test.clj <markdown-file> [--json]")
    (println "\nTest files:")
    (println "  hackathon/markdown-parser/test-files/basic.md")
    (println "  hackathon/markdown-parser/test-files/metabase.md")
    (println "  hackathon/markdown-parser/test-files/document-example.md")
    (println "  hackathon/markdown-parser/test-files/cards-only.md")
    (println "  hackathon/markdown-parser/test-files/links-only.md")
    (System/exit 1))

  (let [file-path (first args)
        show-summary? (some #{"--verbose"} args)]

    (when show-summary?
      (println "Parsing:" file-path)
      (println "File size:" (.length (io/file file-path)) "bytes"))

    (let [pm-doc (markdown-file->json file-path)]
      (when show-summary?
        (print-summary pm-doc))
      (print-json pm-doc))))

;; Run main
(main *command-line-args*)
