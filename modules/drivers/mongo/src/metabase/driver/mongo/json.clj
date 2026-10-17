(ns metabase.driver.mongo.json
  "This namespace adds mongo specific type encoders to [[metabase.util.json]]. It is copy of the relevant part of monger's `json`
   namespace.

   TODO: I believe this namespace should be completely removed. Trying to run tests without those mongo specific
         encoders yield no failures. Unfortunately I was unable to prove it is not needed yet, hence I'm leaving it
         in just to be safe. Removal should be considered during follow-up of monger removal."
  (:require
   [metabase.util.json :as json])
  (:import
   (org.bson.types BSONTimestamp ObjectId)))

(set! *warn-on-reflection* true)

(json/add-encoder ObjectId str)
(json/add-encoder BSONTimestamp
                  (fn [^BSONTimestamp ts]
                    {:time (.getTime ts) :inc (.getInc ts)}))
