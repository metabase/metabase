(ns mage.fixbot.linear
  "Backward-compatible wrapper — delegates to mage.bot.linear."
  (:require
   [mage.bot.linear :as bot-linear]))

(def fetch-issue bot-linear/fetch-issue)
(def print-issue! bot-linear/print-issue!)
