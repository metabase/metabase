(ns metabase.metabot.command-test
  (:require [expectations :refer [expect]]
            [metabase.metabot.command :as metabot.cmd]
            [metabase.models.card :refer [Card]]
            [toucan.util.test :as tt]))

;; Check that `metabot/list` returns a string with card information and passes the permissions checks
(expect
  #"2 most recent cards"
  (tt/with-temp* [Card [_]
                  Card [_]]
    (metabot.cmd/command "list")))

;; `metabot/list` shouldn't show archived Cards (#9283)
(expect
  #"1 most recent cards"
  (tt/with-temp* [Card [_]
                  Card [_ {:archived true}]]
    (metabot.cmd/command "list")))
