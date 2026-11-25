(ns metabase.public-sharing.test-util)

(defn anonymous-access-refused-message
  [database-name]
  (format (str "%s has database routing enabled and does not allow anonymous access, so a public link on it would"
               " return no data.")
          database-name))

(defn card-value-source-parameter
  [card-id]
  {:id                   "_FILTER_"
   :name                 "Filter"
   :slug                 "filter"
   :type                 "string/="
   :values_source_type   "card"
   :values_source_config {:card_id card-id, :value_field ["field" 1 nil]}})
