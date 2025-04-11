(ns src.dev.private-things-test
  (:require
   [clojure-lsp.api]
   [clojure-lsp.feature.command :as lsp-cmd]
   [clojure-lsp.logger]
   [clojure.string :as str]
   [clojure.test :refer :all]))

(set! *warn-on-reflection* true)

(defn- analysis []
  ;; I don't know why LSP has this need to dump the entire analysis to stdout, but suppress it.
  (with-open [w (java.io.OutputStreamWriter. (java.io.OutputStream/nullOutputStream))]
    (binding [*out* w]
      (clojure-lsp.logger/set-logger! nil)
      (let [{:keys [result-code], {:keys [analysis]} :result, :as output}
            (clojure-lsp.api/dump {:output {:filter-keys [:analysis]}})]
        (if (zero? result-code)
          analysis
          output)))))

(defn- ns->var-usages []
  (into {}
        (map (fn [[file-url {:keys [var-usages]}]]
               ;; just source files for now; we can tell people to make private test vars private in the future as
               ;; well.
               (when (and (or (str/includes? file-url "/metabase/src/")
                              (str/includes? file-url "/metabase-enterprise/src/"))
                          (seq var-usages))
                 [(:from (first var-usages))
                  (into #{}
                        (comp (filter #(some-> (:to %) (str/starts-with? "metabase")))
                              (map #(-> (symbol (name (:to %)) (name (:name %)))
                                        (with-meta {::analysis %}))))
                        var-usages)])))
        (analysis)))

(defn symb->usages
  []
  (reduce
   (fn [m [ns-symb ns-usages]]
     (reduce
      (fn [m symb]
        (update m symb #(conj (set %) ns-symb)))
      m
      ns-usages))
   {}
   (ns->var-usages)))

(defn symb->external-usages
  []
  (into {}
        (map (fn [[symb ns-usages]]
               [symb (disj ns-usages (symbol (namespace symb)))]))
        (symb->usages)))

(defn things-that-should-be-private []
  (into {}
        (keep (fn [[symb external-usages]]
                (when (and (not (get-in (meta symb) [::analysis :private]))
                           (empty? external-usages))
                  [symb (meta symb)])))
        (symb->external-usages)))

(defn privatize-symbol! [[symb {:keys [analysis]}]]
  (lsp-cmd/call-command
   :cycle-privacy
   {:loc "?" :db "?"}))

(comment

  (def symb+analysis (first (things-that-should-be-private)))

  (privatize-symbol! symb+analysis))

#_{:clj-kondo/ignore [:unused-private-var]}
(defn- privacy-report
  "Writes privacy report into a file, which is used by the privacy-reporter.yml github action."
  [& _args]
  (when-let [ttsbp (things-that-should-be-private)]
    (spit "privacy_report.txt"
          (str (->> ttsbp
                    (take 10)
                    (map (fn [ns-name] (str "- `" ns-name "`")))
                    (into ["# 🚫🔒 Top 10 things to make private:"])
                    (str/join "\n"))
               "\n"))))

(deftest ^:parallel things-not-used-elsewhere-should-be-private-test
  (testing (str/join \newline ["This var is only used in the namespace it is declared in. Make it private, so"
                               "Kondo can detect if it is unused, and so we have an easier time refactoring it"
                               "in the future (it's a lot easier to change something if you know it's not used"
                               "outside of the current namespace.)"
                               ""
                               "It also makes it easier for someone using this namespace to know what the"
                               "intended 'public API' of it is. You can always make private things public later"
                               "if you need to."
                               ""
                               "For vars that are used in test namespaces, but not in normal source code, you can"
                               "refer to private vars like #'this -- please do that. Don't make things public"
                               "just for the sake of tests."])
    (doseq [symb (things-that-should-be-private)]
      (is (= (symbol (format "%s is ^:private" symb))
             '🚫🔒)))))
