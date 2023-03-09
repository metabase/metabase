(ns metabase.lib.options
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.shared.util.i18n :as i18n]))

(defn- mbql-clause? [x]
  (and (vector? x)
       (keyword? (first x))))

(defmulti options
  "Return the Metabase lib options map associated with an `mbql-clause-or-map`. Lib options is currently used mostly for
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
  {:arglists '([mbql-clause-or-map])}
  lib.dispatch/dispatch-value)

(defn- default-mbql-clause-options
  [x]
  (when (map? (second x))
    (second x)))

(defmethod options :default
  [x]
  (cond
    (mbql-clause? x)
    (default-mbql-clause-options x)

    (and (map? x) (:lib/type x))
    (:lib/options x)

    :else
    (throw (ex-info (i18n/tru "Don''t know how to get options from {0}" (pr-str x))
                    {:x x}))))

(defmulti with-options
  "Update `mbql-clause-or-map` so its [[options]] are `new-options`. If the clause or map already has options, this will
  *replace* the old options; if it does not, this will the new options.

  You should probably prefer [[update-options]] to using this directly, so you don't stomp over existing stuff
  unintentionally. Implement this if you need to teach Metabase lib how to support something that doesn't follow the
  usual patterns described in [[options]]."
  {:arglists '([mbql-clause-or-map new-options])}
  (fn [mbql-clause-or-map _new-options]
    (lib.dispatch/dispatch-value mbql-clause-or-map)))

(defn- default-mbql-clause-with-options [x new-options]
  (if (map? (second x))
    (assoc (vec x) 1 new-options)
    (into [(first x) new-options] (rest x))))

(defmethod with-options :default
  [x new-options]
  (cond
    (mbql-clause? x)
    (default-mbql-clause-with-options x new-options)

    (and (map? x) (:lib/type x))
    (assoc x :lib/options new-options)

    :else
    (throw (ex-info (i18n/tru "Don''t know how to set options for {0}" (pr-str x))
                    {:x x}))))

(defn update-options
  "Update the existing options in an `mbql-clause-or-map` by applying `f` like this:

    (apply f existing-options args)"
  [mbql-clause-or-map f & args]
  (let [current-options (options mbql-clause-or-map)
        new-options     (apply f current-options args)]
    (with-options mbql-clause-or-map new-options)))

(defn ensure-uuid
  "Check that `mbql-clause-or-map` has a `:lib/uuid` in its [[options]]; generate a UUID and add it if it does not
  already have one."
  [mbql-clause-or-map]
  (update-options mbql-clause-or-map (fn [options-map]
                                       (cond-> options-map
                                         (not (:lib/uuid options-map))
                                         (assoc :lib/uuid (random-uuid))))))
