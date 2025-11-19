(ns metabase.util.workspaces
  (:require
   [clojure.string :as str]
   [toucan2.core :as t2]))

(defn- col-name [kw]
  (let [n (name kw)]
    (if (str/includes? n ".")
      (last (str/split n #"\."))
      n)))

(defn apply-default-workspace-filter
  "Ensure a query defaults to the \"global\" workspace by adding `workspace_id IS NULL`
  unless the parsed args already constrain the workspace (via `:workspace_id`, `:id`,
  or `:toucan/pk`)."
  [model {:keys [kv-args] :as parsed-args}]
  (if (some #(or (= :toucan/pk (key %))
                 (#{"id" "workspace_id"} (col-name (key %))))
            kv-args)
    parsed-args
    (let [t   (t2/table-name model)
          col (keyword (name t) "workspace_id")]
      (assoc parsed-args :kv-args (assoc kv-args col [:is nil])))))
