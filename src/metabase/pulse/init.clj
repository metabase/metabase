(ns metabase.pulse.init
  (:require
   [metabase.pulse.events.dashboard-subscription]
   [metabase.pulse.task.email-remove-legacy-pulse]
   [metabase.pulse.task.send-pulses]))
