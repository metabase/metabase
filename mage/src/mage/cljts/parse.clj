(ns mage.cljts.parse
  "Reading Clojure source with rewrite-clj (which keeps comments and positions), plus helpers for looking at nodes
  and resolving symbols through the file's `ns` form."
  (:require
   [clojure.string :as str]
   [rewrite-clj.node :as n]
   [rewrite-clj.parser :as p]))

(set! *warn-on-reflection* true)

(defn parse-string
  "Parse a whole file's text into a rewrite-clj :forms node."
  [s]
  (p/parse-string-all s))

;;; ------------------------------------------------ Node predicates ---------------------------------------------

(def ^:private ignorable-tags #{:whitespace :newline :comma})

(defn tag
  "The rewrite-clj tag of `node`, or nil."
  [node]
  (when node (n/tag node)))

(defn- ignorable? [node] (contains? ignorable-tags (n/tag node)))

(defn significant?
  "A node that is actual code (not whitespace, comments or `#_` discards)."
  [node]
  (not (contains? #{:whitespace :newline :comma :comment :uneval} (n/tag node))))

(defn forms
  "The significant child nodes of `node`."
  [node]
  (if (n/inner? node)
    (filterv significant? (n/children node))
    []))

(defn string-node?
  "A string literal node (single- or multi-line)."
  [node]
  (and node
       (contains? #{:token :multi-line} (n/tag node))
       (some? (:lines node))))

(defn string-value
  "The runtime string of a string node."
  [node]
  (n/sexpr node))

(defn keyword-node?
  "A keyword token node."
  [node]
  (and node
       (= :token (n/tag node)) (contains? node :k)))

(defn symbol-node?
  "A symbol token node."
  [node]
  (and node
       (= :token (n/tag node))
       (not (string-node? node))
       (not (keyword-node? node))
       (symbol? (:value node))))

(defn sym
  "The symbol of a symbol node, or nil."
  [node]
  (when (symbol-node? node) (:value node)))

(defn token-value
  "The value of a non-symbol, non-keyword token (numbers, strings, booleans, nil, chars)."
  [node]
  (n/sexpr node))

(defn list-node?
  "A `(...)` list node."
  [node]
  (and node (= :list (n/tag node))))
(defn vector-node?
  "A `[...]` vector node."
  [node]
  (and node (= :vector (n/tag node))))
(defn map-node?
  "A `{...}` map node."
  [node]
  (and node (= :map (n/tag node))))
(defn set-node?
  "A `#{...}` set node."
  [node]
  (and node (= :set (n/tag node))))

(defn nil-node?
  "A `nil` literal node."
  [node]
  (and (= :token (n/tag node)) (not (string-node? node)) (not (keyword-node? node)) (nil? (:value node))))

(defn meta-target
  "Strip `^meta` wrappers, returning [target-node meta-nodes]."
  [node]
  (loop [node node, metas []]
    (if (contains? #{:meta :meta*} (n/tag node))
      (let [[m target] (forms node)]
        (recur target (conj metas m)))
      [node metas])))

(defn unwrap-meta
  "`node` with any `^meta` wrappers removed."
  [node]
  (when node (first (meta-target node))))

(defn meta-flags
  "Keyword flags (`^:private`, `^:dynamic`) and type hints (`^String`) from meta nodes, as {:flags #{...} :hint sym}."
  [metas]
  (reduce (fn [acc m]
            (cond
              (keyword-node? m) (update acc :flags conj (:k m))
              (symbol-node? m)  (assoc acc :hint (sym m))
              (string-node? m)  (assoc acc :hint (symbol (string-value m)))
              (map-node? m)     (let [kvs (partition 2 (forms m))]
                                  (reduce (fn [acc [k v]]
                                            (if (and (keyword-node? k) (= "true" (str/trim (n/string v))))
                                              (update acc :flags conj (:k k))
                                              acc))
                                          acc kvs))
              :else             acc))
          {:flags #{} :hint nil}
          metas))

(defn position
  "The {:row :col ...} source position of `node`."
  [node]
  (meta node))

(defn source-text
  "The original source text of `node`."
  [node]
  (n/string node))

;;; ------------------------------------------------ Entries (with comments) ------------------------------------

(defn- count-newlines [node]
  (case (n/tag node)
    :newline (count (re-seq #"\n" (n/string node)))
    :comment 1
    0))

(defn comment-text
  "`;; foo` -> `// foo`."
  [node]
  (let [s (str/trimr (n/string node))
        s (str/replace s #"^;+" "")
        s (str/replace s #"^#!" "")]
    (str "//" (if (or (str/blank? s) (str/starts-with? s " ")) s (str " " s)))))

(defn entries
  "The children of `node` after skipping `skip` significant forms, as entries:

    {:type :form,    :node n, :blank? bool}
    {:type :comment, :text \"// ...\", :trailing? bool, :blank? bool}
    {:type :uneval,  :node n, :blank? bool}

  `:blank?` means the source had an empty line before this entry; `:trailing?` means the comment was on the same
  line as the preceding form."
  ([node] (entries node 0))
  ([node skip]
   (if-not (n/inner? node)
     []
     (loop [children (n/children node), skipped 0, newlines 0, prev-end-row nil, started? false, acc []]
       (if-let [c (first children)]
         (let [t (n/tag c)]
           (cond
             (< skipped skip)
             (recur (rest children) (if (significant? c) (inc skipped) skipped) 0
                    (if (significant? c) (:end-row (position c)) prev-end-row) false acc)

             (ignorable? c)
             (recur (rest children) skipped (+ newlines (count-newlines c)) prev-end-row started? acc)

             (= t :comment)
             (let [trailing? (and prev-end-row (= prev-end-row (:row (position c))))]
               (recur (rest children) skipped 1 nil true
                      (conj acc {:type :comment :text (comment-text c) :trailing? (boolean trailing?)
                                 :row (:row (position c))
                                 :blank? (and started? (not trailing?) (>= newlines 2))})))

             :else
             (recur (rest children) skipped 0 (:end-row (position c)) true
                    (conj acc {:type   (if (= t :uneval) :uneval :form)
                               :node   c
                               :blank? (and started? (>= newlines 2))}))))
         acc)))))

;;; ------------------------------------------------ ns form + resolution ---------------------------------------

(def ^:private namespace-normalizations
  "Namespaces whose functions are drop-in replacements for clojure.core ones."
  {"metabase.util.performance" "clojure.core"})

(defn- normalize-ns [s] (get namespace-normalizations s s))

(defn- libspec-entries
  "Parse one `:require` libspec (possibly a prefix list or reader conditional) into [{:ns :alias :refer}]."
  [node prefix]
  (let [node (unwrap-meta node)]
    (case (n/tag node)
      :token        (when-let [s (sym node)]
                      [{:ns (str prefix s)}])
      :reader-macro (mapcat #(libspec-entries % prefix)
                            (filter #(contains? #{:vector :list :token} (n/tag %))
                                    (mapcat forms (filter #(= :list (n/tag %)) (forms node)))))
      (:vector :list)
      (let [[lib & opts] (forms node)
            lib-sym      (sym lib)]
        (if (and lib-sym (seq opts) (not (keyword-node? (first opts))))
          ;; prefix list: (clojure [string :as str] set)
          (mapcat #(libspec-entries % (str prefix lib-sym ".")) opts)
          (let [opts (partition-all 2 opts)
                spec {:ns (str prefix lib-sym)}]
            [(reduce (fn [spec [k v]]
                       (case (:k k)
                         (:as :as-alias) (assoc spec :alias (str (sym v)))
                         :refer          (if (vector-node? v)
                                           (assoc spec :refer (mapv (comp str sym) (filter symbol-node? (forms v))))
                                           (assoc spec :refer-all true))
                         spec))
                     spec opts)])))
      nil)))

(defn ns-info
  "Pull the namespace name, aliases, refers and core exclusions out of the first `ns` form in `root`."
  [root]
  (let [ns-form (first (filter #(and (list-node? %) (= 'ns (sym (first (forms %))))) (forms root)))]
    (if-not ns-form
      {:name nil :aliases {} :refers {} :refer-all #{} :exclude #{}}
      (let [[_ns-sym name-node & clauses] (forms ns-form)
            clauses  (filter list-node? clauses)
            requires (mapcat (fn [clause]
                               (let [[k & specs] (forms clause)]
                                 (when (#{:require :require-macros} (:k k))
                                   (mapcat #(libspec-entries % "") specs))))
                             clauses)
            exclude  (set (for [clause clauses
                                :let [[k & opts] (forms clause)]
                                :when (= :refer-clojure (:k k))
                                [ok ov] (partition-all 2 opts)
                                :when (= :exclude (:k ok))
                                s (forms ov)
                                :when (symbol-node? s)]
                            (str (sym s))))]
        {:name      (some-> (sym (unwrap-meta name-node)) str)
         :aliases   (into {} (for [{:keys [ns alias]} requires :when alias] [alias ns]))
         :refers    (into {} (for [{:keys [ns refer]} requires, r refer] [r ns]))
         :refer-all (set (for [{:keys [ns refer-all]} requires :when refer-all] ns))
         :exclude   exclude}))))

(def ^:private special-forms
  '#{if do let* fn* loop* def quote var try catch finally throw recur new set! . monitor-enter monitor-exit
     letfn* case* import* deftype* reify*})

(def ^:private core-names
  (into #{} (map str) (keys (ns-publics 'clojure.core))))

(def ^:private clojure-test-names
  #{"deftest" "testing" "is" "are" "use-fixtures" "run-tests" "deftest-" "thrown?" "thrown-with-msg?"})

(defn resolve-sym
  "Resolve symbol `s` to a fully-qualified symbol using `info` (from [[ns-info]]), for dispatching translation rules.
  Unknown unqualified symbols are returned as-is."
  [info s]
  (let [ns-part   (namespace s)
        name-part (name s)]
    (cond
      ns-part
      (symbol (normalize-ns (get (:aliases info) ns-part ns-part)) name-part)

      (contains? special-forms s)
      (symbol "clojure.core" name-part)

      (contains? (:refers info) name-part)
      (symbol (normalize-ns (get (:refers info) name-part)) name-part)

      (and (contains? core-names name-part) (not (contains? (:exclude info) name-part)))
      (symbol "clojure.core" name-part)

      (contains? clojure-test-names name-part)
      (symbol "clojure.test" name-part)

      :else s)))

(defn keyword-string
  "The full string for keyword node `node` (without the colon), resolving `::foo` and `::alias/foo`."
  [info node]
  (let [k (:k node)]
    (if (:auto-resolved? node)
      (if-let [alias (namespace k)]
        (str (get (:aliases info) alias alias) "/" (name k))
        (str (or (:name info) "current-ns") "/" (name k)))
      (if (namespace k) (str (namespace k) "/" (name k)) (name k)))))
