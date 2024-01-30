(ns metabase.driver.mongo.json
  "This namespace adds mongo specific type encoders to `cheshire`. It is copy of the relevant part of monger's `json`
   namespace.

   TODO !!!! proper docstring that makes sense.

   At the time of writing we are using `cheshire` directly in mongo driver only at 2 places. Running existing tests
   without those encoders in place yields no failures. Even though, I'm adding encoders to avoid surprises. We should
   consider removing those completely as part of further refactor.
   
   Further rethinking way how we handle mongos serialized
   With eg. ObjectId parsing we are loosing information here -- ObjectId effectively becomes string.

   Were we using EJSON v1 shell mode, we could generate and parse ObjectId as found in mongo shell. That would require
   rethink how we work with parameters.

   Parameters in native mongo query as eg `{{x}}` violate json format. So to be able to 

   Refactor? bson package provides functionality to parse EJSON v1. (https://www.mongodb.com/docs/manual/reference/mongodb-extended-json-v1/).
   Parsing EJSON , we would be "
  (:require
   [cheshire.generate])
  (:import
   (org.bson.types BSONTimestamp ObjectId)))

(set! *warn-on-reflection* true)

(cheshire.generate/add-encoder ObjectId
                               (fn [^ObjectId oid ^com.fasterxml.jackson.core.json.WriterBasedJsonGenerator generator]
                                 (.writeString generator (.toString oid))))
(cheshire.generate/add-encoder BSONTimestamp
                               (fn [^BSONTimestamp ts ^com.fasterxml.jackson.core.json.WriterBasedJsonGenerator generator]
                                 (cheshire.generate/encode-map {:time (.getTime ts) :inc (.getInc ts)} generator)))