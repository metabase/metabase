(ns mage.escherize.pr-summary
  (:require
   [babashka.json :as json]
   [babashka.process :as p]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [mage.util :as u]
   [table.core :as tbl]))

(set! *warn-on-reflection* true)

(defn- one-day-ago
  "Get the current date and time in ISO format using Node.js.
  `date` is different on mac and linux, so we use Node.js to ensure consistency across platforms."
  []
  (u/node "require('dayjs')().subtract(24, 'hour').toISOString()"))

(defn- ->epoch [time-str]
  (/ (.toEpochMilli (java.time.Instant/parse time-str)) 1000))

(defn- pr-list
  "List all PRs authored by the current user that were updated in the last 24 hours."
  [filterer]
  (->> (p/sh {:extra-env {"SINCE" (one-day-ago)}}
             "gh" "pr" "list" filterer "--state=all"
             "--json=number,title,updatedAt,state,createdAt,url,isDraft,author"
             "--jq=.[] | select(.updatedAt >= env.SINCE)")
       :out
       str/split-lines
       (remove str/blank?)
       (mapv json/read-str)))

(defn- state->emoji [state]
  (case state
    "OPEN" ":open-pull-request:"
    "CLOSED" ":closed:"
    "MERGED" ":git-merged:"
    (throw (ex-info "Unknown PR state" {:state state}))))

(defn- summarize-pr-item [{:keys [number state title url]}]
  (str "  - " (state->emoji state) " [" title "](" url ")"))

(defn- is-backport? [{:keys [author]}]
  (= "github-automation-metabase" (get author "login")))

;; https://clojuredocs.org/clojure.core/sort#example-58e81eb1e4b01f4add58fe88
(defn- multi-comp
  ([fns a b] (multi-comp fns < a b))
  ([[f & others :as fns] order a b]
   (if (seq fns)
     (let [result (compare (f a) (f b))
           f-result (if (= order >) (* -1 result) result)]
       (if (= 0 f-result)
         (recur others order a b)
         f-result))
     0)))

(defn summarize-prs
  "Print a day's summary of PRs authored by the current user that were updated in the last 24 hours in slack markdown format."
  [_]
  (if-let [prs (seq (sort
                     #(multi-comp [(comp - ->epoch :updatedAt) is-backport?] %1 %2)
                     (distinct (concat
                                (pr-list "--author=@me")
                                (pr-list "--assignee=@me")))))]
    (do
      (u/debug (with-out-str (pprint/pprint prs)))
      (u/debug (with-out-str (tbl/table prs)))
      (u/debug (str "Now: " (u/node "require('dayjs')().toISOString()")))
      (println
       (str
        "*EoD*:\n"
        (str/join "\n" (mapv summarize-pr-item prs)))))
    (println "No PRs updated in the last 24 hours.")))

(comment

  (u/node "require('dayjs')().subtract(24, 'hour').toISOString()")
  ;; => "2025-07-21T22:37:00.761Z"
  )
