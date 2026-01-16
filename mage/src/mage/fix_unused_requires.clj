(ns mage.fix-unused-requires
  "Fix unused requires reported by clj-kondo by removing them from source files."
  (:require
   [babashka.process :as p]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

(defn- run-kondo
  "Run clj-kondo on the given files and return the EDN output."
  [files]
  (let [{:keys [out exit]}
        (p/sh {:out :string
               :err :inherit
               :dir u/project-root-directory}
              "clojure" "-M:kondo"
              "--config" "{:output {:format :edn}}"
              "--lint" (str/join ":" files))]
    (when (and (not= exit 0) (seq out))
      (edn/read-string out))))

(defn- unused-namespace-findings
  "Filter findings to only unused-namespace warnings."
  [findings]
  (->> findings
       (filter #(= :unused-namespace (:type %)))))

(defn- group-by-file
  "Group findings by filename."
  [findings]
  (group-by :filename findings))

(defn- find-require-form
  "Navigate to the :require form inside an ns declaration."
  [zloc]
  (loop [loc (z/down zloc)]
    (when loc
      (let [node (z/sexpr loc)]
        (if (and (sequential? node)
                 (= :require (first node)))
          loc
          (recur (z/right loc)))))))

(defn- namespace-matches?
  "Check if a require spec matches the given namespace symbol."
  [ns-sym spec]
  (cond
    ;; Simple symbol: [foo.bar]
    (symbol? spec)
    (= ns-sym spec)

    ;; Vector form: [foo.bar :as f] or [foo.bar :refer [...]]
    (vector? spec)
    (= ns-sym (first spec))

    ;; List/seq form for prefix notation: (foo bar baz) meaning foo.bar foo.baz
    ;; This is complex and uncommon, skip for now
    :else false))

(defn- remove-require-entry
  "Remove a require entry matching the namespace from a :require form.
   Returns the updated zipper location positioned at the root of the require form."
  [require-loc ns-sym]
  (loop [loc (z/down require-loc)]
    (if (nil? loc)
      ;; No more children, return the require form unchanged
      require-loc
      (let [sexpr (try (z/sexpr loc) (catch Exception _ nil))]
        (cond
          ;; Skip the :require keyword and whitespace/comments (nil sexpr)
          (or (nil? sexpr)
              (= :require sexpr)
              (not (namespace-matches? ns-sym sexpr)))
          (recur (z/right loc))

          ;; Found the matching entry, remove it and return to root
          :else
          (-> loc z/remove z/up))))))

(defn- require-form-empty?
  "Check if a require form only contains the :require keyword (no actual requires)."
  [require-loc]
  (let [children (loop [loc (z/down require-loc)
                        result []]
                   (if (nil? loc)
                     result
                     (let [sexpr (try (z/sexpr loc) (catch Exception _ nil))]
                       (recur (z/right loc)
                              (if (and sexpr (not= :require sexpr))
                                (conj result sexpr)
                                result)))))]
    (empty? children)))

(defn- fix-file!
  "Fix unused requires in a single file.
   Returns true if changes were made."
  [filename unused-namespaces]
  (let [content (slurp filename)
        zloc (z/of-string content {:track-position? true})
        ;; Find the ns form
        ns-loc (loop [loc zloc]
                 (when loc
                   (let [node (z/sexpr loc)]
                     (if (and (sequential? node)
                              (= 'ns (first node)))
                       loc
                       (recur (z/right loc))))))]
    (when ns-loc
      (when-let [require-loc (find-require-form ns-loc)]
        (let [updated-require
              (reduce
               (fn [loc ns-sym]
                 (or (remove-require-entry loc ns-sym) loc))
               require-loc
               unused-namespaces)
              ;; If require form is now empty, remove the entire :require form
              final-loc (if (require-form-empty? updated-require)
                          (z/remove updated-require)
                          updated-require)
              new-content (z/root-string final-loc)]
          (when (not= content new-content)
            (spit filename new-content)
            true))))))

(defn- fix-unused-requires!
  "Main function to fix unused requires. Takes a list of files to check."
  [files]
  (println (c/cyan "Running clj-kondo to find unused requires..."))
  (let [kondo-result (run-kondo files)]
    (if-let [findings (seq (unused-namespace-findings (:findings kondo-result)))]
      (let [by-file (group-by-file findings)]
        (println (c/yellow (str "Found " (count findings) " unused require(s) in "
                                (count by-file) " file(s)")))
        (doseq [[filename file-findings] by-file]
          (let [unused-ns (mapv :ns file-findings)]
            (println (str "  " (c/white filename) ": removing "
                          (str/join ", " (map #(c/red (str %)) unused-ns))))
            (try
              (fix-file! filename unused-ns)
              (catch Exception e
                (println (c/red (str "  Error fixing " filename ": " (ex-message e))))))))
        (println (c/green "Done!")))
      (println (c/green "No unused requires found.")))))

(defn fix-files
  "Fix unused requires in specified files."
  [{:keys [arguments]}]
  (if (seq arguments)
    (fix-unused-requires! arguments)
    (println (c/red "No files specified."))))
