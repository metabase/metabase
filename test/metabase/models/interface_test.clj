(ns metabase.models.interface-test
  (:require [cheshire.core :as json]
            [expectations :refer [expect]]
            [metabase.mbql.normalize :as normalize]
            [metabase.test.util.log :as tu.log]
            [toucan.models :as t.models]))

;; let's make sure the `:metabase-query`/`:metric-segment-definition`/`:parameter-mappings` normalization functions
;; respond gracefully to invalid stuff when pulling them out of the Database. See #8914

(defn- type-fn [toucan-type in-or-out]
  (-> @@#'t.models/type-fns toucan-type in-or-out))

;; an empty template tag like the one below is invalid. Rather than potentially destroy an entire API response because
;; of one malformed Card, dump the error to the logs and return nil.
(expect
  nil
  (tu.log/suppress-output
    ((type-fn :metabase-query :out)
     (json/generate-string
      {:database 1
       :type     :native
       :native   {:template-tags {"x" {}}}}))))

;; on the other hand we should be a little more strict on the way and disallow you from saving the invalid stuff
(expect
  Exception
  ((type-fn :metabase-query :in)
   {:database 1
    :type     :native
    :native   {:template-tags {"x" {}}}}))

;; `metric-segment-definition`s should avoid explosions coming out of the DB...
(expect
  nil
  (tu.log/suppress-output
    ((type-fn :metric-segment-definition :out)
     (json/generate-string
      {:filter 1000}))))

;; ...but should still throw them coming in
(expect
  Exception
  ((type-fn :metric-segment-definition :in)
   {:filter 1000}))

;; Cheat ;; and override the `normalization-tokens` function to always throw an Exception so we can make sure the
;; Toucan type fn handles the error gracefully
(expect
  nil
  (tu.log/suppress-output
    (with-redefs [normalize/normalize-tokens (fn [& _] (throw (Exception. "BARF")))]
      (doall
       ((type-fn :parameter-mappings :out)
        (json/generate-string
         [{:target [:dimension [:field-id "ABC"]]}]))))))

;; should not eat Exceptions if normalization barfs when saving
(expect
  Exception
  (with-redefs [normalize/normalize-tokens (fn [& _] (throw (Exception. "BARF")))]
    ((type-fn :parameter-mappings :in)
     [{:target [:dimension [:field-id "ABC"]]}])))

;; make sure parameter mappings correctly normalize things like fk->
(expect
  [{:target [:dimension [:fk-> [:field-id 23] [:field-id 30]]]}]
  ((type-fn :parameter-mappings :out)
   (json/generate-string
    [{:target [:dimension [:fk-> 23 30]]}])))

;; ...but parameter mappings we should not normalize things like :target
(expect
  [{:card-id 123, :hash "abc", :target "foo"}]
  ((type-fn :parameter-mappings :out)
   (json/generate-string
    [{:card-id 123, :hash "abc", :target "foo"}])))

;; we should keep empty parameter mappings as empty instead of making them nil (if `normalize` removes them because
;; they are empty)
;; (I think this is to prevent NPEs on the FE? Not sure why we do this)
(expect
  []
  ((type-fn :parameter-mappings :out)
   (json/generate-string [])))
