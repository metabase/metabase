(ns metabase.util.schema-test
  (:require [expectations :refer :all]
            [metabase.util.schema :as su]
            [schema.core :as s]))

;; check that the API error message generation is working as intended
(expect
  "value may be nil, or if non-nil, value must satisfy one of the following requirements: 1) value must be a boolean. 2) value must be a valid boolean string ('true' or 'false')."
  (su/api-error-message (s/maybe (s/cond-pre s/Bool su/BooleanString))))
