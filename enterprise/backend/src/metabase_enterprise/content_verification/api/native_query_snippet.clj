(ns metabase-enterprise.content-management.api.native-query-snippet
  (:require [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.util.honey-sql-2 :as h2x]))

(defenterprise snippets-collection-filter-clause
  "Clause to filter out snippet collections from the collection query on OSS instances, and instances without the
  content-management feature flag. EE implementation returns `nil`, so as to not filter out snippet collections."
  :feature :content-management
  [])

(defenterprise snippets-collection-children-query
  "Collection children query for snippets on EE."
  :feature :content-management
  [collection {:keys [archived?]}]
  {:select [:id :name :entity_id [(h2x/literal "snippet") :model]]
   :from   [[:native_query_snippet :nqs]]
   :where  [:and
            [:= :collection_id (:id collection)]
            [:= :archived (boolean archived?)]]})
