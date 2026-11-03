#!/usr/bin/env bb
;; Prints the public surface of Clojure files for the blind generator's context.
;;
;;   bb clj-surface.bb surface <file> [--touched 12-30,41-41]
;;   bb clj-surface.bb harness <test-file>
;;
;; Run it from a directory without a bb.edn, or bb resolves the project's dependencies first.

(require '[clojure.string :as str]
         '[rewrite-clj.node :as n]
         '[rewrite-clj.parser :as p])

(def max-harness-lines 200)

(defn- code-children [node]
  (remove #(#{:whitespace :newline :comma :comment} (n/tag %)) (n/children node)))

(defn- head-name [node]
  (when (= :list (n/tag node))
    (let [head (first (code-children node))]
      (when (= :token (n/tag head))
        (n/string head)))))

(defn- base-name [head]
  (last (str/split head #"/")))

(defn- private? [node]
  (let [[head nm] (code-children node)]
    (or (str/ends-with? (n/string head) "-")
        (and nm (= :meta (n/tag nm)) (str/includes? (n/string nm) ":private")))))

(defn- form-name [node]
  (let [[head nm path] (code-children node)]
    (cond
      (nil? nm)                                    nil
      (str/ends-with? (n/string head) "defendpoint") (str (str/upper-case (subs (n/string nm) 1)) " "
                                                          (str/replace (n/string path) "\"" ""))
      (str/ends-with? (n/string head) "defmethod")   (str (n/string nm) " " (some-> path n/string))
      (= :meta (n/tag nm))                         (n/string (last (code-children nm)))
      :else                                        (n/string nm))))

(defn- vector-node?
  "A vector, or a vector with a type hint such as `^Boolean [s]`."
  [node]
  (or (= :vector (n/tag node))
      (and (= :meta (n/tag node))
           (= :vector (some-> (last (code-children node)) n/tag)))))

(defn- arg-vector-index
  "Index of the first vector in `children` that is neither a `:-` schema nor a defmethod's dispatch value."
  [children]
  (let [method? (str/ends-with? (n/string (first children)) "defmethod")]
    (first (keep-indexed (fn [i child]
                           (when (and (vector-node? child)
                                      (not (and (pos? i) (= ":-" (n/string (nth children (dec i))))))
                                      (not (and method? (= i 2))))
                             i))
                         children))))

(declare name-and-doc)

(defn- up-to-arg-vector
  "Children up to and including the argument vector, or each arity's argument vector for a multi-arity form.
  A form with neither prints only its name and docstring, because its other children can be function bodies."
  [node]
  (let [children (code-children node)
        idx      (arg-vector-index children)
        arities  (filter #(and (= :list (n/tag %))
                               (= :vector (some-> (first (code-children %)) n/tag)))
                         children)]
    (cond
      idx
      (str "(" (str/join " " (map n/string (take (inc idx) children))) " …)")

      (seq arities)
      (let [prefix (take-while #(not (some #{%} arities)) children)]
        (str "(" (str/join " " (map n/string prefix)) "\n  "
             (str/join "\n  " (map #(str "(" (n/string (first (code-children %))) " …)") arities))
             ")"))

      :else
      (name-and-doc node))))

(defn- literal-value?
  "A def whose value is a literal or a schema vector is surface, as long as it is short."
  [node]
  (and (#{:vector :map :token :quote} (n/tag (last (code-children node))))
       (< (count (str/split-lines (n/string node))) 15)))

(defn- name-and-doc [node]
  (let [[head nm & more] (code-children node)
        doc              (first (filter #(#{:token :multi-line} (n/tag %)) (take 1 more)))
        doc?             (and doc (str/starts-with? (n/string doc) "\""))]
    (str "(" (n/string head) " " (n/string nm) (when doc? (str " " (n/string doc))) " …)")))

(defn- literal? [node]
  (case (n/tag node)
    (:token :multi-line :regex) true
    (:vector :map :set)         (every? literal? (code-children node))
    false))

(defn- setting-form
  "A defsetting with its description and options. Option values that are code print as `…`, so `:getter` and
  `:setter` bodies stay out."
  [node]
  (let [[head nm desc & opts] (code-children node)]
    (str "(" (n/string head) " " (n/string nm)
         (when desc (str "\n  " (n/string desc)))
         (str/join (for [[k v] (partition-all 2 opts)]
                     (str "\n  " (n/string k) (when v (str " " (if (literal? v) (n/string v) "…"))))))
         ")")))

(defn- surface-form [node]
  (let [head (head-name node)
        base (some-> head base-name)]
    (cond
      (nil? head)                       nil
      (= base "ns")                     (str "(ns " (form-name node) ")")
      (not (str/starts-with? base "def")) nil
      (private? node)                   nil
      (#{"deftest" "defmacro-"} base)    nil
      (str/includes? head "mr/def")     (n/string node)
      (#{"defschema"} base)             (n/string node)
      (and (#{"def" "defonce"} base)
           (literal-value? node))       (n/string node)
      (#{"def" "defonce"} base)         (name-and-doc node)
      (= base "defsetting")             (setting-form node)
      (= base "defmulti")               (name-and-doc node)
      :else                             (up-to-arg-vector node))))

(defn- parse-ranges [spec]
  (when (seq spec)
    (for [r (str/split spec #",") :when (seq r)]
      (mapv parse-long (str/split r #"-")))))

(defn- touched? [ranges node]
  (let [{:keys [row end-row]} (meta node)]
    (some (fn [[a b]] (and row (<= a end-row) (>= b row))) ranges)))

(defn surface [file touched-spec]
  (let [forms   (filter #(= :list (n/tag %)) (n/children (p/parse-file-all file)))
        ranges  (parse-ranges touched-spec)
        printed (keep (fn [form] (when-let [s (surface-form form)] [form s])) forms)
        kept    (set (map first printed))
        changed (for [[form _] printed :when (touched? ranges form)]
                  (if (= "ns" (base-name (head-name form))) "the ns form" (form-name form)))
        hidden  (some #(and (touched? ranges %) (not (kept %))) forms)]
    (str (when (seq ranges)
           (str "Changed by the PR: "
                (str/join "; " (cond-> (vec changed) hidden (conj "private code in this file")))
                (when (and (empty? changed) (not hidden)) "comments or whitespace only")
                "\n\n"))
         (str/join "\n\n" (map second printed)))))

(defn harness [file]
  (let [forms (->> (n/children (p/parse-file-all file))
                   (filter #(= :list (n/tag %)))
                   (remove #(= "deftest" (some-> (head-name %) base-name))))
        lines (str/split-lines (str/join "\n\n" (map n/string forms)))]
    (if (<= (count lines) max-harness-lines)
      (str/join "\n" lines)
      (str/join "\n" (concat (take max-harness-lines lines)
                             [(str ";; … " (- (count lines) max-harness-lines) " more lines cut")])))))

(let [[mode file flag value] *command-line-args*]
  (case mode
    "surface" (println (surface file (when (= flag "--touched") value)))
    "harness" (println (harness file))
    (binding [*out* *err*]
      (println "usage: clj-surface.bb surface <file> [--touched a-b,c-d] | harness <test-file>")
      (System/exit 2))))
