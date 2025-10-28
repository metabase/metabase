(ns representations.read
  (:require
   [representations.read.impl :as read-impl]
   [representations.schema.representation :as representation]
   [representations.util.malli :as mu]
   [representations.v0.init]))

(defn parse
  "Ensures type is set correctly and de-encodes base64 if necessary."
  [representation]
  (let [coerced (mu/coerce ::representation/representation representation)
        schema (read-impl/representation->schema coerced)]
    (mu/coerce schema coerced)))
