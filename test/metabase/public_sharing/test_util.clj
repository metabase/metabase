(ns metabase.public-sharing.test-util
  "Shared helpers for tests of the public sharing module and of the endpoints that create public links.")

(defn anonymous-access-refused-message
  "What a public-link creation endpoint says when the object would reach a routed database that does not allow
  anonymous access."
  [database-name]
  (format (str "%s has database routing enabled and does not allow anonymous access, so a public link on it would"
               " return no data.")
          database-name))

(defn card-value-source-parameter
  "A parameter drawing its value list from the Card with `card-id`."
  [card-id]
  {:id                   "_FILTER_"
   :name                 "Filter"
   :slug                 "filter"
   :type                 "string/="
   :values_source_type   "card"
   :values_source_config {:card_id card-id, :value_field ["field" 1 nil]}})
