(ns metabase.formatter.core
  (:require
   [metabase.formatter.date]
   [metabase.formatter.impl]
   [metabase.formatter.numbers]
   [potemkin :as p]))

(comment metabase.formatter.date/keep-me
         metabase.formatter.impl/keep-me
         metabase.formatter.numbers/keep-me)

(p/import-vars
 [metabase.formatter.date
  date->iso-string
  datetime->iso-string]
 [metabase.formatter.impl
  ->NumericWrapper
  ->TextWrapper
  NumericWrapper?
  TextWrapper?
  coerce-bignum-to-int
  create-formatter
  format-geographic-coordinates
  graphing-column-row-fns
  make-temporal-str-formatter
  map->NumericWrapper
  map->TextWrapper
  number-formatter
  row-preprocess
  temporal-string?]
 [metabase.formatter.numbers
  format-number])

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.formatter.impl/format-number format-number-and-wrap)
