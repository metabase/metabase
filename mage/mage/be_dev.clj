(ns mage.be-dev
  (:require
   [babashka.fs :as fs]
   [bencode.core :as bencode]
   [clojure.string :as str]
   [edamame.core :as edamame]
   [flatland.ordered.map :as m]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- safe-parse-int
  "Parse a string into an integer. Returns nil if parsing fails. Returns the input unchanged if not a string."
  [s-or-i]
  (if (string? s-or-i)
    (let [s (str/trim s-or-i)]
      (try
        (Integer/parseInt s)
        (catch Exception _ nil)))
    s-or-i))

(defn- print-capture-code
  "Capture output and return it as strings along with the value from the orignal code."
  [code-string]
  (str "
(let [o# (new java.io.StringWriter)
      e# (new java.io.StringWriter)]
  (binding [*out* o#
            *err* e#]
    {:value (do" code-string ")
     :stdout (str o#)
     :stderr (str e#)}))"))

(defn eval-in-ns
  "This insane code evals the code in the proper namespace.
  It's basically a repl inside a repl."
  [nns code]
  (str "
              (let [ns-sym (symbol \"" nns "\")]
                (require ns-sym :reload)
                (in-ns ns-sym)
                (eval (read-string " (pr-str (or code "::no-op")) ")))"))

(defn nrepl-eval
  "Evaluate Clojure code in a running nREPL server. With one arg, reads port from .nrepl-port file.
   With two args, uses the provided port number. Returns and formats the evaluation results."
  ([nns code]
   (nrepl-eval (or nns "user") code (slurp ".nrepl-port")))
  ([nns code port]
   (try (let [port (safe-parse-int port)
              s (java.net.Socket. "localhost" port)
              out (.getOutputStream s)
              in (java.io.PushbackInputStream. (.getInputStream s))
              code-str (->> code
                            (eval-in-ns nns)
                            print-capture-code)
              _ (u/debug "Code: ----- \n" code-str "\n -----")
              _ (bencode/write-bencode out {"op" "eval" "code" code-str})
              return (update-vals (bencode/read-bencode in) slurp)]
          (doseq [[k v] return]
            (if (= k "value")
              (if-let [v (try (read-string v)
                              ;; try to read v, which is a map but comes back as a string:
                              (catch Exception _ nil))]
                (do
                  (println "value: " (pr-str (:value v)))
                  (when-not (str/blank? (:stdout v))
                    (println "stdout: ")
                    (doseq [out (str/split-lines (:stdout v))]
                      (println "  " out)))
                  (when-not (str/blank? (:stderr v))
                    (println "stderr: ")
                    (doseq [err (str/split-lines (:stderr v))]
                      (println "  " err))))
                (println "value: " v))
              (println (str k ":") v))))
        (catch java.net.ConnectException _
          (println (str "Could not connect to the REPL server on port: " (c/red port) " (found port number in .nrepl-port).\n"
                        "Is the Metabase backend running?\n\n"
                        "To start it, run:\n"
                        (c/green "  clj -M:dev:ee:ee-dev:drivers:drivers-dev:dev-start\n\n")
                        "If you prefer a different way to start the backend, please use that instead.")))
        (catch Exception e
          (if (= "No matching ctor found for class java.net.Socket" (ex-message e))
            (println (str "Unable to connect to nREPL server. Is it running on port " (c/yellow port) "?"))
            (do
              (println "message: " (ex-message e))
              (println "data:    " (pr-str (ex-data e)))
              {:exception true
               :message (ex-message e)
               :data (ex-data e)}))))))

(comment

  (nrepl-eval "metabase.logger-test" "(do (println :!! hi) hi)" 59498)

  (nrepl-eval "metabase.logger-test" "*ns*" 59498)

  (println code-str))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Readability check

(defn- find-data-readers []
  (let [reader-tags (conj (keys (read-string
                                 (slurp "resources/data_readers.clj")))
                          'js)]
    (zipmap reader-tags (map (fn [tag]
                               #_:clj-kondo/ignore
                               (eval `(fn [v] (list (quote ~tag) v))))
                             reader-tags))))

(defn- can-read-content? [s]
  (try
    (edamame/parse-string-all s {:all true
                                 :map m/ordered-map
                                 :auto-resolve name
                                 :features #{:cljs :bb}
                                 :read-cond :allow
                                 :readers (find-data-readers)
                                 :eof ::done
                                 :row-key :line
                                 :col-key :column})
    {:readable true}
    (catch Exception e
      {:readable false
       :reason (ex-message e)
       :data (ex-data e)})))

(defn- top-level-form-chunk [content]
  (let [next-int! (let [*i (atom 0)] (fn [] (swap! *i inc)))]
    (reduce
     (fn [acc [line next-line]]
       ;; (prn ["last element:" (get acc (dec (count acc)))])
       (if (and (= "" line) (str/starts-with? next-line "("))
         (conj acc [(next-int!)])
         ;; update last element:
         (update acc (dec (count acc)) conj (next-int!))))
     [[]]
     (partition-all 2 1 (str/split-lines content)))))

(defn- line-bounds [content line-number]
  (let [top-level-chunks (top-level-form-chunk content)]
    (if-let [hit (first (filter (fn [chunk] (<= (first chunk) line-number (last chunk)))
                                top-level-chunks))]
      {:start (first hit)
       ;; end is exclusive, so add 1:
       :end (inc (last hit))}
      (throw (ex-info "Line number not found in any top-level form." {:cause :line-number-not-found})))))

(comment

  (mapv
   (juxt identity
         #(line-bounds
           (str/join "\n"                         ;; line
                     ["(ns)"                      ;; 1
                      ""                          ;; 2
                      "(defn square [x] (* x x))" ;; 3
                      ""                          ;; 4
                      "(defn cube [x] "           ;; 5
                      "  (* x x x))"              ;; 6
                      ""                          ;; 7
                      ])
           %))
   [1 3 4 5])
;; => [[1 {:start 1, :end 2}]
;;     [3 {:start 2, :end 4}]
;;     [4 {:start 4, :end 7}]
;;     [5 {:start 4, :end 7}]]
  )

(defn- rc-usage [reason]
  (println "There was a problem with the command: " reason)
  (println)
  (println "Usage: bb be-dev/balanced-parens file-path starting-line-number ending-line-number")
  (println "  file-path:            path to the file to check")
  (println "  line-number: line number to start checking from (inclusive)")
  (println)
  (throw (ex-info "Usage error" {:cause :usage :reason reason})))

(defn readability-check
  "Check if the file has balanced parens, and can be read by the Clojure reader.

  Emulation of the Clojure reader, is done by edamame, which has been configured to work with our codebase.

  If line-number is not provided, checks the whole file.
  If line-number is provided, checks the top level form file which contains line-number."
  [file & [line-number]]
  (let [content (try (slurp file) (catch Exception _ (rc-usage :missing-file)))]
    (if-not line-number
      #_:clj-kondo/ignore
      (let [result (can-read-content? content)]
        (prn result)
        result)
      (try (let [line-number (try (if (int? line-number) line-number (Integer/parseInt line-number))
                                  (catch Exception _ (rc-usage :invalid-line-number)))
                 lines (str/split-lines content)
                 line-count (count lines)
                 _ (when (> line-number line-count)
                     (throw (ex-info (str "Line number (" line-number ") is greater than the number of lines in the file (" line-count ").")
                                     {:cause :line-number-too-high})))

                 {:keys [start end]} (line-bounds content line-number)
                 corpus (str/join "\n" (take
                                        (- end start)
                                        (drop (dec start) lines)))]
             (println (str "Checking chunk containing line " line-number ": \n----"))
             (println corpus)
             (println "----")
             (let [result (assoc
                           (can-read-content? corpus)
                           :starting-at (str/join "\n" [(nth lines (dec start)) (nth lines start)]))]
               #_:clj-kondo/ignore
               (prn result)
               result))
           (catch Exception e
             (println "message: " (ex-message e))
             (println "data:    " (pr-str (ex-data e)))
             {:readable false
              :exception true
              :message (ex-message e)
              :data (ex-data e)})))))

(comment ;; hi self

  (readability-check "test/metabase/models/card_test.clj" 20)
  ;; => {:readable true, :starting-at "(ns metabase.models.card-test\n  (:require"}

  (readability-check "test/metabase/models/card_test.clj" 20000)
  ;; => {:readable false, :exception true,
  ;;     :message "Line number 20000 is greater than the number of lines in the file (1472).",
  ;;     :data {:cause :line-number-too-high}}

  (can-read-content? (str/join "\n" ["[" "[" "}" "]" "]"]))
  ;; => {:readable false, :reason "Unmatched delimiter: }, expected: ] to match [ at [2 1]",
  ;;     :data {:type :edamame/error, :line 3, :column 1, :edamame/opened-delimiter "[",
  ;;            :edamame/opened-delimiter-loc {:row 2, :col 1}, :edamame/expected-delimiter "]"}}

  (can-read-content? "[[[]] ")
  ;; => {:readable false, :reason "EOF while reading, expected ] to match [ at [1,1]",
  ;;     :data {:type :edamame/error, :line 1, :column 7, :edamame/expected-delimiter "]",
  ;;            :edamame/opened-delimiter "[", :edamame/opened-delimiter-loc {:row 1, :col 1}}}

  (can-read-content? "1a")
  ;; => {:readable false, :reason "Invalid number: 1a", :data {:type :edamame/error, :line 1, :column 2}}

  (readability-check "mage/mage/be_dev.clj" 220)
  ;; => {:readable true, :starting-at "\n(comment ;; hi self"}

                                        ;soo meta :) :| :(
  ;; these cannot trip it up:
  ")" "}]" #inst "2020" @(atom 1)  #_\) \) #_#_#_a a a
  "uncomment this to try, it works, but is unreadable in bb:"  ;;#something-cool 13
  (readability-check "bin/build/test/i18n/create_artifacts/backend_test.clj" 29)
  ;; => {:readable true, :starting-at "\n(deftest ^:parallel backend-message?"}
  )
(comment

  ;; this should be a test:
  (require '[babashka.fs :as fs])
  (defn read-all-files []
    (set
     (keep (fn [f] (let [result (readability-check f)] (when-not (:readable result) [f result])))
           (str/split-lines (str/join "\n"
                                      (concat (fs/glob "." "**/*.clj")
                                              (fs/glob "." "**/*.cljc")
                                              (fs/glob "." "**/*.cljs")))))))

  ;; run all files in the current directory and subdirectories, including in /jars:
  ;; filtering out readable ones:
  (= (read-all-files) #{{:readable true}}))
