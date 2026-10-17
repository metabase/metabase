(ns mage.clj-ts.rules.metabase
  "Metabase's own macros: `defendpoint`, `defsetting`, `defenterprise`, Toucan model hooks, Methodical methods,
  i18n, logging and a few `metabase.util` helpers."
  (:require
   [clojure.string :as str]
   [mage.clj-ts.doc :as d]
   [mage.clj-ts.names :as names]
   [mage.clj-ts.parse :as p]
   [mage.clj-ts.rules.core :as rc]
   [mage.clj-ts.translate :as t]))

(set! *warn-on-reflection* true)

(defn- x [ctx node] (t/expr (t/xctx ctx) node))

;;; ------------------------------------------------ defendpoint ------------------------------------------------

(def ^:private endpoint-slots
  ["route params" "query params" "body" "request" "respond" "raise"])

(t/defstmt 'metabase.api.macros/defendpoint
  (fn [ctx node [method route & more]]
    (let [[ret more]  (if (= :- (:k (first more))) [(second more) (drop 2 more)] [nil more])
          [doc more]  (if (p/string-node? (first more)) [(p/string-value (first more)) (rest more)] [nil more])
          [opts more] (if (p/map-node? (first more)) [(first more) (rest more)] [nil more])
          pvec        (first more)
          skip        (- (count (p/forms node)) (count (rest more)))
          {rtype :type rdesc :description} (when ret (rc/*return-doc* ctx ret))
          {pdocs :docs prelude :prelude pnames :names} (t/params ctx pvec)
          doc         (cond-> (or doc "") rdesc (str (when doc "\n\n") "Returns: " rdesc))]
      (-> []
          (cond-> (not (str/blank? doc)) (conj (t/jsdoc doc)))
          (conj [(t/call-docs (str "router." (name (:k method)))
                              (cond-> [(x ctx route)]
                                opts (conj (x ctx opts))
                                true (conj [(d/bracket "(" (vec (map-indexed (fn [i pd] ["/* " (get endpoint-slots i "?") " */ " pd]) pdocs)) ")")
                                            (when rtype [": " rtype])
                                            " => "
                                            (t/body-block (t/at ctx :return) (p/entries node skip) pnames prelude)]))
                              true)
                 ";"])))))

;;; ------------------------------------------------ defsetting -------------------------------------------------

(defn- setting-doc
  "The docstring of a setting: a literal string or `(deferred-tru \"...\")` without arguments."
  [ctx node]
  (or (rc/literal-string ctx node)
      (when (and (p/list-node? node) (= 2 (count (p/forms node))))
        (rc/literal-string ctx (second (p/forms node))))))

(t/defstmt #{'metabase.settings.core/defsetting 'metabase.settings.models.setting/defsetting}
  (fn [ctx _node [name-node doc-node & opts]]
    (let [doc (setting-doc ctx doc-node)
          kvs (partition 2 opts)]
      (-> []
          (cond-> doc (conj (t/jsdoc doc)))
          (conj ["const " (t/sym-doc ctx (p/sym (p/unwrap-meta name-node))) " = defineSetting("
                 (d/bracket "{"
                            (vec (concat (when-not doc [["doc: " (x ctx doc-node)]])
                                         (for [[k v] kvs] [(names/prop-key (names/camel (name (:k k)))) ": " (x ctx v)])))
                            "}" true)
                 ");"])))))

;;; ------------------------------------------------ defenterprise ----------------------------------------------

(t/defstmt #{'metabase.premium-features.core/defenterprise 'metabase.premium-features.defenterprise/defenterprise
             'metabase.premium-features.core/defenterprise-schema
             'metabase.premium-features.defenterprise/defenterprise-schema}
  (fn [ctx node [name-node & more]]
    (let [[ret more] (if (= :- (:k (first more))) [(second more) (drop 2 more)] [nil more])
          [doc more] (if (p/string-node? (first more)) [(p/string-value (first more)) (rest more)] [nil more])
          [ee-ns more] (if (p/symbol-node? (first more)) [(str (p/sym (first more))) (rest more)] [nil more])
          opts       (into {} (map (fn [[k v]] [(:k k) v])) (partition 2 (take-while #(not (or (p/vector-node? %) (p/list-node? %))) more)))
          rest-forms more
          more       (drop-while #(not (or (p/vector-node? %) (p/list-node? %))) more)
          skip       (- (count (p/forms node)) (count (rest more)))
          feature    (some-> (:feature opts) p/unwrap-meta (->> (t/keyword-string ctx)))
          banner     (cond
                       ee-ns   (str "// Open-source version: replaced by " ee-ns " when running Enterprise Edition")
                       feature (if (= feature "none")
                                 "// Enterprise Edition version"
                                 (str "// Enterprise Edition version, used when premium feature \"" feature "\" is enabled"))
                       :else   "// Enterprise Edition version")]
      (rc/function-stmts ctx {:name    (p/sym (p/unwrap-meta name-node))
                              :flags   #{}
                              :ret     ret
                              :doc     doc
                              :arities (if (p/vector-node? (first more))
                                         [{:params (first more) :node node :skip skip}]
                                         (for [arity (drop-while #(not (p/list-node? %)) rest-forms) :when (p/list-node? arity)]
                                           {:params (first (p/forms arity)) :node arity :skip 1}))}
                         {:prefix-comment banner}))))

;;; ------------------------------------------------ Methodical & Toucan hooks ----------------------------------

(defn- methodical-defmethod [ctx node [multifn & more]]
  (let [[qualifier more] (if (and (p/keyword-node? (first more))
                                  (#{:before :after :around :primary} (:k (first more)))
                                  (not (p/vector-node? (second more))))
                           [(:k (first more)) (rest more)]
                           [nil more])
        [dispatch more] [(first more) (rest more)]
        more       (if (p/string-node? (first more)) (rest more) more)
        skip       (- (count (p/forms node)) (count (rest more)))
        multi-k    (when (p/symbol-node? multifn) (p/resolve-sym (:info ctx) (p/sym multifn)))]
    (if (and (= multi-k 'toucan2.core/table-name) (t/model-name ctx dispatch))
      (let [body (first (rest more))]
        [[(t/model-name ctx dispatch) ".tableName = " (if (p/keyword-node? body) (names/js-string (t/keyword-string ctx body)) (x ctx body)) ";"]])
      (rc/method-stmts ctx node {:name-doc      (x ctx multifn)
                                 :qualifier     qualifier
                                 :dispatch-node dispatch
                                 :params-node   (first more)
                                 :skip          skip}))))

(t/defstmt 'methodical.core/defmethod methodical-defmethod)

(doseq [hook ["before-insert" "after-insert" "before-update" "after-update" "before-delete" "after-delete"
              "after-select" "before-select"]]
  (t/defstmt (symbol "toucan2.core" (str "define-" hook))
    (fn [ctx node [model pvec]]
      (let [{pdocs :docs prelude :prelude pnames :names} (t/params ctx pvec)]
        [[(x ctx model) "." (names/camel hook) "(" (d/bracket "(" pdocs ")") " => "
          (t/body-block (t/at ctx :return) (p/entries node 3) pnames prelude) ");"]]))))

(t/defstmt 'toucan2.core/deftransforms
  (fn [ctx _node [model transforms]]
    [[(x ctx model) ".transforms = " (x ctx transforms) ";"]]))

;;; ------------------------------------------------ i18n & logging ---------------------------------------------

(defn- message-template
  "A template literal for a MessageFormat string with `{0}`-style placeholders."
  [ctx fmt-node args]
  (when-let [fmt (rc/literal-string ctx fmt-node)]
    (let [fmt   (str/replace fmt "''" "'")
          parts (re-seq #"\{\d+\}|[^{]+|\{" fmt)]
      (rc/template ctx (for [part parts]
                         (if-let [[_ i] (re-matches #"\{(\d+)\}" part)]
                           (or (nth (vec args) (parse-long i) nil) part)
                           part))))))

(doseq [f ["tru" "trs" "deferred-tru" "deferred-trs"]]
  (t/defexpr (symbol "metabase.util.i18n" f)
    (fn [ctx _node [fmt & args]]
      (if-let [tpl (message-template ctx fmt args)]
        [(names/camel f) tpl]
        t/decline))))

(doseq [level ["trace" "debug" "info" "warn" "error" "fatal"]]
  (t/defexpr (symbol "metabase.util.log" (str level "f"))
    (fn [ctx _node args]
      (let [[e fmt & args] (if (or (p/string-node? (first args)) (= 1 (count args))) (cons nil args) args)
            msg (or (rc/format-template ctx fmt args)
                    (t/call-docs "sprintf" (t/args-docs ctx (cons fmt args))))]
        (t/call-docs (str "log." level) (if e [(x ctx e) msg] [msg]))))))

;;; ------------------------------------------------ metabase.util ----------------------------------------------

(t/defstmt 'metabase.util/prog1
  (fn [ctx node [first-form]]
    (let [c (update ctx :renames assoc "<>" "result")]
      (-> [["const result = " (x c first-form) ";"]]
          (into (t/body-stmts (assoc (t/at c :stmt) :last? false) (p/entries node 2)))
          (into (when (#{:return :yield} (:pos ctx)) (t/emit ctx "result")))))))

(t/defstmt 'metabase.api.common/let-404
  (fn [ctx node [bvec]]
    (let [[pat v] (p/forms bvec)]
      (into (t/bind-stmts ctx pat (t/call-docs "check404" [(x ctx v)]))
            (t/body-stmts ctx (p/entries node 2))))))
