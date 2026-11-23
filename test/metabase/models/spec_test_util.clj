(ns metabase.models.spec-test-util
  "Helpers of the tests that check a spec of a model against the model's table."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.models.resolution :as models.resolution]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn load-models!
  "Loads the namespace of every model, and returns the models. A model defines its specs when its namespace loads, and
  Metabase loads some only when they are first used. Without EE, it leaves out the EE models."
  []
  (vec (for [[model nspace] models.resolution/model->namespace
             :when (or config/ee-available? (not (str/starts-with? (str nspace) "metabase-enterprise")))]
         (t2/resolve-model model))))

(defn table-columns
  "The columns of the table of `model` in the app DB."
  [model]
  (into #{}
        (map (comp keyword u/lower-case-en :column_name))
        (t2/query ["SELECT column_name AS column_name FROM information_schema.columns WHERE lower(table_name) = ?"
                   (name (t2/table-name model))])))
