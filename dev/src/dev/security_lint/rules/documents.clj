(ns dev.security-lint.rules.documents
  "Values read out of the JSON columns of application-database rows.

  A row's plain columns are typed by the schema: an id column is an integer, a name is a string, and a string in a
  HoneySQL value position binds as a parameter. A JSON column is not: `visualization_settings`, a document's
  `content`, a card's `parameters` hold whatever the client stored, keywordized on the way back out, and a
  `{:raw ...}` map planted there and read back later by a render job or an export is raw SQL against the
  application database: stored by one request, executed by another context."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.toucan :as toucan]
   [dev.security-lint.vocabulary :as vocab]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(def ^:private coercions
  "Past one of these the value is a number or a string, whatever the document held."
  (into vocab/scalar-coercions '[str name boolean]))

(defn- json-column-read?
  "Whether `node` reads through a JSON column: an accessor whose key is one of [[vocab/json-columns]], a threading
  form with such a keyword as a step, or an accessor, thread, collection function or vector literal over one --
  following a local back to what it was bound to."
  [ctx node]
  (let [node (ast/unmeta node)]
    (boolean
     (cond
       (ast/symbol-node? node)
       (when-let [init (get (:local-inits ctx) ((juxt :row :col) (meta node)))]
         (json-column-read? ctx init))

       (ast/vector-node? node)
       (some #(json-column-read? ctx %) (ast/children node))

       (ast/call? node)
       (let [head (some-> (ast/head-sym node) name symbol)
             kws  (fn [nd] (into #{} (comp (filter ast/keyword-node?) (map n/sexpr)) (ast/children nd)))]
         (cond
           ;; a coercion makes a scalar of it, and a lookup makes it the map's own value
           (or (contains? coercions head) (contains? '#{get-in get} head)
               (and head (contains? vocab/threading-slots head)))
           (if (and head (contains? vocab/threading-slots head))
             ;; `(-> dc :visualization_settings :link :entity :id)`: a JSON column as a step
             (or (some vocab/json-columns (kws node))
                 (json-column-read? ctx (first (ast/args node))))
             (if (contains? '#{get get-in} head)
               (let [[m path] (ast/args node)]
                 (or (json-column-read? ctx m)
                     (and path (ast/vector-node? (ast/unmeta path))
                          (some vocab/json-columns (kws (ast/unmeta path))))
                     (and path (ast/keyword-node? (ast/unmeta path))
                          (contains? vocab/json-columns (n/sexpr (ast/unmeta path))))))
               false))

           ;; `(:visualization_settings dc)`, and `(:id (:entity (:link (:visualization_settings dc))))`
           (ast/keyword-node? (first (ast/children node)))
           (or (contains? vocab/json-columns (n/sexpr (first (ast/children node))))
               (some #(json-column-read? ctx %) (ast/args node)))

           ;; `(map #(-> % :attrs :entityId) (:content dc))`: the elements are the document's
           (contains? vocab/higher-order-fns head)
           (or (some #(json-column-read? ctx %) (rest (ast/args node)))
               ;; the function literal reads through a JSON column of each element
               (some #(some vocab/json-columns (kws %)) (ast/find-nodes ast/call? (first (ast/args node)))))

           :else false))

       :else false))))

(defn- toucan-values
  "The value positions of a Toucan call: every keyword argument's value after the model, and the values of a map
  literal in the changes position -- except a value written into a JSON column, which is a document going back
  where documents live, encoded on the way."
  [node]
  (let [args    (toucan/args-after-model node)
        column? (fn [k] (and (ast/keyword-node? k) (not (contains? vocab/json-columns (n/sexpr k)))))]
    (concat
     ;; `:id x :name y`
     (for [[k v] (partition 2 1 args)
           :when (column? (ast/unmeta k))]
       v)
     ;; `{:col v}`
     (for [a args
           :let [a (ast/unmeta a)]
           :when (ast/map-node? a)
           [k v] (ast/map-entries a)
           :when (column? (ast/unmeta k))]
       v))))

(defrule json-column-value-in-query-position
  {:name        "Value out of a JSON column used as a query value"
   :enabled     false
   :description (str "A value read out of a JSON column -- a dashcard's `visualization_settings`, a document's "
                     "`content`, a card's `parameters` -- has whatever shape the client stored, keywordized on the "
                     "way back. Put into a Toucan keyword argument or an insert's value slot it is not bound as a "
                     "parameter when it is a map: a `{:raw ...}` stored in a link card's settings, a mention id "
                     "in a comment's content, or an entity id in a document's node attributes is raw SQL against "
                     "the application database whenever a render job, an export or a backfill reads it back.")
   :remediation (str "Coerce the value to the scalar the column holds -- `(long id)`, `u/the-id`, `str` -- before it "
                     "reaches the query, at the read or at the write.")
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-89"
   ;; a migration rewrites documents into columns of its own naming; no request reaches it
   :exempt-files [#"app_db/custom_migrations"]
   :triggers    #{toucan2.core/select toucan2.core/select-one toucan2.core/select-one-fn toucan2.core/select-fn-set
                  toucan2.core/select-fn-vec toucan2.core/select-one-pk toucan2.core/select-pks-set
                  toucan2.core/select-pks-vec toucan2.core/select-fn->fn toucan2.core/select-pk->fn
                  toucan2.core/update! toucan2.core/delete! toucan2.core/exists? toucan2.core/count
                  toucan2.core/insert! toucan2.core/insert-returning-instance! toucan2.core/insert-returning-instances!
                  toucan2.core/insert-returning-pk! toucan2.core/insert-returning-pks!}}
  [{:keys [node] :as ctx}]
  (let [hits (filter #(json-column-read? ctx %) (toucan-values node))]
    (when (seq hits)
      {:message (str "Value read out of a JSON column reaches " (name (ast/head-sym node)) " uncoerced: "
                     (str/join ", " (map ast/->str hits)))})))
