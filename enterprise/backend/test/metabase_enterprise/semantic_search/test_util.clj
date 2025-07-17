(ns metabase-enterprise.semantic-search.test-util
  (:require
   [metabase-enterprise.semantic-search.db :as semantic.db]))

(def ^:private init-delay
  (delay
    (when-not @semantic.db/data-source
      (semantic.db/init-db!))))

(defn once-fixture [f]
  (when semantic.db/db-url
    @init-delay
    (f)))

