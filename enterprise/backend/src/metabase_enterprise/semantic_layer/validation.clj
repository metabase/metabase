(ns metabase-enterprise.semantic-layer.validation
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise check-allowed-content
  "Check if the collection's content matches the allowed_content.
  Throws an exception if it does not"
  :feature :semantic-layer
  [content-type collection-id]
  (when #p collection-id
    (when-let [allowed-content #p (t2/select-one-fn :allowed_content [:model/Collection :allowed_content] :id collection-id)]
      (when-not (content-type allowed-content)
        (throw (ex-info "Content type not allowed in this collection" {:content-type content-type, :allowed-content allowed-content})))))

  true)

