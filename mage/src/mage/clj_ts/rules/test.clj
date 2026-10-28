(ns mage.clj-ts.rules.test
  "clojure.test and metabase.test, shown Jest-style:

      (deftest foo-test (testing \"x\" (is (= 1 (f)))))
      =>  test(\"foo-test\", () => { describe(\"x\", () => { expect(f()).toEqual(1); }); });

  Scoped test helpers (`mt/with-temp`, `mt/with-temporary-setting-values`, ...) become `using` declarations that
  are undone when the enclosing block ends."
  (:require
   [clojure.string :as str]
   [mage.clj-ts.doc :as d]
   [mage.clj-ts.names :as names]
   [mage.clj-ts.parse :as p]
   [mage.clj-ts.rules.core :as rc]
   [mage.clj-ts.translate :as t]))

(set! *warn-on-reflection* true)

(defn- x [ctx node] (t/expr (t/xctx ctx) node))

(defn- callback-stmt
  "`fname(args, () => { body });`"
  [ctx fname arg-docs body-ents]
  [(t/call-docs fname (conj (vec arg-docs) ["() => " (t/body-block (assoc (t/at ctx :stmt) :last? true) body-ents)]) true)
   ";"])

(t/defstmt 'clojure.test/deftest
  (fn [ctx node [name-node]]
    [(callback-stmt ctx "test" [(names/js-string (str (p/sym (p/unwrap-meta name-node))))] (p/entries node 2))]))

(t/defstmt 'clojure.test/testing
  (fn [ctx node [desc]]
    [(callback-stmt ctx "describe" [(x ctx desc)] (p/entries node 2))]))

;;; ------------------------------------------------ Assertions --------------------------------------------------

(defn- expect
  ([ctx actual matcher arg-docs msg] (expect ctx actual matcher arg-docs msg false))
  ([ctx actual matcher arg-docs msg hug?]
   (t/call-docs [(t/call-docs "expect" (cond-> [actual] msg (conj (x ctx msg)))) "." matcher] arg-docs hug?)))

(defn assertion
  "An `expect(...)` expression for the body of an `is`."
  [ctx form msg]
  (let [form* (p/unwrap-meta form)
        head  (when (p/list-node? form*) (some-> (first (p/forms form*)) p/unwrap-meta p/sym))
        k     (t/resolve-head ctx form*)
        args  (rest (p/forms form*))
        [a b] args
        hug?  (fn [n] (t/huggable-node? ctx n))]
    (cond
      (and (#{'=?} head) (= 2 (count args)))
      (expect ctx (x ctx b) "toMatchObject" [(x ctx a)] msg (or (hug? a) (p/vector-node? a)))

      (and (= k 'clojure.core/=) (= 2 (count args)))
      (expect ctx (x ctx b) "toEqual" [(x ctx a)] msg (or (hug? a) (p/vector-node? a)))

      (and (= k 'clojure.core/not=) (= 2 (count args)))
      (expect ctx (x ctx b) "not.toEqual" [(x ctx a)] msg)

      (and (#{'partial= 'metabase.test/partial=} (or k head)) (= 2 (count args)))
      (expect ctx (x ctx b) "toMatchObject" [(x ctx a)] msg (hug? a))

      (and (#{"malli=" "valid-schema?"} (some-> head name)) (= 2 (count args)))
      (expect ctx (x ctx b) "toMatchSchema" [(t/schema-type ctx a)] msg)

      (= k 'clojure.core/nil?)   (expect ctx (x ctx a) "toBeNull" [] msg)
      (= k 'clojure.core/some?)  (expect ctx (x ctx a) "not.toBeNull" [] msg)
      (= k 'clojure.core/true?)  (expect ctx (x ctx a) "toBe" ["true"] msg)
      (= k 'clojure.core/false?) (expect ctx (x ctx a) "toBe" ["false"] msg)
      (= k 'clojure.core/not)    (expect ctx (x ctx a) "toBeFalsy" [] msg)
      (= k 'clojure.core/empty?) (expect ctx (x ctx a) "toBeEmpty" [] msg)
      (= k 'clojure.core/instance?) (expect ctx (x ctx b) "toBeInstanceOf" [(x ctx a)] msg)
      (= k 'clojure.core/<)      (expect ctx (x ctx a) "toBeLessThan" [(x ctx b)] msg)
      (= k 'clojure.core/>)      (expect ctx (x ctx a) "toBeGreaterThan" [(x ctx b)] msg)
      (#{'clojure.core/re-find 'clojure.core/re-matches} k) (expect ctx (x ctx b) "toMatch" [(x ctx a)] msg)
      (= k 'clojure.string/includes?) (expect ctx (x ctx a) "toContain" [(x ctx b)] msg)

      (= k 'clojure.core/contains?)
      (if (p/keyword-node? (p/unwrap-meta b))
        (expect ctx (x ctx a) "toHaveProperty" [(names/js-string (t/keyword-string ctx (p/unwrap-meta b)))] msg)
        (expect ctx (x ctx a) "toContain" [(x ctx b)] msg))

      (= k 'clojure.test/thrown?)
      (expect ctx ["() => " (t/body-block (t/at ctx :stmt) (p/entries form* 2))] "toThrow" [(x ctx a)] msg)

      (= k 'clojure.test/thrown-with-msg?)
      (expect ctx ["() => " (t/body-block (t/at ctx :stmt) (p/entries form* 3))] "toThrow" [(x ctx b)] msg)

      :else
      (expect ctx (x ctx form) "toBeTruthy" [] msg))))

(t/defexpr 'clojure.test/is
  (fn [ctx _node [form msg]] (assertion ctx form msg)))

(t/defstmt 'clojure.test/are
  (fn [ctx _node [argv template & rows]]
    (let [names (p/forms argv)
          n     (max 1 (count names))
          pat   (d/bracket "[" (mapv #(t/sym-doc ctx (p/sym %)) names) "]")
          body  (if (t/head-is? ctx template '#{clojure.test/is})
                  (x ctx template)
                  (assertion ctx template nil))]
      [["for (const " pat " of "
        (d/bracket "[" (vec (for [row (partition n rows)] (d/bracket "[" (mapv #(x ctx %) row) "]"))) "]")
        ") " (d/block [[body ";"]])]])))

;;; ------------------------------------------------ Scoped helpers ---------------------------------------------

(defn- mt [nm] (symbol "metabase.test" nm))

(t/defstmt #{(mt "with-temp") 'toucan2.tools.with-temp/with-temp}
  (fn [ctx node [bvec]]
    (let [fs     (p/forms bvec)
          groups (loop [fs fs, acc []]
                   (if-let [model (first fs)]
                     (let [bnd   (second fs)
                           attrs (nth fs 2 nil)
                           attrs (when (and attrs (not (p/keyword-node? (p/unwrap-meta attrs)))) attrs)]
                       (recur (drop (if attrs 3 2) fs) (conj acc [model bnd attrs])))
                     acc))]
      (rc/scoped ctx
                 (for [[model bnd attrs] groups]
                   ["using " (if bnd (:doc (t/pattern-doc ctx bnd)) "_") " = "
                    (t/call-docs "withTemp" (cond-> [(x ctx model)] attrs (conj (x ctx attrs))) true) ";"])
                 (p/entries node 2)))))

(t/defstmt #{(mt "with-temporary-setting-values") (mt "with-temporary-raw-setting-values")}
  (fn [ctx node [bvec]]
    (rc/scoped ctx
               [["using _ = withSettings("
                 (d/bracket "{" (vec (for [[k v] (partition 2 (p/forms bvec))]
                                       [(names/prop-key (names/camel (name (or (p/sym k) (:k k))))) ": " (x ctx v)]))
                            "}" true)
                 ");"]]
               (p/entries node 2))))

(t/defstmt #{(mt "with-dynamic-fn-redefs") (mt "with-dynamic-redefs")}
  (fn [ctx node [bvec]]
    (rc/scoped ctx
               (for [[s v] (partition 2 (p/forms bvec))]
                 [(t/call-docs "using _ = mock" [(x ctx s) (x ctx v)] (t/huggable-node? ctx v)) ";"])
               (p/entries node 2))))

(t/defstmt #{(mt "test-drivers") (mt "test-driver") (mt "with-driver")}
  (fn [ctx node [drivers]]
    (let [k (t/resolve-head ctx node)]
      (if (= k (mt "test-drivers"))
        [(callback-stmt ctx "forEachDriver" [(x ctx drivers)] (p/entries node 2))]
        (rc/scoped ctx [["using _ = withDriver(" (x ctx drivers) ");"]] (p/entries node 2))))))

(t/defstmt (mt "dataset")
  (fn [ctx node [ds]]
    (let [ds* (p/unwrap-meta ds)]
      (rc/scoped ctx [["using _ = withDataset(" (if (p/symbol-node? ds*) (names/js-string (str (p/sym ds*))) (x ctx ds)) ");"]]
                 (p/entries node 2)))))

(defn- test-ns? [k]
  (let [ns (namespace k)]
    (and ns (or (str/starts-with? ns "metabase.test") (str/starts-with? ns "metabase-enterprise.test")
                (str/includes? ns ".test-util") (str/ends-with? ns "test-util")))))

(defn- generic-with
  "Heuristic for `mt/with-*` helpers without a specific rule: a leading vector or simple literal is the argument,
  the rest is the body."
  [ctx node args]
  (let [_k     (t/resolve-head ctx node)
        first* (some-> (first args) p/unwrap-meta)
        n-args (cond
                 (nil? first*)                                           0
                 (and (next args) (or (p/vector-node? first*) (p/map-node? first*) (p/set-node? first*)
                                      (p/keyword-node? first*) (p/symbol-node? first*) (p/string-node? first*)))
                 1
                 :else 0)
        fname  (t/sym-doc ctx (p/sym (p/unwrap-meta (first (p/forms node)))))]
    (rc/scoped ctx
               [["using _ = " (t/call-docs fname (mapv #(x ctx %) (take n-args args))) ";"]]
               (p/entries node (inc n-args)))))

;; Registered as a fallback in [[mage.clj-ts.translate]] via the generic-head hook below.
(defn with-fallback
  "Statement translation for unknown `with-*` macros from test namespaces, or nil."
  [ctx node]
  (let [k (t/resolve-head ctx node)]
    (when (and k (test-ns? k) (str/starts-with? (name k) "with-") (next (p/forms node)))
      (generic-with ctx node (rest (p/forms node))))))

(alter-var-root #'t/*stmt-fallback* (constantly with-fallback))

;;; ------------------------------------------------ HTTP & data helpers ----------------------------------------

(defn- http-request [ctx user args]
  (let [[method & more] args
        [status more]   (if (and (= :token (p/tag (first more))) (number? (:value (first more)))) [(first more) (rest more)] [nil more])
        [url & more]    more
        user*           (some-> user p/unwrap-meta)]
    [(if user
       ["api.as(" (if (p/keyword-node? user*) (names/js-string (t/keyword-string ctx user*)) (x ctx user)) ")"]
       "api")
     (when status [".expect(" (x ctx status) ")"])
     (t/call-docs ["." (if (p/keyword-node? (p/unwrap-meta method)) (name (:k (p/unwrap-meta method))) (d/flat-string (x ctx method)))]
                  (into [(x ctx url)] (map #(x ctx %) more))
                  (some-> (last more) (->> (t/huggable-node? ctx))))]))

(t/defexpr #{(mt "user-http-request") (mt "user-real-request")}
  (fn [ctx _node [user & args]] (http-request ctx user args)))

(t/defexpr #{(mt "mbql-query") (mt "run-mbql-query") (mt "$ids") 'metabase.lib.test-util.macros/mbql-query}
  (fn [ctx node [table & more]]
    (let [table* (some-> table p/unwrap-meta)]
      (if (and (p/symbol-node? table*) (not (str/starts-with? (str (p/sym table*)) "$")))
        (t/call-docs (t/sym-doc ctx (p/sym (p/unwrap-meta (first (p/forms node)))))
                     (into [(names/js-string (str (p/sym table*)))] (map #(x ctx %) more))
                     (some-> (last more) (->> (t/huggable-node? ctx))))
        t/decline))))
