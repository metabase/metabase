(ns metabase.models.pulse-test
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            [medley.core :as m]
            [metabase.db :refer :all]
            (metabase.models [pulse :refer :all]
                             [pulse-card :refer :all])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]))

;; retrieve-pulse

;; retrieve-pulses

;; update-pulse-cards

;; update-pulse-channels

;; create-update-delete-pulse-channel

;; create-pulse

;; update-pulse


;; ## UPDATE-PULSE-CARDS
;; Check that update-pulse-cards inserts/deletes PulseCards as we expect
;(expect
;    [#{}
;     #{:rasta :lucky}
;     #{:rasta :lucky :trashbird}
;     #{:trashbird}
;     #{:crowberto :lucky}
;     #{}
;     #{:rasta}]
;  (tu/with-temp Pulse [pulse {:creator_id      (user->id :rasta)
;                              :name            (tu/random-name)}]
;    (symbol-macrolet [cards (->> (sel :many :field [PulseCard :card_id] :pulse_id (:id pulse))
;                                      (map id->user)
;                                      set)]
;      (let [upd-cards (fn [& card-ids]
;                             (update-pulse-cards pulse (map user->id card-ids))
;                             cards)]
;        [cards
;         (upd-cards :rasta :lucky)
;         (upd-cards :rasta :lucky :trashbird)
;         (upd-cards :trashbird)
;         (upd-cards :crowberto :lucky)
;         (upd-cards)
;         (upd-cards :rasta)]))))
