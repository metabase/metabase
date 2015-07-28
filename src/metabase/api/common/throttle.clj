(ns metabase.api.common.throttle
  (:require [clojure.math.numeric-tower :as math])
  (:import (clojure.lang Atom
                         Keyword)))

;;; # THROTTLING
;;
;; A `Throttler` is a simple object used for throttling API endpoints. It keeps track of all calls to an API endpoint
;; with some value over some past period of time. If the number of calls with this value exceeds some threshold,
;; an exception is thrown, telling a user they must wait some period of time before trying again.
;;
;; ### EXAMPLE
;;
;; Let's consider the email throttling done by POST /api/session.
;; The basic concept here is to keep a list of failed logins over the last hour. This list looks like:
;;
;; (["cam@metabase.com" 1438045261132]
;;  ["cam@metabase.com" 1438045260450]
;;  ["cam@metabase.com" 1438045259037]
;;  ["cam@metabase.com" 1438045258204])
;;
;; Every time there's a login attempt, push a new pair of [email timestamp (milliseconds)] to the front of the list.
;; The list is thus automatically ordered by date, and we can drop the portion of the list with logins that are over
;; an hour old as needed.
;;
;; Once a User has reached some number of login attempts over the past hour (e.g. 5), calculate some delay before
;; they're allowed to try to log in again (e.g., 15 seconds). This number will increase exponentially as the number of
;; recent failures increases (e.g., 40 seconds for 6 failed attempts, 90 for 7 failed attempts, etc).
;;
;; If applicable, calucate the time since the last failed attempt, and throw an exception telling the user the number
;; of seconds they must wait before trying again.
;;
;; ### USAGE
;;
;; Define a new throttler with `make-throttler`, overriding default settings as needed.
;;
;;    (require '[metabase.api.common.throttle :as throttle])
;;    (def email-throttler (throttle/make-throttler :email, :attempts-threshold 10))
;;
;; Then call `check` within the body of an endpoint with some value to apply throttling.
;;
;;    (defendpoint POST [:as {{:keys [email]} :body}]
;;      (throttle/check email-throttler email)
;;      ...)


;;; # PUBLIC INTERFACE

(declare calculate-delay
         remove-old-attempts)

(defrecord Throttler [;; Name of the API field/value being checked. Used to generate appropriate API error messages, so
                      ;; they'll be displayed on the right part of the screen
                      ^Keyword exception-field-key
                      ;; [Internal] List of attempt entries. These are pairs of [key timestamp (ms)],
                      ;; e.g. ["cam@metabase.com" 1438045261132]
                      ^Atom    attempts
                      ;; Amount of time to keep an entry in ATTEMPTS before dropping it.
                      ^Integer attempt-ttl-ms
                      ;; Number of attempts allowed with a given key before throttling is applied.
                      ^Integer attempts-threshold
                      ;; Once throttling is in effect, initial delay before allowing another attempt. This grows
                      ;; according to DELAY-EXPONENT.
                      ^Integer initial-delay-ms
                      ;; For each subsequent failure past ATTEMPTS-THRESHOLD, increase the delay by
                      ;; (num-attempts-over-theshold ^ DELAY-EXPONENT). e.g. if INITIAL-DELAY-MS is 15 and
                      ;; DELAY-EXPONENT is 2, the first attempt past attempts-threshold will require the user to wait
                      ;; 15 seconds (15 * 1^2), the next attempt after that 60 seconds (15 * 2^2), then 135, and so on.
                      ^Integer delay-exponent])

;; These are made private because you should use `make-throttler` instead.
(alter-meta! #'->Throttler assoc :private true)
(alter-meta! #'map->Throttler assoc :private true)

(def ^:private ^:const throttler-defaults
  {:initial-delay-ms   (* 15 1000)
   :attempts-threshold 10
   :delay-exponent     1.5
   :attempt-ttl-ms     (* 1000 60 60)})

;;
;;
;;
;; Then call `check` within the body of an endpoint with some value to apply throttling.
;;
;;    (defendpoint POST [:as {{:keys [email]} :body}]
;;      (throttle/check email-throttler email)
;;      ...)


(defn make-throttler
  "Create a new `Throttler`.

     (require '[metabase.api.common.throttle :as throttle])
     (def email-throttler (throttle/make-throttler :attempts-threshold 10))"
  [exception-field-key & {:as kwargs}]
  (map->Throttler (merge throttler-defaults kwargs {:attempts   (atom '())
                                                    :exception-field-key exception-field-key})))

(defn check
  "Throttle an API call based on values of KEYY. Each call to this function will record KEYY to THROTTLER's internal list;
   if the number of entires containing KEYY exceed THROTTLER's thresholds, throw an exception.

     (defendpoint POST [:as {{:keys [email]} :body}]
       (throttle/check email-throttler email)
       ...)"
  [^Throttler {:keys [attempts exception-field-key], :as throttler} keyy]
  {:pre [(or (= (type throttler) Throttler)
             (println "THROTTLER IS: " (type throttler)))
         keyy]}
  (println "RECENT ATTEMPTS:\n" (metabase.util/pprint-to-str 'cyan @(:attempts throttler))) ;; TODO - remove debug logging
  (remove-old-attempts throttler)
  (when-let [delay-ms (calculate-delay throttler keyy)]
    (let [message (format "Too many attempts! You must wait %d seconds before trying again."
                          (int (math/round (/ delay-ms 1000))))]
      (throw (ex-info message {:status-code 400
                               :errors      {exception-field-key message}}))))
  (swap! attempts conj [keyy (System/currentTimeMillis)]))


;;; # INTERNAL IMPLEMENTATION

(defn- remove-old-attempts
  "Remove THROTTLER entires past the TTL."
  [^Throttler {:keys [attempts attempt-ttl-ms]}]
  (let [old-attempt-cutoff (- (System/currentTimeMillis) attempt-ttl-ms)
        non-old-attempt?   (fn [[_ timestamp]]
                             (> timestamp old-attempt-cutoff))]
    (reset! attempts (take-while non-old-attempt? @attempts))))

(defn- calculate-delay
  "Calculate the delay in milliseconds, if any, that should be applied to a given THROTTLER / KEYY combination."
  ([^Throttler {:keys [attempts initial-delay-ms attempts-threshold delay-exponent]} keyy]
   (let [[[_ most-recent-attempt-ms], :as keyy-attempts] (filter (fn [[k _]] (= k keyy)) @attempts)]
     (when most-recent-attempt-ms
       (let [num-recent-attempts         (count keyy-attempts)
             num-attempts-over-threshold (- num-recent-attempts attempts-threshold)]
         (when (> num-attempts-over-threshold 0)
           (let [delay-ms              (* (math/expt num-attempts-over-threshold delay-exponent)
                                          initial-delay-ms)
                 next-login-allowed-at (+ most-recent-attempt-ms delay-ms)
                 ms-till-next-login    (- next-login-allowed-at (System/currentTimeMillis))]
             (when (> ms-till-next-login 0)
               ms-till-next-login))))))))
