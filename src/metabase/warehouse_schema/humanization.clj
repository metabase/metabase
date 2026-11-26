(ns metabase.warehouse-schema.humanization
  "Humanization of table and field names, e.g. taking an identifier like `my_table` and returning a human-friendly
  one like `My Table`. The Setting `humanization-strategy` determines which implementation is used: `:simple`, which
  replaces underscores and dashes with spaces, or `:none`, an identity function that leaves names as-is."
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.db :as warehouse-schema.db]))

(defn name->human-readable-name
  "Convert a name, such as `num_toucans`, to a human-readable name, such as `Num Toucans`. With one arg, this uses the
  strategy defined by the Setting `humanization-strategy`. With two args, you may specify a custom strategy (intended
  mainly for the internal implementation):

    (humanization-strategy! :simple)
    (name->human-readable-name \"cool_toucans\")                         ;-> \"Cool Toucans\"
    ;; this is the same as:
    (name->human-readable-name (humanization-strategy) \"cool_toucans\") ;-> \"Cool Toucans\"
    ;; specify a different strategy:
    (name->human-readable-name :none \"cool_toucans\")                   ;-> \"cool_toucans\""
  ([s]
   (name->human-readable-name (setting/get :humanization-strategy) s))
  ([strategy s]
   (u.humanization/name->human-readable-name strategy s)))

(defn- re-humanized
  "Batches of the `{:id :display_name}` changes that re-humanize the rows of `model` in `rows`, a reducible of their
  ids, names and display names, leaving out a row whose display name is user-set or not `old-strategy`'s
  humanization of its name."
  [model old-strategy rows]
  (eduction (comp (keep (fn [{id :id, internal-name :name, display-name :display_name, user-display-name :user_display_name}]
                          (let [new-display-name (name->human-readable-name internal-name)]
                            (when (and (not= display-name new-display-name)
                                       (nil? user-display-name)
                                       (= (name->human-readable-name old-strategy internal-name) display-name))
                              (log/infof "Updating display name for %s '%s': '%s' -> '%s'"
                                         (name model) internal-name display-name new-display-name)
                              {:id id :display_name new-display-name}))))
                  (partition-all 1000))
            rows))

(mu/defn re-humanized-tables
  "Batches of the `{:id :display_name}` changes that re-humanize every Table display name that is neither user-set nor
  different from `old-strategy`'s humanization."
  [old-strategy :- :keyword]
  (re-humanized :model/Table old-strategy (warehouse-schema.db/table-names-reducible)))

(mu/defn re-humanized-fields
  "Batches of the `{:id :display_name}` changes that re-humanize every Field display name that is neither user-set nor
  different from `old-strategy`'s humanization."
  [old-strategy :- :keyword]
  (re-humanized :model/Field old-strategy (warehouse-schema.db/field-names-reducible)))
