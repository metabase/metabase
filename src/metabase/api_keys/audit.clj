(ns metabase.api-keys.audit
  "What the audit spec of an API Key needs beyond its columns."
  (:require
   [metabase.util.events :as u.events]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn details
  "The details to store for the API Key `row` beside its columns: the Permissions Group it belongs to, as the writer saw
  it before the write when the `event` is of the key before it, and its scope when it has one."
  [row {:keys [context previous-object]}]
  (let [previous-group (get-in context [:details :previous-group])]
    (cond-> {:group (if (and previous-group (identical? row previous-object))
                      previous-group
                      (:group (t2/hydrate row :group)))}
      (:scope row) (assoc :scope (:scope row)))))

(defn update-topic
  "The topic to store for the update `event` of an API Key, which is its regeneration when the update changes its prefix."
  [event]
  (if (u.events/changed? event :key_prefix)
    :api-key-regenerate
    :api-key-update))
