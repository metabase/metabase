(ns metabase-enterprise.snippet-collections.api.native-query-snippet
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]))

(defenterprise snippets-collection-filter-clause
  "Clause to filter out snippet collections from the collection query on OSS instances, and instances without the
  snippet-collections feature flag. EE implementation returns `nil`, so as to not filter out snippet collections."
  :feature :snippet-collections
  [])

(defn- with-name-substring
  "Apply a case-insensitive substring filter on `name-col` to `query` when `q` is non-blank.
  Mirrors the OSS helper in `metabase.collections-rest.api` so the EE defenterprise
  implementation behaves identically."
  [query q name-col]
  (if (and q (string? q) (not (str/blank? q)))
    (sql.helpers/where query [:like [:lower name-col] (str "%" (u/lower-case-en q) "%")])
    query))

(defenterprise snippets-collection-children-query
  "Collection children query for snippets on EE."
  :feature :snippet-collections
  [collection {:keys [archived? name-substring]}]
  (-> {:select [:id :collection_id :name :entity_id [(h2x/literal "snippet") :model]]
       :from   [[:native_query_snippet :nqs]]
       :where  [:and
                [:= :collection_id (:id collection)]
                [:= :archived (boolean archived?)]]}
      (with-name-substring name-substring :nqs.name)))
