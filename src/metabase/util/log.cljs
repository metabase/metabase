(ns metabase.util.log
  (:require
   [goog.log :as glog]
   [goog.string :as gstring]
   [goog.string.format :as gstring.format]
   [lambdaisland.glogi :as log]
   [lambdaisland.glogi.console :as glogi-console])
  (:require-macros
   [metabase.util.log]))

;; The formatting functionality is only loaded if you depend on goog.string.format.
(comment gstring.format/keep-me)

(glogi-console/install!)
(log/set-levels {:glogi/root :info})

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defn is-loggable?
  "Part of the internals of [[glogi-logp]] etc."
  [logger-name level]
  (glog/isLoggable (log/logger logger-name) (log/level level)))

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defn format-msg
  "Part of the internals of [[logf]]."
  [fmt & args]
  (apply gstring/format fmt args))

(defn glogi-level
  "Converts our standard `metabase.util.log` levels to those understood by glogi."
  [level]
  (if (= level :fatal)
    :shout
    level))
