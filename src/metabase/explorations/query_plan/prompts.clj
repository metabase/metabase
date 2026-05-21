(ns metabase.explorations.query-plan.prompts
  "Selmer-based loader for the query-plan prompts. Templates live in
  `resources/explorations/query_plan/prompts/`. Mirrors
  `metabase.explorations.ai-summary.prompts` but with its own template
  directory + cache so the two prompt families stay independently editable
  and the cache can be cleared per-namespace at the REPL."
  (:require
   [clojure.java.io :as io]
   [selmer.parser :as selmer]))

(set! *warn-on-reflection* true)

(def ^:private template-dir "explorations/query_plan/prompts/")

(def ^:private template-cache (atom {}))

(defn- load-template
  "Slurp the template at `<template-dir><filename>` from the classpath, or
  throw if it isn't there."
  [filename]
  (let [path (str template-dir filename)]
    (or (some-> (io/resource path) slurp)
        (throw (ex-info (str "Query-plan prompt template not found on classpath: " path)
                        {:template     filename
                         :resource-path path})))))

(defn- cached-template
  [filename]
  (or (get @template-cache filename)
      (let [t (load-template filename)]
        (swap! template-cache assoc filename t)
        t)))

(defn render
  "Render the named template (relative to
  `resources/explorations/query_plan/prompts/`) with the supplied context
  map. Throws on render failure."
  [filename context]
  (selmer/render (cached-template filename) context))

(defn clear-cache!
  "Drop cached template strings. Useful when iterating at the REPL."
  []
  (reset! template-cache {}))
