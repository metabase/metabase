(ns metabase.pulse.init
  (:require
   [metabase.pulse.events.alerts-deleted-on-card-save]
   [metabase.pulse.task.email-remove-legacy-pulse]
   [metabase.pulse.task.send-pulses]))
