(ns metabase.models.label-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.models.label :refer [Label]]
            [metabase.test.util :refer [with-temp with-temp*]]))

;; Check that we can create a label with the name "Cam" (slug "cam")
;; and update the name to something that will produce the same slug ("cam") without getting a "name already taken" exception
(expect
  (with-temp Label [{:keys [id]} {:name "Cam"}]
    (db/update! Label id, :name "cam")))

;; We SHOULD still see an exception if we try to give something a name that produces a slug that's already been taken
(expect
  clojure.lang.ExceptionInfo
  (with-temp* [Label [{:keys [id]} {:name "Cam"}]
               Label [_            {:name "Rasta"}]]
    (db/update! Label id, :name "rasta")))
