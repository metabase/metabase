(ns metabase.request.current
  "Dynamic variables for things associated with the current HTTP request, such as current user and their permissions;
  current limit and offset, etc.

  TODO -- move stuff like `*current-user-id*` into this namespace.")

(def ^:private ^:dynamic *request*
  nil)

(def ^:private ^:dynamic *matched-route*
  "Holds the matched route template for the current request, e.g. `\"/user/current\"`.
  Bound to `nil` by [[do-with-current-request]], then set via [[set-matched-route!]] when routing matches."
  nil)

(defn current-request
  "Current Ring request being handled, if any."
  []
  *request*)

(defn matched-route
  "Return the matched route template for the current request, or `nil` if not yet matched."
  []
  *matched-route*)

(defn set-matched-route!
  "Set the matched route template for the current request. Only works within a [[with-current-request]] binding frame."
  [route]
  (set! *matched-route* route))

(defn do-with-current-request
  "Impl for [[with-current-request]]."
  [request thunk]
  (binding [*request*       request
            *matched-route* nil]
    (thunk)))

(defmacro with-current-request
  "Execute `body` with [[current-request]] bound to `request`."
  {:style/indent :defn}
  [request & body]
  `(do-with-current-request ~request (^:once fn* [] ~@body)))

(def ^:private ^:dynamic *limit*
  nil)

(defn limit
  "Limit for offset-limit paging. Automatically set by [[metabase.server.middleware.offset-paging]] server middleware."
  []
  *limit*)

(def ^:private ^:dynamic *offset*
  nil)

(defn offset
  "Offset for offset-limit paging. Automatically set by [[metabase.server.middleware.offset-paging]] server middleware."
  []
  *offset*)

(def ^:private ^:dynamic *paged?*
  false)

(defn paged?
  "Whether the current request is paged or not. Automatically set by [[metabase.server.middleware.offset-paging]] server
  middleware."
  []
  *paged?*)

(defn do-with-limit-and-offset
  "Impl for [[with-limit-and-offset]]."
  [limit offset thunk]
  (binding [*limit*  limit
            *offset* offset
            *paged?* (boolean (or limit offset))]
    (thunk)))

(defmacro with-limit-and-offset
  "Execute `body` with [[limit]] and [[offset]] bound."
  {:style/indent :defn}
  [limit offset & body]
  `(do-with-limit-and-offset ~limit ~offset (^:once fn* [] ~@body)))
