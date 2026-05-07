(ns dev.spy
  "File-based println-debugging. Each call logs the **source expression** and
   its value at file:line to `/tmp/spy.log`:

     (spy/! (count xs))
     ;; logs:  src/foo.clj:42  (count xs) => 17

   Usage:

     (require '[dev.spy :as spy])
     (spy/! x)                ; logs `x => <value>` at this line, returns x
     (spy/! :tag x)           ; same but with an extra tag prefix
     (spy/?> x)               ; thread-aware spy, drop into -> / ->>
     (spy/reset!)             ; truncate the log
     (spy/tail)               ; last 50 lines as a string

   The function form `!*` takes a precomputed location string + value — used
   when the macro can't run (e.g. lazy `requiring-resolve` from a ns that
   doesn't `:require` dev.spy at load time):

     (def ^:private spy! (or (try @(requiring-resolve 'dev.spy/!*)
                                  (catch Throwable _ nil))
                             (fn [_loc _x] nil)))
     (spy! \"src/foo.clj:42\" my-val)

   Note: `!*` does NOT carry the source-expression text — only the macro form
   captures that via `&form`.")

(def log-path "/tmp/spy.log")

(defn !*
  "Function form. `loc` is a precomputed `file:line` (or any caller-chosen)
   string; `x` is the value to log. Returns `x`."
  [loc x]
  (try (spit log-path
             (str (when loc (str loc "  ")) "=> " (pr-str x) "\n")
             :append true)
       (catch Throwable _ nil))
  x)

(defn stack!
  "Spit a filtered call stack at the point of the call. Useful for tracing
   'who called this'. Filters out clojure.lang/jdk frames so the user code
   path stands out. `tag` is optional context."
  ([] (stack! nil))
  ([tag]
   (let [trace (->> (Thread/currentThread)
                    (.getStackTrace)
                    (drop 2) ;; drop getStackTrace + this fn
                    (map str)
                    (remove #(or (.startsWith ^String % "java.")
                                 (.startsWith ^String % "jdk.")
                                 (.startsWith ^String % "clojure.lang.")
                                 (.startsWith ^String % "clojure.core/")
                                 (.startsWith ^String % "sun.")
                                 (.startsWith ^String % "nrepl.")
                                 (.startsWith ^String % "cider.")))
                    (take 40))
         body (clojure.string/join "\n  " (cons (or tag "stack") trace))]
     (try (spit log-path (str "[STACK] " body "\n") :append true)
          (catch Throwable _ nil)))))

(defmacro !
  "Spit the source expression of `x` and its value, tagged with file:line of
   the call site. Returns the value so the call can be inlined into
   expressions.

     (spy/! (count xs))
     ;; -> src/foo.clj:42  (count xs) => 17

     (spy/! :before (count xs))
     ;; -> src/foo.clj:42 :before  (count xs) => 17"
  ([x]
   (let [{:keys [line column]} (meta &form)
         loc (str *file* ":" line (when column (str ":" column)))
         expr-str (pr-str x)]
     `(!* (str ~loc "  " ~expr-str) ~x)))
  ([tag x]
   (let [{:keys [line column]} (meta &form)
         loc (str *file* ":" line (when column (str ":" column)))
         expr-str (pr-str x)]
     `(!* (str ~loc " " ~(pr-str tag) "  " ~expr-str) ~x))))

(defmacro ?>
  "Thread-aware spy: identical to `!` but reads better inside `->` / `->>` chains.
   Logs the value as it passes through and returns it unchanged."
  ([x]     `(! ~x))
  ([tag x] `(! ~tag ~x)))

(defn clear!
  "Truncate the log."
  []
  (spit log-path ""))

(defn tail
  "Return the last `n` (default 50) lines of the log as a string."
  ([] (tail 50))
  ([n]
   (let [lines (try (clojure.string/split (slurp log-path) #"\n") (catch Throwable _ []))]
     (clojure.string/join "\n" (take-last n lines)))))
