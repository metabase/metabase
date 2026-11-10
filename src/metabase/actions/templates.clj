(ns metabase.actions.templates
  "Built-in templates for new secrets and HTTP actions, grouped by the service they call."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [metabase.actions.schema :as actions.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private templates-resource "metabase/actions/templates.edn")

(def ^:private template-categories
  (delay (edn/read-string (slurp (io/resource templates-resource)))))

(mu/defn action-template-categories :- [:sequential ::actions.schema/action-template-category]
  "The built-in secret and HTTP action templates, by service."
  []
  @template-categories)
