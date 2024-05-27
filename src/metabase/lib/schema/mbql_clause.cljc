(ns metabase.lib.schema.mbql-clause
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.types]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

(defonce ^:private ^{:doc "Set of all registered MBQL clause tags e.g. #{:starts-with}"} tag-registry
  (atom #{}))

(defn tag->registered-schema-name
  "Given an MBQL clause tag like `:starts-with`, return the name of the schema we'll register for it, e.g.
  `:mbql.clause/starts-with`."
  [tag]
  (keyword "mbql.clause" (name tag)))

(def ^:private invalid-clause-schema
  [:fn {:error/message "not a known MBQL clause"} (constantly false)])

(defn- clause-schema
  "Build the schema for `::clause`, a `:multi` schema that maps MBQL clause tag -> the schema
  in [[clause-schema-registry]]."
  []
  (into [:multi
         {:dispatch common/mbql-clause-tag
          :error/fn (fn [{:keys [value]} _]
                      (if-let [tag (common/mbql-clause-tag value)]
                        (str "Invalid " tag " clause: " (pr-str value))
                        "not an MBQL clause"))}
         [::mc/default invalid-clause-schema]]
        (map (fn [tag]
               [tag [:ref (tag->registered-schema-name tag)]]))
        @tag-registry))

(defn- update-clause-schema! []
  (mr/def ::clause
    (clause-schema)))

;;; create an initial empty definition of `::clause`
(update-clause-schema!)

;;; whenever [[tag-registry]] is updated, update the `::tag` and `::clause` schemas.
(add-watch tag-registry
           ::update-schemas
           (fn [_key _ref _old-state _new-state]
             (update-clause-schema!)))

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
    return-type :- ::expression/base-type
    schema]
   (define-mbql-clause tag schema)
   (defmethod expression/type-of-method tag
     [_clause]
     return-type)
   nil))

;;; TODO: Support options more nicely - these don't allow for overriding the options, but we have a few cases where that
;;; is necessary. See for example the inclusion of `string-filter-options` in [[metabase.lib.filter]].

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
          [:tag [:= {:decode/normalize common/normalize-keyword} tag]]
          [:options [:schema [:ref ::common/options]]]]
         args)])

(defn tuple-clause-schema
  "Helper intended for use with [[define-mbql-clause]]. Create a clause schema with `:tuple`. Use this for fixed-length
  MBQL clause schemas. Use [[catn-clause-schema]] for variable-length schemas."
  [tag & args]
  {:pre [(simple-keyword? tag)]}
  (into [:tuple
         {:error/message (str "Valid " tag " clause")}
         [:= {:decode/normalize common/normalize-keyword} tag]
         [:ref ::common/options]]
        args))

;;;; Even more convenient functions!

(defn define-mbql-clause-with-schema-fn
  "Helper. Combines [[define-mbql-clause]] and the result of applying `schema-fn` to `tag` and `args`."
  [schema-fn tag & args]
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
