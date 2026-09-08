(ns metabase.tasks.helpers
  "Security-lint test example: reached only from tasks."
  (:import (java.security MessageDigest)))

(defn purge! [what] (MessageDigest/getInstance "SHA-1") what)
