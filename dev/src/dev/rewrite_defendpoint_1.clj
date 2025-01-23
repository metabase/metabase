(ns dev.rewrite-defendpoint-1
  (:require
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [rewrite-clj.node :as n]
   [rewrite-clj.parser :as r.parser]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

(mr/def ::zloc vector?)

(mr/def ::defendpoint-loc
  [:and
   ::zloc
   [:fn
    {:error/message "zipper location pointing to list node"}
    #(= (z/tag %) :list)]])

(mr/def ::node
  [:fn
   {:error/message "Valid rewrite-clj node"}
   (fn node? [x]
     (and
      (n/node? x)
      (or (not (n/inner? x))
          (every? node? (n/children x)))))])

(mr/def ::schema-map
  "Map of raw symbol => schema node."
  [:maybe
   [:map-of symbol? ::node]])

(mr/def ::parsed
  [:map
   [:route      ::node]
   [:method     ::node]
   [:fn-args    ::node]
   [:schema-map ::schema-map]])

(mu/defn- parse-defendpoint-1-args :- ::parsed
  [defendpoint :- ::defendpoint-loc]
  (let [symb       (z/down defendpoint)
        method     (z/right symb)
        route      (z/right method)
        args       (z/right route)
        ;; skip over docstring
        fn-args    (if (string? (z/sexpr args))
                     (z/right args)
                     args)
        args       (z/right fn-args)
        schema-map (when (and (= (z/tag args) :map)
                              ;; there has to be more stuff after this
                              (z/right args))
                     (into (ordered-map/ordered-map)
                           (comp (take-while some?)
                                 (partition-all 2)
                                 (map (fn [[k v]]
                                        [(z/sexpr k) (z/node v)])))
                           (iterate z/right (z/down args))))]
    {:route      (z/node route)
     :method     (z/node method)
     :fn-args    (z/node fn-args)
     :schema-map schema-map}))

(mu/defn- route-query-args-symbols :- [:sequential symbol?]
  [{:keys [fn-args], :as _parsed} :- ::parsed]
  (into []
        (comp (take-while some?)
              (take-while #(not= (z/sexpr %) :as))
              (map z/sexpr))
        (iterate z/right (z/down (z/of-node fn-args)))))

(defn- max-key-length [m]
  (transduce
   (comp (map str)
         (map count))
   max
   Long/MIN_VALUE
   (keys m)))

(defn- schema-should-be-optional? [node]
  (case (n/tag node)
    :token  ('#{:any ms/MaybeBooleanValue} (n/sexpr node))
    :vector (= (n/sexpr (first (n/children node))) :maybe)
    :list   (and (= (n/sexpr (first (n/children node))) 'mu/with)
                 (schema-should-be-optional? (second (n/children node))))
    false))

(mu/defn- schema-map->malli :- [:maybe ::node]
  [schema-map :- ::schema-map]
  (when (seq schema-map)
    (n/vector-node
     (into [(n/keyword-node :map)]
           (mapcat (let [max-key-length (max-key-length schema-map)]
                     (fn [[k schema]]
                       [(n/newline-node "\n")
                        (n/whitespace-node "          ")
                        (n/vector-node
                         (concat
                          [(n/keyword-node (keyword k))
                           ;; pad the space between key and schema so the map is nicely aligned.
                           (n/whitespace-node (str/join (repeat (- (+ max-key-length 2)
                                                                   (count (str (keyword k))))
                                                                \space)))]
                          ;; add `:optional` or `:default` values to the map as needed
                          (when (schema-should-be-optional? schema)
                            [(n/map-node
                              ;; apparently the old behavior for booleans coerced `nil`, to `false`, so let's replicate
                              ;; that.
                              (if (= (n/sexpr schema) [:maybe 'ms/BooleanValue])
                                [(n/keyword-node :default) (n/whitespace-node " ") (n/token-node 'false)]
                                [(n/keyword-node :optional) (n/whitespace-node " ") (n/token-node 'true)]))
                             (n/whitespace-node " ")])
                          [schema]))])))
           schema-map))))

(defn- select-keys*
  "Normal Clojure select-keys does not preserve the original map type e.g. ordered-map."
  [m ks]
  (when m
    (into (empty m)
          (filter (let [key-set (set ks)]
                    (fn [[k v]]
                      (when (key-set k)
                        [k v]))))
          m)))

(mu/defn- keys-map :- ::node
  [args :- [:sequential symbol?]]
  (n/map-node [(n/keyword-node :keys)
               (n/whitespace-node " ")
               (n/vector-node (into []
                                    (comp (map n/token-node)
                                          (interpose (n/whitespace-node " ")))
                                    args))]))

(mu/defn- unused-binding? [node :- ::node]
  (and (= (n/tag node) :token)
       (str/starts-with? (n/sexpr node) "_")))

(mu/defn- schema-specifier :- [:maybe [:sequential ::node]]
  [schema :- [:maybe ::node]]
  (when schema
    [(n/whitespace-node " ")
     (n/keyword-node :-)
     (n/whitespace-node " ")
     schema]))

;;;
;;; route params
;;;

(declare query-args-binding
         body-binding)

(mu/defn- route-args-symbols :- [:sequential symbol?]
  [{:keys [route], :as _parsed}]
  (let [route (if (= (n/tag route) :vector)
                (-> route z/of-node z/down z/node)
                route)
        route (n/sexpr route)]
    (assert (string? route)
            (format "Expected route string, got %s" (pr-str route)))
    (map (comp symbol second) (re-seq #":([^:/]+)" route))))

(mu/defn- route-args-schema :- [:maybe ::node]
  [{:keys [schema-map], :as parsed} :- ::parsed]
  (some-> schema-map
          (select-keys* (route-args-symbols parsed))
          ;; route args cannot be optional so fix incorrect schemas if we see them.
          (update-vals (fn [schema]
                         (if (and (= (n/tag schema) :vector)
                                  (= (first (n/sexpr schema)) :maybe))
                           (z/node (-> (z/of-node schema) z/next z/next))
                           schema)))
          schema-map->malli))

(mu/defn- route-args-binding :- ::node
  [parsed]
  (if-let [args (not-empty (route-args-symbols parsed))]
    (keys-map args)
    (n/token-node '_route-params)))

(mu/defn- new-route-param-arg-nodes :- [:maybe [:sequential ::node]]
  [parsed]
  (when (or (not (unused-binding? (route-args-binding parsed)))
            (not (unused-binding? (query-args-binding parsed)))
            (not (unused-binding? (body-binding parsed))))
    (list*
     (route-args-binding parsed)
     (schema-specifier (route-args-schema parsed)))))

;;;
;;; query params
;;;

(mu/defn- query-args-symbols :- [:sequential symbol?]
  [parsed]
  (remove (set (route-args-symbols parsed))
          (route-query-args-symbols parsed)))

(mu/defn- query-args-binding :- ::node
  [parsed]
  (if-let [args (not-empty (query-args-symbols parsed))]
    (keys-map args)
    (n/token-node '_query-params)))

(mu/defn- query-args-schema :- [:maybe ::node]
  [{:keys [schema-map], :as parsed} :- ::parsed]
  (some-> schema-map
          (select-keys* (query-args-symbols parsed))
          schema-map->malli))

(mu/defn- new-query-param-arg-nodes :- [:maybe [:sequential ::node]]
  [parsed :- ::parsed]
  (when (or (not (unused-binding? (query-args-binding parsed)))
            (not (unused-binding? (body-binding parsed))))
    (list*
     (n/newline-node "\n")
     (n/whitespace-node "   ")
     (query-args-binding parsed)
     (schema-specifier (query-args-schema parsed)))))

;;;
;;; body
;;;

(mu/defn- body-binding :- ::node
  [{:keys [fn-args], :as _parsed} :- ::parsed]
  (or (when-let [as (z/find (z/down (z/of-node fn-args))
                            #(= (z/sexpr %) :as))]
        (let [request-map (z/right as)]
          (assert (= #{:body}
                     (set (vals (z/sexpr request-map))))
                  (format "Don't know how to rewrite request map with non-:body keys: %s" (pr-str request-map)))
          (when-let [body-key (z/find (z/down request-map)
                                      #(= (z/sexpr %) :body))]
            (z/node (z/left body-key)))))
      (n/token-node '_body)))

(mu/defn- body-schema :- [:maybe ::node]
  [{:keys [schema-map], :as parsed} :- ::parsed]
  (when schema-map
    (if (= (n/tag (body-binding parsed)) :token)
      ;; body is a plain symbol, do not build a the usual map schema.
      (get schema-map (n/sexpr (body-binding parsed)))
      ;; otherwise body is a destructured map
      (let [body-keys (->> schema-map
                           keys
                           (remove (set (route-args-symbols parsed)))
                           (remove (set (query-args-symbols parsed))))]
        (schema-map->malli (select-keys* schema-map body-keys))))))

(mu/defn- new-body-arg-nodes :- [:maybe [:sequential ::node]]
  [parsed :- ::parsed]
  (when-not (unused-binding? (body-binding parsed))
    (list*
     (n/newline-node "\n")
     (n/whitespace-node "   ")
     (body-binding parsed)
     (schema-specifier (body-schema parsed)))))

;;;
;;; rewriting defendpoint symbol
;;;

(mu/defn- rewrite-defendpoint-symbol :- ::zloc
  [_parsed     :- ::parsed
   defendpoint :- ::defendpoint-loc]
  (z/replace (z/down defendpoint) (n/token-node 'api.macros/defendpoint)))

;;;
;;; rewrite method
;;;

(mu/defn- rewrite-method :- ::zloc
  [_parsed defendpoint :- ::defendpoint-loc]
  (let [method (-> defendpoint z/down z/right)]
    (z/replace method (n/keyword-node (keyword (str/lower-case (name (z/sexpr method))))))))

;;;
;;; rewrite argslist
;;;

(mu/defn- find-route :- [:and
                         ::zloc
                         [:fn
                          {:error/message "zipper location pointing to route node (string or vector)"}
                          #(or (#{:vector :string} (z/tag %))
                               ;; for whatever reason sometimes string nodes are `:token` nodes?
                               (string? (z/sexpr %)))]]
  [defendpoint :- ::defendpoint-loc]
  (-> defendpoint
      z/down    ; symb
      z/right   ; method
      z/right)) ; route

(mu/defn- find-argslist :- [:and
                            ::zloc
                            [:fn
                             {:error/message "zipper location pointing to vector node"}
                             #(= (z/tag %) :vector)]]
  [defendpoint :- ::defendpoint-loc]
  (let [route (find-route defendpoint)]
    ;; first vector after route
    (z/find-next route #(= (z/tag %) :vector))))

(mu/defn- new-args-node :- ::node
  [parsed :- ::parsed]
  (n/vector-node
   (into []
         (mapcat (fn [f]
                   (f parsed)))
         [new-route-param-arg-nodes
          new-query-param-arg-nodes
          new-body-arg-nodes])))

(mu/defn- rewrite-args :- ::zloc
  [parsed      :- ::parsed
   defendpoint :- ::defendpoint-loc]
  (z/replace (find-argslist defendpoint) (new-args-node parsed)))

;;;
;;; Add metadata map if needed
;;;

(mu/defn- add-metadata-map :- ::zloc
  [parsed      :- ::parsed
   defendpoint :- ::defendpoint-loc]
  (if (= (n/tag (:method parsed)) :meta)
    (let [metadata  (first (n/children (:method parsed)))
          node      (if (= (n/tag metadata) :token)
                      ;; TODO -- what about multiple tokens? Does this work?
                      (n/map-node [metadata (n/whitespace-node " ") (n/token-node true)])
                      metadata)]
      (as-> defendpoint defendpoint
        (z/subedit-node defendpoint (fn [defendpoint] (z/insert-left (find-argslist defendpoint) node)))
        (z/subedit-node defendpoint (fn [defendpoint] (z/insert-left (find-argslist defendpoint) (n/newline-node "\n"))))))
    defendpoint))

;;;
;;; rewrite body
;;;

(mu/defn- find-body :- ::zloc
  [defendpoint :- ::defendpoint-loc]
  (z/right (find-argslist defendpoint)))

(mu/defn- rewrite-body :- ::zloc
  [_parsed     :- ::parsed
   defendpoint :- ::defendpoint-loc]
  (let [body (find-body defendpoint)]
    ;; if the first form is a map but there are more forms after, it's the schema map and we can remove it.
    (if (and (= (z/tag body) :map)
             (z/right body))
      (z/remove body)
      body)))

;;;
;;; rewrite entire form
;;;

(mu/defn- rewrite-defendpoint* :- ::zloc
  [defendpoint :- ::defendpoint-loc]
  (let [parsed (parse-defendpoint-1-args defendpoint)]
    (reduce
     (fn [defendpoint f]
       (z/subedit-node defendpoint (partial f parsed)))
     defendpoint
     [rewrite-defendpoint-symbol
      rewrite-method
      add-metadata-map
      rewrite-args
      rewrite-body])))

(mu/defn- defendpoint-node? [node :- ::node]
  (and
   (= (n/tag node) :list)
   (let [first-child (first (n/children node))]
     (and
      (n/symbol-node? first-child)
      (= (n/sexpr first-child) 'api/defendpoint)))))

(mu/defn- kondo-ignore-node? [node :- ::node]
  (and
   (= (n/tag node) :uneval)
   (= (n/sexpr (first (n/children node)))
      {:clj-kondo/ignore [:deprecated-var]})))

(mu/defn- remove-preceding-kondo-ignore-node :- [:maybe ::zloc]
  [defendpoint :- ::defendpoint-loc]
  (when-let [previous (z/left defendpoint)]
    (when (some-> previous z/node kondo-ignore-node?)
      (-> (z/subedit-node
           (z/up defendpoint) ; move up to top-level <forms> node so the kondo ignore form is subeditable
           (fn [_]
             (z/remove previous)))
          ; move back to first child
          z/down))))

(mu/defn- rewrite-defendpoint :- ::defendpoint-loc
  [defendpoint :- ::defendpoint-loc]
  (try
    (-> defendpoint
        rewrite-defendpoint*
        remove-preceding-kondo-ignore-node)
    (catch Throwable e
      (println "Error rewriting defendpoint:" e)
      defendpoint)))

(mu/defn- rewrite-all-defendpoints :- ::zloc
  [zloc :- ::zloc]
  (if-let [defendpoint (z/find-next zloc #(defendpoint-node? (z/node %)))]
    (let [zloc' (rewrite-defendpoint defendpoint)]
      (recur zloc'))
    zloc))

(mu/defn- ns-node?
  [node :- ::node]
  (when (= (n/tag node) :list)
    (let [[first-child] (n/children node)]
      (and (= (n/tag first-child) :token)
           (= (n/sexpr first-child) 'ns)))))

(mu/defn- find-ns-node :- ::zloc
  [zloc :- ::zloc]
  (z/find-depth-first zloc #(ns-node? (z/node %))))

(mu/defn- require-node?
  [node :- ::node]
  (when (= (n/tag node) :list)
    (let [[first-child] (n/children node)]
      (and (= (n/tag first-child) :token)
           (= (n/sexpr first-child) :require)))))

(mu/defn- find-require :- ::zloc
  [zloc :- ::zloc]
  (let [ns-node-loc (find-ns-node zloc)]
    (z/find-depth-first ns-node-loc #(require-node? (z/node %)))))

(mu/defn- has-api-macros-require?
  [require-loc :- ::zloc]
  (z/find-next
   (z/down require-loc)
   (fn [zloc]
     (and (= (z/tag zloc) :vector)
          (let [[first-child] (n/children (z/node zloc))]
            (and (= (n/tag first-child) :token)
                 (= (n/sexpr first-child) 'metabase.api.macros)))))))

(mu/defn- add-api-macros-require :- ::zloc
  [require-loc :- ::zloc]
  ;; keep iterating thru the requires until we find one that should appear after the `metabase.api.macros`
  (letfn [(required-namespace-symb [zloc]
            (when (= (z/tag zloc) :vector)
              (let [[first-child] (n/children (z/node zloc))]
                (when (= (n/tag first-child) :token)
                  (n/sexpr first-child)))))
          (before-or-after [zloc]
            (or (when-let [symb (required-namespace-symb zloc)]
                  (when (= (sort [symb 'metabase.api.macros])
                           [symb 'metabase.api.macros])
                    :before))
                :after))]
    (let [preceding-zloc (loop [zloc (z/find-depth-first require-loc required-namespace-symb)]
                           (case (before-or-after zloc)
                             :before (if (z/rightmost? zloc)
                                       zloc
                                       (recur (z/right zloc)))
                             :after  (z/left zloc)))]
      (-> preceding-zloc
          (z/insert-right (n/vector-node
                           [(n/token-node 'metabase.api.macros)
                            (n/whitespace-node " ")
                            (n/keyword-node :as)
                            (n/whitespace-node " ")
                            (n/token-node 'api.macros)]))
          (z/insert-right (n/whitespace-node " "))
          (z/insert-right (n/newline-node "\n"))))))

(mu/defn- add-macros-namespace-require :- ::zloc
  [top-level-forms :- ::zloc]
  (z/subedit-node
   top-level-forms
   (fn [top-level-forms]
     (let [require-loc (find-require top-level-forms)]
       (if (has-api-macros-require? require-loc)
         require-loc
         (add-api-macros-require require-loc))))))

(mu/defn- rewrite-namespace :- ::zloc
  [top-level-forms :- ::zloc]
  (-> top-level-forms
      add-macros-namespace-require
      rewrite-all-defendpoints))

(defn rewrite-file! [{:keys [^String filename write?], :or {write? true}}]
  {:pre [(string? filename)]}
  (println "Rewriting" filename)
  (let [node            (r.parser/parse-file-all filename)
        top-level-forms (-> (z/of-node node)
                            rewrite-namespace)]
    (letfn [(print-root [w]
              (z/print-root top-level-forms w))]
      (if write?
        (with-open [w (java.io.FileWriter. filename)]
          (print-root w))
        (print-root *out*)))))

(comment
  #_{:clj-kondo/ignore [:unresolved-namespace]}
  (defn- files []
    (->> (metabase.util.files/files-seq (metabase.util.files/get-path "src/metabase/api/"))
         (map str)
         (filter #(str/ends-with? % ".clj"))
         sort)))
