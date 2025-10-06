(ns metabase.lib.options
  (:refer-clojure :exclude [uuid])
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defn- mbql-clause? [x]
  (and (vector? x)
       (keyword? (first x))))

(mu/defn options :- [:maybe map?]
  "Return the Metabase lib options map associated with an `x`. Lib options is currently used mostly for
  the `:lib/uuid` we attach to everything to facilitate removing or replacing clauses later, but we will probably
  stick more stuff in here in the future. Some clauses like `:field` use options extensively for different things.

  Normally for an MBQL clause, options are an optional second argument, e.g.

    [:= {:lib/uuid \"03baa510-0415-48ef-987a-462d789c8a02\"} 1 2]

  a la Hiccup or Malli. The default implementation already knows how to handle clauses that follow this shape. For
  historic reasons some MBQL clauses like `:field` or some of the string filter clauses have options as the last
  argument; you'll have to implement this method, and [[with-options]], to deal with the special cases.

  For maps like join specs, options are currently stored under the `:lib/options` key. Does this make sense? Not sure.
  Maybe options should be included directly in the map, but then we'd have to decide which keys are and are not
  options. Is a join `:alias` an option? Probably. What about a `:condition`? It's not optional. So for purposes of
  writing Metabase lib and tracking `:lib/uuid`, this approach seems ok in the short term."
  [x]
  (cond
    (map? x)
    (:lib/options x)

    (mbql-clause? x)
    (when (map? (second x))
      (second x))

    :else
    nil))

(mu/defn with-options
  "Update `x` so its [[options]] are `new-options`. If the clause or map already has options, this will
  *replace* the old options; if it does not, this will set the new options.

  If `x` is a map with `:lib/options` and `new-options` is `empty?`, this will drop `:lib/options` entirely.

  You should probably prefer [[update-options]] to using this directly, so you don't stomp over existing stuff
  unintentionally. Implement this if you need to teach Metabase lib how to support something that doesn't follow the
  usual patterns described in [[options]]."
  [x new-options :- [:maybe map?]]
  (cond
    (map? x)
    (u/assoc-dissoc x :lib/options (not-empty new-options))

    (mbql-clause? x)
    (if ((some-fn nil? map?) (second x))
      (assoc (vec x) 1 new-options)
      (into [(first x) new-options] (rest x)))

    :else
    (throw (ex-info (i18n/tru "Don''t know how to set options for {0}" (pr-str x))
                    {:x x}))))

(defn update-options
  "Update the existing options in an `x` by applying `f` like this:

    (apply f existing-options args)"
  [x f & args]
  (let [current-options (options x)
        new-options     (apply f current-options args)]
    (with-options x new-options)))

(defn ensure-uuid
  "Check that `x` has a `:lib/uuid` in its [[options]]; generate a UUID and add it if it does not
  already have one."
  [x]
  (update-options x (fn [options-map]
                      (cond-> options-map
                        (not (:lib/uuid options-map))
                        (assoc :lib/uuid (str (random-uuid)))))))

(mu/defn uuid :- [:maybe ::lib.schema.common/non-blank-string]
  "Get the `:lib/uuid` associated with something, e.g. an MBQL clause or join."
  [x]
  (:lib/uuid (options x)))
