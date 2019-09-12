(ns metabase.test.redefs
  (:require [toucan.util.test :as tt]))

;; wrap `do-with-temp` so it initializes the DB before doing the other stuff it usually does
(when-not (::wrapped? (meta #'tt/do-with-temp))
  (alter-var-root #'tt/do-with-temp (fn [f]
                                      (fn [& args]
                                        (require 'metabase.test.initialize)
                                        ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
                                        (require 'metabase.test.util) ; so with-temp-defaults are loaded
                                        (apply f args))))
  (alter-meta! #'tt/do-with-temp assoc ::wrapped? true))

;; mark `expect-with-temp` as deprecated -- it's not needed for `deftest`-style tests
(alter-meta! #'tt/expect-with-temp assoc :deprecated true)
