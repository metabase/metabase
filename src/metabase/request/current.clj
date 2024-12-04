(ns metabase.request.current
  "Dynamic variables for things associated with the current HTTP request, such as current user and their permissions;
  current limit and offset, etc.

  TODO -- move stuff like `*current-user-id*` into this namespace.")

(def ^:private ^:dynamic *request*
  nil)

(defn current-request
  "Current Ring request being handled, if any."
  []
  *request*)

(defn do-with-current-request
  "Execute `thunk` with [[current-request]] bound to `request`."
  [request thunk]
  (binding [*request* request]
    (thunk)))

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
  "Execute `thunk` with [[limit]] and [[offset]] bound."
  [limit offset thunk]
  (binding [*limit*  limit
            *offset* offset
            *paged?* (boolean (or limit offset))]
    (thunk)))
