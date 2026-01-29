(ns dev.coverage
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :as t]
   [metabase.util.malli.registry :as m.registry]
   [rewrite-clj.node :as n]
   [rewrite-clj.zip :as rz]))

(set! *warn-on-reflection* true)

(defn- test-results [fq-test-name]
  (let [test-var (find-var fq-test-name)
        results (atom false)]
    (binding [t/report (fn [m]
                         (case (:type m)
                           :fail (reset! results true)
                           :error (reset! results true)
                           #_else nil))]
      (t/run-test-var test-var))
    (if @results
      :killed
      :survived)))

(defn ns-coverage [code-namespaces test-namespaces]
  (let [coverage-pairs (atom #{})
        current-test (atom nil)
        original-fns (atom {})]

    ;; Store original functions and wrap them (both public and private)
    (doseq [ns-sym code-namespaces]
      (require ns-sym :reload)
      (let [ns-obj (find-ns ns-sym)]
        (doseq [[var-name var-obj] (ns-interns ns-obj)]
          (when (and (var? var-obj)
                     (or (fn? @var-obj)
                         (instance? clojure.lang.MultiFn @var-obj)))
            (let [original-fn @var-obj
                  full-name (symbol (str ns-sym) (str var-name))]

              ;; Store original function
              (swap! original-fns assoc full-name original-fn)

              ;; Replace with tracking wrapper
              (alter-var-root var-obj
                              (constantly
                               (fn [& args]
                                 (when-let [test @current-test]
                                   (swap! coverage-pairs conj [full-name test]))
                                 (apply original-fn args)))))))))

    ;; Run tests, tracking which test is running
    (doseq [test-ns test-namespaces]
      (require test-ns :reload)
      (let [test-vars (->> (ns-interns test-ns)
                           vals
                           (filter (fn [v] (:test (meta v)))))]
        (doseq [^clojure.lang.Var test-var test-vars]
          (let [test-name (symbol (str test-ns) (name (.sym test-var)))]
            (reset! current-test test-name)
            (t/test-var test-var)))))

    ;; Restore original functions
    (doseq [ns-sym code-namespaces]
      (let [ns-obj (find-ns ns-sym)]
        (doseq [[var-name var-obj] (ns-interns ns-obj)]
          (when-let [original-fn (get @original-fns (symbol (str ns-sym) (str var-name)))]
            (alter-var-root var-obj (constantly original-fn))))))

    ;; Return set of [function, test] tuples
    (let [all-fns (set (keys @original-fns))
          coverage @coverage-pairs
          covered-fns (set (map first coverage))]
      {:coverage-pairs coverage
       :coverage (reduce #(merge-with into %1 %2) {} (for [[f t] coverage]
                                                       {f #{t}}))
       :all-fns all-fns
       :uncovered-fns (set/difference all-fns covered-fns)
       :covered-fns covered-fns})))

(def mutation-rules
  "Map of symbols to their mutations"
  {'and 'or
   'or 'and
   'boolean 'not
   'not 'boolean
   'empty? 'seq
   'seq 'empty?
   'empty 'not-empty
   'not-empty 'empty
   '<= '<
   '< '<=
   '>= '>
   '> '>=
   '= 'not=
   'not= '=
   'for 'doseq
   '+ '-
   '- '+
   '* '/
   '/ '*
   'true 'false
   'false 'true
   'nil? 'some?
   'some? 'nil?
   'inc 'dec
   'dec 'inc
   'when 'when-not
   'when-not 'when
   'if 'if-not
   'if-not 'if
   'do 'comment
   'let 'comment})

(defn find-function-source
  "Find the source code for a fully-qualified function name"
  [fq-name]
  (let [ns-sym (symbol (namespace fq-name))
        fn-name (symbol (name fq-name))]
    (when-let [var-obj (ns-resolve ns-sym fn-name)]
      (when-let [file (:file (meta var-obj))]
        (when (and file (not= file "NO_SOURCE_PATH"))
          (when-let [line (:line (meta var-obj))]
            {:file file
             :line line
             :var var-obj
             :ns ns-sym
             :name fn-name}))))))

(defn read-function-from-file
  "Read the function definition from its source file"
  [{:keys [file line]}]
  (let [;; Try different possible file paths
        possible-paths [(str "src/" file)
                        file
                        (str "test/" file)]
        source-file (first (filter #(and % (.exists (java.io.File. ^String %))) possible-paths))]
    (when-not source-file
      (throw (ex-info (str "Could not find source file for: " file)
                      {:file file
                       :tried possible-paths})))
    (let [source (slurp source-file)
          zloc (rz/of-string source)]
      ;; Find the defn at the specified line
      (loop [loc zloc]
        (when-not (rz/end? loc)
          (if (and (rz/list? loc)
                   (let [first-child (rz/down loc)]
                     (when (and first-child (rz/sexpr-able? first-child))
                       (let [first-sym (rz/sexpr first-child)]
                         ;; Match various function definition forms
                         (or (contains? #{'defn 'defn- 'defmethod} first-sym)
                             ;; Match qualified defn macros like mu/defn, s/defn, etc.
                             (and (symbol? first-sym)
                                  (re-matches #".*defn-?" (name first-sym)))))))
                   (= line (get (meta (rz/node loc)) :row)))
            (rz/string loc)
            (recur (rz/next loc))))))))

(defn- schema-keyword? [k]
  (or (contains? #{:-
                   :string, :int, :double, :boolean, :keyword, :symbol, :nil, :uuid, :inst
                   :vector, :set, :map, :tuple
                   :map-of, :map-of-schema
                   :sequential, :cat
                   :enum :ref :optional :some :maybe :min :max :re}
                 k)
      (m.registry/schema k)))

(defn generate-all-mutations-for-loc
  "Generate all possible mutations at a single location"
  [zloc]
  (when (rz/sexpr-able? zloc)
    (let [sexpr (rz/sexpr zloc)]
      (cond
        ;; Symbol mutations (like and -> or)
        (symbol? sexpr)
        (when-let [replacement (get mutation-rules sexpr)]
          [{:mutation (rz/root-string (rz/replace zloc (n/token-node replacement)))
            :description (str "Replace " sexpr " with " replacement)
            :original sexpr
            :replacement replacement
            :position (meta (rz/node zloc))}])

        ;; Keyword mutations (like :id -> :id__)
        ;; auto-resolved keywords don't work quite right when using rz/sexpr
        ;; so read the string representation instead
        ;; this will expand the namespace to a fully-qualified form
        ;; this requires that *ns* is bound correctly
        (keyword? sexpr)
        (let [keyword-string (rz/string zloc)
              sexpr (read-string keyword-string)]
          (when (not (schema-keyword? sexpr))
            (let [mutated-keyword (keyword (str (name sexpr) "__"))]
              [{:mutation (rz/root-string (rz/replace zloc (n/token-node mutated-keyword)))
                :description (str "Replace " sexpr " with " mutated-keyword)
                :original sexpr
                :replacement mutated-keyword
                :position (meta (rz/node zloc))}])))

        ;; Number mutations (0 -> 1, other numbers -> 0)
        (number? sexpr)
        (let [replacement (if (zero? sexpr) 1 0)]
          [{:mutation (rz/root-string (rz/replace zloc (n/token-node replacement)))
            :description (str "Replace " sexpr " with " replacement)
            :original sexpr
            :replacement replacement
            :position (meta (rz/node zloc))}])

        :else nil))))

(defn walk-and-mutate
  "Walk the AST and generate all possible mutations"
  [zloc]
  (loop [loc zloc
         mutations []]
    (if (rz/end? loc)
      mutations
      (let [new-mutations (or (generate-all-mutations-for-loc loc) [])]
        (recur (rz/next loc) (into mutations new-mutations))))))

(defn generate-mutations
  "Generate all mutations for a function given its fully-qualified name"
  [fq-name]
  (binding [*ns* (find-ns (symbol (namespace fq-name)))]
    (when-let [fn-info (find-function-source fq-name)]
      (when-let [fn-source (read-function-from-file fn-info)]
        (let [zloc (rz/of-string fn-source)
              mutations (walk-and-mutate zloc)]
          {:function fq-name
           :original-source fn-source
           :mutations mutations
           :count (count mutations)})))))

(defn- reduced-if [f p?]
  (fn [& args]
    (let [r (apply f args)]
      (if (p? r)
        (reduced r)
        r))))

(defn test-mutations
  "Test all mutations of a function with specific tests.
   Returns a map with:
   - :killed - mutations that caused test failures
   - :survived - mutations that passed all tests
   - :total - total number of mutations
   - :kill-rate - percentage of mutations killed"
  [fq-name test-names]
  (when-let [mutation-data (generate-mutations fq-name)]
    (let [ns-sym (symbol (namespace fq-name))
          var-obj (find-var fq-name)
          original-fn @var-obj
          original-meta (meta var-obj)
          results (atom {:killed [] :survived []})]

      ;; Test each mutation
      (doseq [[idx mutation] (map-indexed vector (:mutations mutation-data))]
        (try
          (println (str "Testing mutation " (inc idx) "/" (count (:mutations mutation-data))
                        ": " (:description mutation)))

          ;; Evaluate the mutated function to replace the original
          (binding [*ns* (find-ns ns-sym)]
            (eval (read-string (:mutation mutation))))

          ;; Run tests until one fails (early termination)
          (let [result (loop [test-names test-names]
                         (cond
                           (empty? test-names)
                           :survived

                           (= :killed (test-results (first test-names)))
                           :killed

                           :else
                           (recur (rest test-names))))]
            (swap! results update result conj mutation))

          (catch Exception _e
            ;; Mutation caused compilation/runtime error - count as killed
            (swap! results update :killed conj mutation))
          (finally
            ;; Restore the original function AND var metadata
            (alter-var-root var-obj (constantly original-fn))
            (alter-meta! var-obj (constantly original-meta)))))

      (assoc @results :original-source (:original-source mutation-data)))))

(defn- index-by [f coll]
  (into {} (for [v coll] [(f v) v])))

(defn test-namespace [target-ns test-ns-s]
  (let [coverage (ns-coverage [target-ns] test-ns-s)
        mutations (for [[f tests] (:coverage coverage)]
                    (let [results (test-mutations f tests)]
                      (assoc results :function f :tests tests)))
        uncovered (into {}
                        (for [f (:uncovered-fns coverage)
                              :let [fn-info (find-function-source f)
                                    source (when fn-info (read-function-from-file fn-info))]]
                          [f {:function f :original-source source}]))]

    {:uncovered-fns uncovered
     :fully-covered (index-by :function (filter #(empty? (:survived %)) mutations))
     :partially-covered (index-by :function (filter #(seq (:survived %)) mutations))}))

(defn generate-report [target-ns test-ns-s out-file]
  (let [results (test-namespace target-ns test-ns-s)
        s #_:clj-kondo/ignore ;; it's wrapped in `with-out-str`
        (with-out-str
          (println "# Mutation Testing Namespace Report")
          (println)
          (println "Namespace:" target-ns)
          (println)
          (println "Test namespaces:" (str/join ", " (sort test-ns-s)))

          (when (seq (:uncovered-fns results))
            (println)
            (println "## Uncovered Functions")
            (println)
            (println "These functions are never executed when the tests are run.")
            (doseq [{:keys [function original-source]} (sort-by :function (vals (:uncovered-fns results)))]
              (println)
              (println "###" function)
              (println)
              (println "```")
              (println original-source)
              (println "```")))

          (when (seq (:partially-covered results))
            (println)
            (println "## Partially Covered Functions")
            (println)
            (println "These functions are executed but have mutations that survive.")

            (doseq [{:keys [function survived original-source]} (sort-by :function (vals (:partially-covered results)))]
              (println)
              (println "###" function)
              (println)
              (println "Original code")
              (println)
              (println "```")
              (println original-source)
              (println "```")
              (doseq [{:keys [description mutation]} survived]
                (println)
                (println "#### Mutation:" description)
                (println)
                (println "```")
                (println mutation)
                (println "```"))))

          (when (seq (:fully-covered results))
            (println)
            (println "## Fully Covered Functions")
            (println)
            (println "These functions are fully covered by the test namespaces.")
            (doseq [{:keys [original-source function]} (sort-by :function (vals (:fully-covered results)))]
              (println)
              (println "###" function)
              (println)
              (println "Original code")
              (println)
              (println "```")
              (println original-source)
              (println "```"))))]
    (spit out-file s)))

(comment

  ;; Step 1: Manually specify namespaces instead of using discovery
  (def target-ns 'metabase.lib.card)
  (def test-ns 'metabase.lib.card-test)

  (def results (test-namespace target-ns [test-ns]))

  (generate-report 'metabase.lib.card ['metabase.lib.card-test] "mutation-testing-report.lib.card.md")

  (clojure.pprint/pprint results)
  (:fully-covered results)
  (println (:uncovered-fns results))
  (first (:partially-covered results))
  (metabase.util.malli.fn/instrument-ns? *ns*)

  (doseq [{:keys [function survived]} (vals (:partially-covered results))]
    (println)
    (println)
    (println "#" function)
    (doseq [{:keys [description mutation]} survived]
      (println)
      (println "## Description:" description)
      (println)
      (println "```")
      (println mutation)
      (println "```")))

  ;; Load them
  (require target-ns :reload)
  (require test-ns :reload)

  (def c (ns-coverage [target-ns] [test-ns]))
  (clojure.pprint/pprint c)
  (contains? (:all-fns c) 'metabase.queries.models.card/has-temporal-dimension?)

  (metabase.lib.card/source-card-is-model? {:id 1})

  (generate-mutations 'metabase.lib.card/source-card-is-model?)

  (set (map long (map :hits c)))

  (doseq [l
          (take 10 c)]
    (prn l))

  (def fs (split-covered-functions c target-ns))

  (pr-str (namespace (rz/string (rz/of-string "::jj/k"))))
  (count (:hit fs))

  ;; Generate mutations for a function
  (def mutations (generate-mutations 'metabase.queries.models.card/some-function-name))

  ;; See how many mutations were generated
  (:count mutations)

  ;; Look at the mutations
  (doseq [m (:mutations mutations)]
    (println (:description m)))

  (generate-mutations 'metabase.queries.models.card/source-card-id)

  ;; Get tests that call a specific function
  (def fn-name 'metabase.queries.models.card/source-card-id)
  (def tests-for-fn
    (->> (:coverage c)
         (filter (fn [[fn test]] (= fn fn-name)))
         (map second)
         vec))

  ;; Test all mutations with those tests
  (def mutation-results (test-mutations fn-name tests-for-fn))

  ;; See the results
  (println "Total mutations:" (:total mutation-results))
  (println "Killed:" (:killed-count mutation-results))
  (println "Survived:" (:survived-count mutation-results))
  (println "Kill rate:" (* 100 (:kill-rate mutation-results)) "%")

  (test-results 'metabase.lib.card-test/source-card-is-model?-test)

  (t/run-test 'metabase.lib.card-test/source-card-is-model?-test)

  ;; Look at mutations that survived (potential test gaps)
  (doseq [m (:survived mutation-results)]
    (println "SURVIVED:" (:description m))))

(comment

  (def results (test-namespace 'metabase.lib.stage '[metabase.lib.stage-test]))

  (test-mutations 'metabase.lib.card/source-card-is-model? #{'metabase.lib.card-test/source-card-is-model?-test})
  (binding [*ns* (find-ns 'metabase.lib.card)]
    (eval (read-string "(mu/defn source-card-is-model? :- :boolean\n  \"Is the query's source-card a model?\"\n  [query :- ::lib.schema/query]\n  (= (source-card-type query) :model__))"))))
