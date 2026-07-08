(ns dev.debug
  "Drop `#d` in front of any expression to log it to a file + return it.

       (let [filtered #d (filter valid? items)] ...)
       ;; logs to /tmp/<dir>_debug.log:
       ;;   #d[src/foo.clj:2]  (filter valid? items) => (1 3 7 …)

   Commands: pass certain values to control it.

     #d :clear                     ; truncate the log + print the path
     #d :where                     ; print the resolved log path
     #d :stack / :stacktrace       ; log the current call stack
     #d [:set-file! \"/tmp/foo\"]  ; redirect log file

   Path defaults to `/tmp/<dir>_debug.log` (where `<dir>` is the basename of
   the JVM's working directory) so multiple side-by-side checkouts don't
   stomp on the same file. Override via `DEV_DEBUG_LOG` env var or
   `(set-file! ...)`.

   Watch live: `tail -f $(echo /tmp/*_debug.log) | bat --paging=never -l edn`.

   Run `#d :clear` to clear the log;

   Remove `#d`s before committing."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]))

(set! *warn-on-reflection* true)

;; ---------- File path resolution ----------
;;
;; Default uses the JVM's working directory basename so concurrent REPLs in
;; different checkouts don't stomp on each other. Resolved on every call (not
;; cached at JVM start) so env-var changes and `set-file!` overrides take
;; effect immediately.

(def ^:private working-dir-name
  (-> (or (System/getProperty "user.dir") ".")
      (str/split #"/")
      last))

(def ^:private override-path
  "If non-nil, takes precedence over DEV_DEBUG_LOG and the default.
   Set via [[set-file!]] or `#d [:set-file! path]`."
  (atom nil))

(defn log-path
  "Current debug log file path. Resolved fresh on each call:

     1. `(set-file! ...)` override, if set.
     2. `$DEV_DEBUG_LOG` env var, if set.
     3. Default: `/tmp/<dir>_debug.log` (`<dir>` = basename of JVM cwd)."
  []
  (or @override-path
      (System/getenv "DEV_DEBUG_LOG")
      (str "/tmp/" working-dir-name "_debug.log")))

(defn where
  "Print the current debug log path. Useful when (a) you don't remember it,
   (b) you're agent-driven and want explicit visibility into where the log
   is going."
  []
  (println "dev.debug log:" (log-path)))

(defn set-file!
  "Override the log file path until the JVM exits. Pass nil to clear the
   override and fall back to the env var / default. Returns the path now in
   effect."
  [path]
  (reset! override-path path)
  (where)
  (log-path))

;; ---------- Value rendering ----------

(def ^:private max-value-bytes
  "Truncate rendered values larger than this. Prevents one giant query map
   from filling the log. ~4KB."
  4096)

(defn- render-value
  "Render `v` with `pr-str` (single line, fast, machine-readable). Truncate
   output that exceeds `max-value-bytes` so a single huge value doesn't blow
   up the log. Pretty-printing is left to the caller — pipe the log through
   a formatter if you want it pretty (`bat -l edn`, `puget`, etc.)."
  [v]
  (let [s (pr-str v)]
    (if (> (count s) max-value-bytes)
      (str (subs s 0 max-value-bytes)
           " … (truncated; original "
           (count s) " chars; consider narrower #d)")
      s)))

(defn- spit-line!
  "Append `line` (no trailing newline expected) to the resolved log path,
   swallowing IO errors so a debug helper never crashes the program."
  [line]
  (try (spit (log-path) (str line "\n") :append true)
       (catch Throwable _ nil)))

(defn print-debug-entry!
  "Runtime impl of `#d`. Public so the reader macro's expansion can call it
   across compilation boundaries."
  [loc form-str value]
  (spit-line! (str "#d[" loc "]  " form-str " => " (render-value value)))
  value)

(defn stack!
  "Spit a filtered call stack at the call point. Filters JDK/clojure.lang
   frames so the user code path stands out. `tag` is optional context."
  ([] (stack! nil))
  ([tag]
   (let [frames (->> (Thread/currentThread)
                     (.getStackTrace)
                     (drop 2)
                     (map str)
                     (remove #(or (.startsWith ^String % "java.")
                                  (.startsWith ^String % "jdk.")
                                  (.startsWith ^String % "clojure.lang.")
                                  (.startsWith ^String % "clojure.core/")
                                  (.startsWith ^String % "sun.")
                                  (.startsWith ^String % "nrepl.")
                                  (.startsWith ^String % "cider.")))
                     (take 40))
         body (str/join "\n  " (cons (or tag "stack") frames))]
     (spit-line! (str "[STACK] " body)))))

(defn clear!
  "Truncate the log. Call before each debug run so output isn't mixed with
   prior runs. Writes a single marker line into the freshly-cleared file so
   anyone tailing it sees the clear point. Prints the path to stdout so you
   always know where output is going."
  []
  (try (spit (log-path) "") (catch Throwable _ nil))
  (spit-line! (str "#d :clear  (" (java.time.Instant/now) ")"))
  (where))

;; ---------- `#d` reader ----------
;;
;; Nested `#d` support
;; -------------------
;; The naive expansion `(let [v# expr] (print! …) v#)` works at runtime, but
;; the `pr-str` of an *outer* `#d`'s form sees the post-expansion goo from
;; any inner `#d`s — so the logged source text is unreadable.
;;
;; Mirror the trick `weavejester/hashp` uses: tag the expansion with a known
;; sentinel keyword + the original form preserved as data. When pr-str'ing an
;; outer form, walk it and replace any inner expansion with the original
;; form it wraps. The runtime evaluation is unchanged; only the rendered
;; form-text gets cleaned up.

(def ^:private ^:const inner-marker
  "Sentinel keyword embedded in `#d`'s expansion so a containing `#d` can
   recognize it and substitute the original form."
  ::inner)

(defn- strip-inner
  "Walk `form`, replacing any `#d` expansion with the original form it
   wraps. Recognizes the expansion by the `inner-marker` sentinel."
  [form]
  (walk/postwalk
   (fn [x]
     (if (and (seq? x)
              (= 'clojure.core/let (first x))
              (= inner-marker (some-> x second second)))
       ;; Shape: (clojure.core/let [orig# ::inner]
       ;;          (clojure.core/let [v# <ORIG>] (print-debug-entry! ...) v#))
       ;; Pull out <ORIG>.
       (some-> x (nth 2) second second)
       x))
   form))

(defn d
  "Reader-tag fn for `#d`. Three shapes:

     #d <expr>                  — log expr's value, return it (common case).
     #d <keyword>               — control verb. Currently:
                                    :clear / :stack / :stacktrace / :where
     #d [<keyword> & args]      — control verb with args. Currently:
                                    [:set-file! \"/tmp/foo.log\"]

   Source `:line`/`:column` are captured from the form's metadata at READ
   time so the logged location matches what's in your editor. Nested `#d`
   calls are stripped from the logged form-text via [[strip-inner]] so
   outer entries show the original source, not the inner expansion goo.

   Note: a bare keyword that matches a known verb is treated as the verb,
   not as a value to log. `#d :clear` clears the file. To log the literal
   `:clear`, wrap it: `#d (do :clear)` or `#d [:clear]` (vectors with an
   unknown leading keyword are not verbs)."
  [form]
  (cond
    ;; Known keyword verbs ONLY. An unknown keyword (e.g. #d :user-event)
    ;; falls through to the expression branch and logs the keyword as a
    ;; value — it's not an error.
    (contains? #{:clear :stack :stacktrace :where} form)
    (case form
      :clear      `(do (clear!) :clear)
      :stack      `(do (stack!) :stack)
      :stacktrace `(do (stack!) :stacktrace)
      :where      `(do (where)  :where))

    ;; Vector verb with args: #d [:set-file! "..."]
    (and (vector? form) (= :set-file! (first form)))
    (let [[_ & args] form]
      `(do (set-file! ~@args) [:set-file! ~@args]))

    ;; Expression: log + return value. Wrap with the inner-marker so a
    ;; containing `#d` can strip our expansion when rendering its form-text.
    :else
    (let [stripped       (strip-inner form)
          {:keys [line]} (meta form)
          raw-file       (or *file* "?")
          cwd            (System/getProperty "user.dir")
          file           (if (and cwd (str/starts-with? raw-file (str cwd "/")))
                           (subs raw-file (inc (count cwd)))
                           raw-file)
          loc            (str file ":" (or line "?"))
          form-str       (pr-str stripped)]
      `(let [orig# ~inner-marker]
         (let [v# ~form]
           (print-debug-entry! ~loc ~form-str v#)
           v#)))))
