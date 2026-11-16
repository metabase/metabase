(ns metabase.exec-log.settings
  "Operator controls for the execution-log stream.

  The stream is off by default: `exec-log-sink` starts at `:noop`, so nothing is written and nothing is emitted until
  an admin chooses a sink. `:noop` is also the off switch -- setting it back disables emission without restarting."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting exec-log-sink
  (deferred-tru
   (str "Where execution-log records are written. :noop discards them (the default -- the stream is inert until "
        "an admin turns it on), :file appends one JSON record per line to exec-log-file, :memory keeps them in "
        "process for tests."))
  :type       :keyword
  :default    :noop
  :visibility :admin
  :export?    false
  :encryption :no)

(defsetting exec-log-file
  (deferred-tru
   (str "Filesystem path the :file execution-log sink appends to. Required when exec-log-sink is :file; with no "
        "path set, the file sink writes nothing."))
  :type       :string
  :default    nil
  :visibility :admin
  :export?    false
  :encryption :no)
