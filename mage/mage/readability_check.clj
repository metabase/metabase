(ns mage.readability-check
  (:require
   [babashka.fs :as fs]
   [clojure.pprint :as pp]
   [clojure.string :as str]
   [edamame.core :as edamame]
   [flatland.ordered.map :as m]))

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
      {:start (inc (first hit))
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

(defn- read-check-problem [reason]
  (println "There was a problem with the command: " reason)
  (System/exit 0))

(defn- report-chunk
  [corpus line-number start end]
  (let [linums (map str (range start (inc end)))
        maxline-len (apply max (map count linums))
        divider (str (str/join (repeat (inc maxline-len) "-")) "+")]
    (println (str "Checking chunk containing line " line-number ": \n" divider))
    (doseq [[linum line] (map vector linums corpus)]
      (println (format (str "%-" maxline-len "s") linum) "|" line))
    (println divider)))

(defn check
  "Check if the file has balanced parens, and can be read by the Clojure reader.

  Emulation of the Clojure reader, is done by edamame, which has been configured to work with our codebase.

  If line-number is not provided, checks the whole file.
  If line-number is provided, checks the top level form file which contains line-number."
  [file & [line-number]]
  (let [content (try (slurp file) (catch Exception _ (read-check-problem :missing-file)))]
    (if-not line-number
      #_:clj-kondo/ignore
      (let [result (can-read-content? content)]
        (prn result)
        result)
      (try (let [line-number (try (if (int? line-number) line-number (Integer/parseInt line-number))
                                  (catch Exception _ (read-check-problem :invalid-line-number)))
                 lines (str/split-lines content)
                 line-count (count lines)
                 _ (when (> line-number line-count)
                     (throw (ex-info (str "Line number (" line-number ") is greater than the number of lines in the file (" line-count ").")
                                     {:cause :line-number-too-high})))

                 {:keys [start end]} (line-bounds content line-number)
                 start (min start line-number)
                 end (max end line-number)
                 corpus (take (- end start) (drop (dec start) lines))]
             (report-chunk corpus line-number start end)
             (let [result (assoc
                           (can-read-content? (str/join "\n" (concat
                                                              ;; fix edamame reporting by padding missing lines:
                                                              (repeat (dec start) "")
                                                              corpus)))
                           :starting-at (nth lines (dec start))
                           :ending-at (nth lines (dec (dec end))))]
               #_:clj-kondo/ignore
               (pp/pprint result)
               result))
           (catch Exception e
             (let [data (ex-data e)]
               (println "message: " (ex-message e))
               (println "data:    " (pr-str data))
               {:readable false
                :exception true
                :message (ex-message e)
                :data data}))))))

(comment ;; hi self

  (check "test/metabase/models/card_test.clj" 20)
  ;; => {:readable true, :starting-at "(ns metabase.models.card-test\n  (:require"}

  (check "test/metabase/models/card_test.clj" 20000)
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

  (check "mage/mage/readability_check.clj" 160)
  ;; => {:readable true, :starting-at "(comment ;; hi self", :ending-at "  (= (read-all-files) #{{:readable true}}))"}

                                        ;soo meta :) :| :(
  ;; these cannot trip it up:
  ")" "}]" #inst "2020" @(atom 1)  #_\) \) #_#_#_a a a
  "uncomment this to try, it works, but is unreadable in bb:"  ;;#something-cool 13
  (check "bin/build/test/i18n/create_artifacts/backend_test.clj" 29)
  ;; => {:readable true, :starting-at "\n(deftest ^:parallel backend-message?"}

;; this should be a test:
  (require '[babashka.fs :as fs])
  (defn read-all-files []
    (set
     (keep (fn [f] (let [result (check f)] (when-not (:readable result) [f result])))
           (str/split-lines (str/join "\n"
                                      (concat (fs/glob "." "**/*.clj")
                                              (fs/glob "." "**/*.cljc")
                                              (fs/glob "." "**/*.cljs")))))))

  ;; run all files in the current directory and subdirectories, including in /jars:
  ;; filtering out readable ones:
  (= (read-all-files) #{{:readable true}}))
