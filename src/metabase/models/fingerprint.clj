(ns metabase.models.fingerprint
  (:require [clojure
             [data :as d]
             [string :as s]]
            [metabase.models
             [field-values :refer [FieldValues]]
             [humanization :as humanization]
             [interface :as i]
             [permissions :as perms]]
            [metabase.sync-database.infer-special-type :as infer-special-type]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel Field :field_fingerprint)


