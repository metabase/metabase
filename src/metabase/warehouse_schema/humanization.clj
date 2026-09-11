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

(defn- re-humanize-names!
  "Update the display name of every `entities-reducible` row (Table or Field ones) that the current strategy
  humanizes differently, using `model` for logging and `set-display-name!` to apply the change. A row counts as
  custom, and is left alone, when `custom?` returns true for it."
  [model entities-reducible set-display-name! custom?]
  (run! (fn [{id :id, internal-name :name, display-name :display_name :as row}]
          (let [new-strategy-display-name (name->human-readable-name internal-name)]
            (when (and (not= display-name new-strategy-display-name)
                       (not (custom? row)))
              (log/infof "Updating display name for %s '%s': '%s' -> '%s'"
                         (name model) internal-name display-name new-strategy-display-name)
              (set-display-name! id new-strategy-display-name))))
        (entities-reducible)))

(mu/defn re-humanize-table-and-field-names!
  "Update the non-custom display names of all Tables & Fields in the database using new values from
  `name->human-readable-name`. A display name is custom when a user set one of their own -- recorded as a non-NULL
  `display_name` for a Field and by the `display_name_set` flag for a Table -- or when it differs from the old
  strategy's humanization."
  [old-strategy :- :keyword]
  (letfn [(custom? [{internal-name :name, display-name :display_name
                     user-display-name :user_display_name, user-set? :user_display_name_set}]
            (or (boolean user-set?)
                (some? user-display-name)
                (not= (name->human-readable-name old-strategy internal-name) display-name)))]
    (re-humanize-names! :model/Table warehouse-schema.db/table-names-reducible
                        warehouse-schema.db/set-table-display-name! custom?)
    (re-humanize-names! :model/Field warehouse-schema.db/field-names-reducible
                        warehouse-schema.db/set-field-display-name! custom?)))
