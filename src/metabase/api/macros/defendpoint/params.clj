(ns metabase.api.macros.defendpoint.params
  "Parameter decoding shared by defendpoint and its OpenAPI description."
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.util.malli.registry :as mr]))

(def decode-transformer
  "The request parameter transformations in execution order."
  (mtx/transformer
   (mtx/string-transformer)
   (mtx/json-transformer)
   (mtx/default-value-transformer)
   {:name :api}
   {:name :normalize}
   ;; A param map drops the keys it doesn't declare instead of rejecting them, so a client sending a field the
   ;; endpoint has no use for is still served -- which in turn means every key an endpoint reads has to be declared,
   ;; at every level of nesting. A `{:closed false}` map opts out, for values we deliberately
   ;; pass through as they arrived: a query, viz settings, database details, a settings bag.
   ;;
   ;; Runs last: `:normalize` renames keys into the ones the schema declares, so stripping any earlier would drop
   ;; them before they are recognized.
   (mtx/strip-extra-keys-transformer)))

(defn decoder
  "Cached decoder for one endpoint parameter schema."
  [schema]
  (mr/cached ::decoder schema #(mc/decoder schema decode-transformer)))
