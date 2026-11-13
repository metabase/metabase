(ns metabase.pulse.init
  (:require
   [metabase.pulse.events.dashboard-subscription]
   [metabase.pulse.events.report-timezone-updated]
   [metabase.pulse.models.pulse-channel-recipient]
   [metabase.pulse.task.email-remove-legacy-pulse]
   [metabase.pulse.task.send-pulses]))
