(ns metabase.lib.schema.mbql-clause
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.types]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

(defonce ^:private ^{:doc "Set of all registered MBQL clause tags e.g. #{:starts-with}"} tag-registry
  (atom #{}))

(defn- tag-schema
  "Build the schema for `::tag`, for a valid MBQL clause tag."
  []
  (into [:enum] (sort @tag-registry)))

(defn- update-tag-schema! []
  (mr/def ::tag
    (tag-schema)))

(defn- tag->registered-schema-name
  "Given an MBQL clause tag like `:starts-with`, return the name of the schema we'll register for it, e.g.
  `:mbql.clause/starts-with`."
  [tag]
  (keyword "mbql.clause" (name tag)))

(defn- clause*-schema
  "Build the schema for `::clause*`, a `:multi` schema that maps MBQL clause tag -> the schema
  in [[clause-schema-registry]]."
  []
  (into [:multi {:dispatch first
                 :error/fn (fn [{:keys [value]} _]
                             (if (vector? value)
                               (str "Invalid " (pr-str (first value)) " clause: " (pr-str value))
                               "not an MBQL clause"))}]
        (map (fn [tag]
               [tag [:ref (tag->registered-schema-name tag)]]))
        @tag-registry))

(defn- update-clause-schema! []
  (mr/def ::clause*
    (clause*-schema)))

;;; whenever [[tag-registry]] is updated, update the `::tag` and `::clause*` schemas.
(add-watch tag-registry
           ::update-schemas
           (fn [_key _ref _old-state _new-state]
             (update-tag-schema!)
             (update-clause-schema!)))

;;; create initial, empty definitions of `::tag` and `::clause*`
(update-tag-schema!)
(update-clause-schema!)

(mr/def ::clause
  [:and
   [:schema
    [:cat
     [:schema [:ref ::tag]]
     [:* any?]]]
   [:ref ::clause*]])

(mu/defn define-mbql-clause
  "Register the `schema` for an MBQL clause with `tag` keyword, and update the `:metabase.lib.schema.mbql-clause/clause`
  so it knows about this clause. Optionally specify the [[expression/type-of]] that this clause returns, inline, if
  the clause always returns a certain type; otherwise you can implement [[expression/type-of]] separately.

  (define-mbql-clause :is-null :- :type/Boolean
    [:tuple
     [:= :is-null]
     ::common/options
     [:ref :metabase.lib.schema.expression/expression]])"
  ([tag :- simple-keyword?
    schema]
   (let [schema-name (tag->registered-schema-name tag)]
     (mr/def schema-name schema)
     ;; only need to update the registry and calculated schemas if this is the very first time we're defining this
     ;; clause. Otherwise since they're wrapped in `:ref` we don't need to recalculate them. This way we can avoid tons
     ;; of pointless recalculations every time we reload a namespace.
     (when-not (contains? @tag-registry tag)
       (swap! tag-registry conj tag)))
   nil)

  ([tag         :- simple-keyword?
    _arrow      :- [:= :-]
    return-type :- [:fn {:error/message "valid base type"} #(isa? % :type/*)]
    schema]
   (define-mbql-clause tag schema)
   (defmethod expression/type-of* tag
     [_clause]
     return-type)
   nil))

;;; TODO -- add more stuff.

(defn catn-clause-schema
  "Helper intended for use with [[define-mbql-clause]]. Create an MBQL clause schema with `:catn`. Use this for clauses
  with variable length. For clauses with fixed argument length, use [[tuple-clause-schema]] instead, since that gives
  slight better error messages and doesn't love to complain about 'potentially recursive seqexes' when you forget to
  wrap args in `:schema`."
  [tag & args]
  {:pre [(simple-keyword? tag)
         (every? vector? args)
         (every? keyword? (map first args))]}
  [:schema
   (into [:catn
          {:error/message (str "Valid " tag " clause")}
          [:tag [:= tag]]
          [:options [:schema [:ref ::common/options]]]]
         args)])

(defn tuple-clause-schema
  "Helper intended for use with [[define-mbql-clause]]. Create a clause schema with `:tuple`. Use this for fixed-length
  MBQL clause schemas. Use [[catn-clause-schema]] for variable-length schemas."
  [tag & args]
  {:pre [(simple-keyword? tag)]}
  (into [:tuple
         {:error/message (str "Valid " tag " clause")}
         [:= tag]
         [:ref ::common/options]]
        args))

;;;; Even more convenient functions!

(defn- define-mbql-clause-with-schema-fn [schema-fn tag & args]
  (let [[return-type & args] (if (= (first args) :-)
                               (cons (second args) (drop 2 args))
                               (cons nil args))
        schema               (apply schema-fn tag args)]
    (if return-type
      (define-mbql-clause tag :- return-type schema)
      (define-mbql-clause tag schema))))

(defn define-tuple-mbql-clause
  "Helper. Combines [[define-mbql-clause]] and [[tuple-clause-schema]]."
  [tag & args]
  (apply define-mbql-clause-with-schema-fn tuple-clause-schema tag args))

(defn define-catn-mbql-clause
  "Helper. Combines [[define-mbql-clause]] and [[catn-clause-schema]]."
  [tag & args]
  (apply define-mbql-clause-with-schema-fn catn-clause-schema tag args))

(defn resolve-schema
  "For REPL/test usage: get the definition of the schema associated with an MBQL clause tag."
  [tag]
  (mr/resolve-schema (tag->registered-schema-name tag)))
