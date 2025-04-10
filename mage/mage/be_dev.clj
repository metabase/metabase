(ns mage.be-dev
  (:require
   [bencode.core :as bencode]
   [clojure.string :as str]
   [clojure.tools.reader :as reader]
   [clojure.tools.reader.reader-types :as rt]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn parse-int
  "Parse a string into an integer. Returns nil if parsing fails. Returns the input unchanged if not a string."
  [s-or-i]
  (if (string? s-or-i)
    (let [s (str/trim s-or-i)]
      (try
        (Integer/parseInt s)
        (catch Exception _ nil)))
    s-or-i))

(defn nrepl-port
  "Get the nREPL port from the .nrepl-port file. Throws an ex-info with friendly error message if file not found."
  []
  (try
    (parse-int (slurp ".nrepl-port"))
    (catch java.io.FileNotFoundException _
      (throw (ex-info (str "Metabase backend is not running. To start it, run:\n\n"
                           (c/green "  clj -M:dev:ee:ee-dev:drivers:drivers-dev:dev-start\n\n")
                           "If you prefer a different way to start the backend, please use that instead.\n"
                           "The REPL server creates a .nrepl-port file when it starts.")
                      {:cause :backend-not-running})))))

(defn bootstrap-code
  "Capture output and return it as strings along with the value from the orignal code."
  [code-string]
  (str "
(let [o# (new java.io.StringWriter)
      e# (new java.io.StringWriter)]
  (binding [*out* o#
            *err* e#]
    {:value (do " code-string ")
     :stdout (str o#)
     :stderr (str e#)}))"))

(defn nrepl-eval
  "Evaluate Clojure code in a running nREPL server. With one arg, reads port from .nrepl-port file.
   With two args, uses the provided port number. Returns and formats the evaluation results."
  ([code]
   (try
     (let [port (nrepl-port)]
       (u/debug [port code])
       (nrepl-eval port code))
     (catch clojure.lang.ExceptionInfo e
       (if (= :backend-not-running (:cause (ex-data e)))
         (println (.getMessage e))
         (throw e)))))
  ([port code]
   (try
     (let [port (parse-int port)
           s (java.net.Socket. "localhost" port)
           out (.getOutputStream s)
           in (java.io.PushbackInputStream. (.getInputStream s))
           _ (bencode/write-bencode out {"op" "eval"
                                         "code" (bootstrap-code code)})
           return (update-vals (bencode/read-bencode in) slurp)]
       #_:clj-kondo/ignore
       ;; (prn ["Repl Response:" output])
       (doseq [[k v] return]
         (if (= k "value")
           ;; try to read v, which is a map but comes back as a string:
           (if-let [v (read-string v)]
             (do
               (println "value: " (pr-str (:value v)))
               (println "stdout: " (str/trim (:stdout v)))
               (println "stderr: " (str/trim (:stderr v))))
             (println "value: " v))
           (println (str k ":") v))))
     (catch java.net.ConnectException _
       (println (str "Could not connect to the REPL server on port: " (c/red port) " (found port number in .nrepl-port).\n"
                     "Is the Metabase backend running?\n\n"
                     "To start it, run:\n"
                     (c/green "  clj -M:dev:ee:ee-dev:drivers:drivers-dev:dev-start\n\n")
                     "If you prefer a different way to start the backend, please use that instead."))))))

(defn- strict-readable? [s]
  (let [rdr (rt/string-push-back-reader s)]
    (try
      (loop []
        (let [form (reader/read {:eof ::done} rdr)]
          (when-not (= form ::done)
            (recur))))
      true
      (catch Exception _ false))))

(defn- balanced-parens-in-content?
  [content]
  (try {:balanced (strict-readable? content)}
       (catch Exception e
         (throw (ex-info (str "Part is unbalanced. " (ex-message e))
                         (assoc (ex-data e)
                                :cause :unbalanced))))))

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

(defn- line-bounds [top-level-chunks line-number]
  (if-let [hit (first (filter (fn [chunk] (<= (first chunk) line-number (last chunk)))
                              top-level-chunks))]
    {:start (first hit)
     ;; end is exclusive, so add 1:
     :end (inc (last hit))}
    (throw (ex-info "Line number not found in any top-level form." {:cause :line-number-not-found}))))

(comment

  (line-bounds
   (top-level-form-chunk
    (str/join "\n"                         ;; line
              ["(ns)"                      ;; 1
               ""                          ;; 2
               "(defn square [x] (* x x))" ;; 3
               ""                          ;; 4
               "(defn cube [x] "           ;; 5
               "  (* x x x))"              ;; 6
               ""                          ;; 7
               ]))
   5))

(defn- bp-usage [reason]
  (println)
  (println "Usage: bb be-dev/balanced-parens file-path starting-line-number ending-line-number")
  (println "  file-path:            path to the file to check")
  (println "  line-number: line number to start checking from (inclusive)")
  (println)
  (throw (ex-info "Usage error" {:cause :usage :reason reason})))

(defn balanced-parens?
  "Check if the file has balanced parens.

  If line-number is not provided, check the whole file.
  If line-number is provided, check the top level form file which contains line-number."
  [file & [line-number]]
  (let [content (try (slurp file) (catch Exception _ (bp-usage :missing-file)))]
    (if-not line-number
      (when (balanced-parens-in-content? content)
        #_:clj-kondo/ignore
        (prn {:balanced true :whole-file true}))
      (try (let [line-number (try (if (int? line-number) line-number (Integer/parseInt line-number))
                                  (catch Exception _ (bp-usage :invalid-line-number)))
                 top-level-chunks (top-level-form-chunk content)
                 {:keys [start end]} (line-bounds top-level-chunks line-number)
                 lines (str/split-lines content)
                 corpus (str/join "\n" (take (- end start) (drop start lines)))]
             (println "Checking chunk: \n----")
             (println corpus)
             (println "----")
             (when (balanced-parens-in-content? corpus)
               #_:clj-kondo/ignore
               (prn {:balanced true
                     :range [start end]
                     :start (str/join "\n" [(nth lines (dec start)) (nth lines start)])})))
           (catch Exception e
             (println "message: " (ex-message e))
             (println "data:    " (pr-str (ex-data e))))))))

(comment
  (balanced-parens? "mage/mage/be_dev.clj" 179) ;soo meta (
  ;; these cannot trip it up:
  ")" "}]" #inst "2020" @(atom 1)
  (balanced-parens? "bin/build/test/i18n/create_artifacts/backend_test.clj" 29))
