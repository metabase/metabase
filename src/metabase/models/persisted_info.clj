(ns metabase.models.persisted-info
  (:require [buddy.core.codecs :as codecs]
            [clojure.string :as str]
            [metabase.query-processor.util :as qputil]
            [toucan.models :as models]))

(defn slug-name [nom]
  (->> (str/replace (str/lower-case nom) #"\s+" "_")
       (take 10)
       (apply str)))

(defn query-hash
  "Base64 string of the hash of a query."
  [query]
  (String. (codecs/bytes->b64 (qputil/query-hash query))))

(models/defmodel PersistedInfo :persisted_info)
