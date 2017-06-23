(ns metabase.models.label-test
  (:require [expectations :refer :all]
            [metabase.models.label :refer [Label]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; Check that we can create a label with the name "Cam" (slug "cam")
;; and update the name to something that will produce the same slug ("cam") without getting a "name already taken" exception
(expect
  (tt/with-temp Label [{:keys [id]} {:name "Cam"}]
    (db/update! Label id, :name "cam")))

;; We SHOULD still see an exception if we try to give something a name that produces a slug that's already been taken
(expect
  clojure.lang.ExceptionInfo
  (tt/with-temp* [Label [{:keys [id]} {:name "Cam"}]
                  Label [_            {:name "Rasta"}]]
    (db/update! Label id, :name "rasta")))
