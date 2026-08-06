(ns metabase.api.macros.params-audit
  "TEMPORARY. Records `defendpoint` param schemas containing a `:map` that says neither `{:closed true}` nor
  `{:closed false}`, so that `metabase.api.macros.params-audit-test` can list what is left to audit.

  Every param map should say which it is: closed, so that a param the endpoint doesn't declare is rejected, or
  explicitly open where that isn't possible. Once nothing is recorded, delete this namespace and its test and have
  [[metabase.api.macros/defendpoint]] reject an unmarked map outright."
  (:require
   [malli.core :as mc]))

(defonce ^{:doc "endpoint location => param type => seq of findings. See [[record!]]."}
  findings
  (atom {}))

(defn- ref-name
  "The registry name a ref-like `schema` points at, for following it and for not following it twice."
  [schema]
  (let [k (if (= (mc/type schema) :ref)
            (first (mc/children schema))
            (mc/form schema))]
    (when (qualified-keyword? k) k)))

(defn unmarked-maps
  "The `:map` schemas inside `schema` whose properties set no `:closed`, at every level of nesting. Each finding is

    {:schema <registry name or nil>, :path <path within that schema>}

  Registry refs are followed, since a map nested behind one is still a map the endpoint accepts. A finding behind a
  ref is attributed to that ref and its path restarts there, so the same shared schema produces the same finding no
  matter which endpoint reaches it -- that is what lets the report group by the schema that owns the map rather than
  repeating it per endpoint. Each name is followed only once, because query schemas are recursive."
  [schema]
  (let [found (volatile! [])
        seen  (volatile! #{})]
    (letfn [(walk [schema owner prefix]
              (mc/walk
               (mc/schema schema)
               (fn [schema path _children _options]
                 (cond
                   (mc/-ref-schema? schema)
                   (when-let [k (ref-name schema)]
                     (when-not (contains? @seen k)
                       (vswap! seen conj k)
                       ;; attribute what's inside to the ref, with a path relative to it
                       (walk (mc/deref schema) k [])))

                   (and (= (mc/type schema) :map)
                        (not (contains? (mc/properties schema) :closed)))
                   (vswap! found conj {:schema owner, :path (into (vec prefix) path)}))
                 schema)))]
      (walk schema nil []))
    (distinct @found)))

(defn record!
  "Record the unmarked `:map`s in the param schemas of one endpoint. `location` identifies the `defendpoint` for the
  report; `params` is the `:params` map of its parsed args."
  [location params]
  (let [found (into {}
                    (keep (fn [param-type]
                            (when-let [schema (get-in params [param-type :schema])]
                              (when-let [ms (seq (unmarked-maps schema))]
                                [param-type (vec ms)]))))
                    [:route :query :body :request])]
    (if (seq found)
      (swap! findings assoc location found)
      (swap! findings dissoc location))
    nil))
