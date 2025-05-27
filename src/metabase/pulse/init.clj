(ns metabase.pulse.init
  (:require
   [metabase.pulse.events.report-timezone-updated]
   [metabase.pulse.task.email-remove-legacy-pulse]
   [metabase.pulse.task.send-pulses]))
