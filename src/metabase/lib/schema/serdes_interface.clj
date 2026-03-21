(ns metabase.lib.schema.serdes-interface
  (:require
   [potemkin :as p]))

(p/defprotocol+ IDEncoder
  (-encode-database-id [id-encoder database-id])
  (-encode-table-id [id-encoder table-id])
  (-encode-field-id [id-encoder field-id])
  (-encode-card-id [id-encoder card-id])
  (-encode-segment-id [id-encoder segment-id])
  (-encode-measure-id [id-encoder measure-id]))

(def ^:dynamic *id-encoder* nil)

(defn- assert-id-encoder-bound []
  (assert *id-encoder* "*id-encoder* must be bound, try using metabase.models.serialization/id-encoder"))

(defn encode-database-id [database-id]
  (assert-id-encoder-bound)
  (cond->> database-id
    (int? database-id)
    (-encode-database-id *id-encoder*)))

(defn encode-table-id [table-id]
  (assert-id-encoder-bound)
  (cond->> table-id
    (pos-int? table-id)
    (-encode-table-id *id-encoder*)))

(defn encode-field-id [field-id]
  (assert-id-encoder-bound)
  (cond->> field-id
    (pos-int? field-id)
    (-encode-field-id *id-encoder*)))

(defn encode-card-id [card-id]
  (assert-id-encoder-bound)
  (cond->> card-id
    (pos-int? card-id)
    (-encode-card-id *id-encoder*)))

(defn encode-segment-id [segment-id]
  (assert-id-encoder-bound)
  (cond->> segment-id
    (pos-int? segment-id)
    (-encode-segment-id *id-encoder*)))

(defn encode-measure-id [measure-id]
  (assert-id-encoder-bound)
  (cond->> measure-id
    (pos-int? measure-id)
    (-encode-measure-id *id-encoder*)))

(p/defprotocol+ IDDecoder
  (-decode-database-id [id-decoder database-id])
  (-decode-table-id [id-decoder table-id])
  (-decode-field-id [id-decoder field-id])
  (-decode-card-id [id-decoder card-id])
  (-decode-segment-id [id-decoder segment-id])
  (-decode-measure-id [id-decoder measure-id]))

(def ^:dynamic *id-decoder* nil)

(defn- assert-id-decoder-bound []
  (assert *id-decoder* "*id-decoder* must be bound, try using metabase.models.serialization/id-decoder"))

(defn decode-database-id [database-id]
  (assert-id-decoder-bound)
  (cond->> database-id
    (not (int? database-id))
    (-decode-database-id *id-decoder*)))

(defn decode-table-id [table-id]
  (assert-id-decoder-bound)
  (cond->> table-id
    (not (pos-int? table-id))
    (-decode-table-id *id-decoder*)))

(defn decode-field-id [field-id]
  (assert-id-decoder-bound)
  (cond->> field-id
    (not (pos-int? field-id))
    (-decode-field-id *id-decoder*)))

(defn decode-card-id [card-id]
  (assert-id-decoder-bound)
  (cond->> card-id
    (not (pos-int? card-id))
    (-decode-card-id *id-decoder*)))

(defn decode-segment-id [segment-id]
  (assert-id-decoder-bound)
  (cond->> segment-id
    (not (pos-int? segment-id))
    (-decode-segment-id *id-decoder*)))

(defn decode-measure-id [measure-id]
  (assert-id-decoder-bound)
  (cond->> measure-id
    (not (pos-int? measure-id))
    (-decode-measure-id *id-decoder*)))
