(ns metabase.app-db.copy-spec
  "The copy spec of each model, saying how copying the application database to another database copies the model's
  table, is a map of:

  - `:skip?`, whether the copy leaves the table out;
  - `:select`, optional, a fn of no arguments returning the HoneySQL fragment merged into `SELECT * FROM <table>` that
    says which rows to read and in what order, all rows in any order by default;
  - `:transform`, optional, a fn of a row and the copy options, a map of `:copy-h2-database-details?`, returning the row
    to write or nil to drop it, the row unchanged by default;
  - `:sequence`, optional, false when the table has no auto-incrementing `id`, or the name of its Postgres id sequence
    when that is not `<table>_id_seq`."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def schema
  "The Malli schema of a copy spec."
  [:map {:closed true}
   [:skip?     :boolean]
   [:select    {:optional true} ifn?]
   [:transform {:optional true} ifn?]
   [:sequence  {:optional true} [:or [:= false] :string]]])

(defmulti spec
  "The copy spec of `model`."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil)))
  (if (= (get-method spec model) (get-method spec :default))
    (throw (ex-info (format "%s has no app-db copy spec" model) {:model model}))
    (spec model)))
