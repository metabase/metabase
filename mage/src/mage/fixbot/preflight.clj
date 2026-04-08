(ns mage.fixbot.preflight
  "Fixbot-specific preflight checks — delegates to shared mage.bot.preflight."
  (:require
   [mage.bot.preflight :as bp]
   [mage.color :as c]))

(set! *warn-on-reflection* true)

(defn preflight!
  "Check all prerequisites for the fixbot workflow. Exits with an error if any fail."
  [& _]
  (bp/check-workmux!)
  (bp/check-nrepl!)
  (bp/check-docker!)
  (bp/check-tmux-status!)
  (bp/check-linear-api-key! :required)
  (bp/check-ee-token!)
  (bp/check-playwright!)
  (bp/check-node-modules!)
  (println (c/green "All preflight checks passed.")))
