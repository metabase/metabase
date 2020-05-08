(ns metabase.middleware.json-test
  (:require [cheshire.core :as json]
            [expectations :refer [expect]]
            [metabase.plugins.classloader :as classloader]))

;;; JSON encoding tests
;; Required here so so custom Cheshire encoders are loaded
(classloader/require 'metabase.middleware.json)

;; Check that we encode byte arrays as the hex values of their first four bytes
(expect
  "{\"my-bytes\":\"0xC42360D7\"}"
  (json/generate-string {:my-bytes (byte-array [196 35  96 215  8 106 108 248 183 215 244 143  17 160 53 186
                                                213 30 116  25 87  31 123 172 207 108  47 107 191 215 76  92])}))
