(ns metabase.lib.filter
  (:refer-clojure :exclude [=])
  (:require [metabase.lib.options :as lib.options]
            [metabase.lib.resolve :as lib.resolve]))

(defn = [& args]
  (lib.options/ensure-uuid (into [:=] args)))

(defmethod lib.resolve/resolve :=
  [metadata [_equals options & args]]
  (into [:= options]
        (map (partial lib.resolve/resolve metadata))
        args))
