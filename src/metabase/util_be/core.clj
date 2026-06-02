(ns metabase.util-be.core
  "Backend-only utility re-exports. Follows the [[metabase.lib-be]] precedent:
  this namespace holds things that are inherently JVM-only (require JDBC,
  cryptography, java.net I/O, etc.) so that [[metabase.util]] can stay
  cross-platform and slim — the CLJS analyzer never has reason to drag this
  ns onto the JVM during macro expansion.

  Callers that need any of these names should `(:require [metabase.util-be.core
  :as util-be])` (in `.clj` files only — these are not callable from `.cljs`)."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.format :as u.format]
   [metabase.util.http :as u.http]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.string :as u.str]
   [potemkin :as p]
   [puget.printer]))

(set! *warn-on-reflection* true)

(p/import-vars
 [u.jvm
  all-ex-data
  all-ex-messages
  auto-retry
  string-to-bytes
  bytes-to-string
  decode-base64
  decode-base64-to-bytes
  deref-with-timeout
  encode-base64
  encode-base64-bytes
  filtered-stacktrace
  full-exception-chain
  host-port-up?
  parse-currency
  poll
  host-up?
  ip-address?
  sorted-take
  varargs
  with-timeout
  with-us-locale]
 [u.str
  build-sentence]
 [u.http
  valid-host?])

(def ^{:arglists '([x])} cprint-to-str
  "Like [[metabase.util/pprint-to-str]], but prints to color if color printing is enabled.

  Lives in `metabase.util-be.core` because the [[puget.printer]] dependency
  (and its transitive `fipp` + `clojure.core.rrb-vector` chain) is JVM-only
  and unwanted on shadow-cljs's macro-load path."
  (if u.format/colorize?
    puget.printer/cprint-str
    u/pprint-to-str))

;; Log the maximum memory available to the JVM at launch time as well since it is very handy for debugging things.
;; Lives here (and not in `metabase.util`) so that loading `metabase.util` does not pull `metabase.util.log` and its
;; `clojure.tools.logging` + `metabase.config.core` transitive load chain onto shadow-cljs's macro-load path.
(when-not *compile-files*
  (log/infof "Maximum memory available to JVM: %s" (u.format/format-bytes (.maxMemory (Runtime/getRuntime)))))

(def ^:dynamic *profile-level*
  "Impl for `profile` macro -- don't use this directly. Nesting-level for the `profile` macro e.g. 0 for a top-level
  `profile` form or 1 for a form inside that."
  0)

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defn -profile-print-time
  "Impl for [[profile]] macro -- don't use this directly. Prints the `___ took ___` message at the conclusion of a
  [[profile]]d form."
  [message-thunk start-time]
  ;; indent the message according to [[*profile-level*]] and add a little down-left arrow so it (hopefully) points to
  ;; the parent form
  (log/info (u.format/format-color
             (case (int (mod *profile-level* 4))
               0 :green
               1 :cyan
               2 :magenta
               3 :yellow) "%s%s took %s"
             (if (pos? *profile-level*)
               (str "┌" (str/join (repeat (dec *profile-level*) "─")) "─> ")
               "")
             (message-thunk)
             (u.format/format-nanoseconds (- (System/nanoTime) start-time)))))

(defmacro profile
  "Like [[clojure.core/time]], but lets you specify a `message` that gets printed with the total time, formats the
  time nicely using `metabase.util/format-nanoseconds`, and indents nested calls to `profile`.

    (profile \"top-level\"
      (Thread/sleep 500)
      (profile \"nested\"
        (Thread/sleep 100)))
    ;; ->
     ↙ nested took 100.1 ms
    top-level took 602.8 ms"
  {:style/indent 1}
  ([form]
   `(profile ~(str form) ~form))
  ([message & body]
   ;; message is wrapped in a thunk so we don't incur the overhead of calculating it if the log level does not include
   ;; INFO
   `(let [message#    (fn [] ~message)
          start-time# (System/nanoTime)
          result#     (binding [*profile-level* (inc *profile-level*)]
                        ~@body)]
      (-profile-print-time message# start-time#)
      result#)))
