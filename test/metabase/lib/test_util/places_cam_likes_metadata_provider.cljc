(ns metabase.lib.test-util.places-cam-likes-metadata-provider
  (:require
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(ns metabase.lib.test-util.places-cam-likes-metadata-provider)

(defn id
  ([]
   1)
  ([table-name]
   (case table-name
     :places 1))
  ([table-name field-name]
   (case table-name
     :places (case field-name
               :id    1
               :liked 2))))

(def metadata-provider
  "Mock metadata provider with metadata similar to the `places-cam-likes` test dataset."
  (lib.tu/mock-metadata-provider
   {:database (merge meta/database
                     {:id 1})
    :tables   [(merge (meta/table-metadata :venues)
                      {:id    1
                       :db-id 1
                       :name  "PLACES"})]
    ;; TODO -- this metadata is a little incomplete, we can add better fingerprints and what not if we need it in
    ;; future tests.
    :fields   [(merge (meta/field-metadata :venues :id)
                      {:table-id 1
                       :id       1})
               (merge (meta/field-metadata :venues :id)
                      {:table-id       1
                       :id             2
                       :name           "LIKED"
                       :base-type      :type/Boolean
                       :effective-type :type/Boolean
                       :fingerprint    nil})]}))
