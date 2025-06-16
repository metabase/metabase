(ns metabase.content-translation.dictionary
  (:require
   [metabase-enterprise.content-translation.dictionary :as ee-dictionary]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]))

(defenterprise translate-content-string
  "OSS version does nothing"
  metabase-enterprise.content-translation.dictionary.translate-content-string
  [msgid]
  msgid)

(defenterprise translate-column-display-name
  "OSS version does nothing"
  metabase-enterprise.content-translation.dictionary.translate-column-display-name
  [column-metadata]
  (log/info "calling oss translate-column-display-name with column-metadata:"
            (pr-str column-metadata))
  (ee-dictionary/translate-column-display-name column-metadata)) ; Call the EE version for now, since I haven't wired this up right
  ; column-metadata)

(defenterprise get-translations
  "OSS version returns empty list"
  metabase-enterprise.content-translation.dictionary.get-translations
  ([]
   (get-translations nil))
  ([_locale]
   []))
