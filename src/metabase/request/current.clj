(ns metabase.request.current
  "Dynamic variables for things associated with the current HTTP request, such as current user and their permissions;
  current limit and offset, etc.

  TODO -- move stuff like `*current-user-id*` into this namespace."
  (:require
   [clojure.string :as str]
   [metabase.request.settings :as request.settings]))

(def ^:private ^:dynamic *request*
  nil)

(defn current-request
  "Current Ring request being handled, if any."
  []
  *request*)

(defn do-with-current-request
  "Impl for [[with-current-request]]."
  [request thunk]
  (binding [*request* request]
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

(defn ip-address
  "The IP address a Ring `request` came from. Looks at the `request.settings/source-address-header` header (by default
  `X-Forwarded-For`, or the `(:remote-addr request)` if not set, or if disabled via MB_NOT_BEHIND_PROXY=true."
  [{:keys [headers remote-addr]}]
  (let [header-ip-address (some->> (request.settings/source-address-header)
                                   (get headers))
        source-address    (if (or (request.settings/not-behind-proxy)
                                  (not header-ip-address))
                            remote-addr
                            header-ip-address)]
    (some-> source-address
            ;; first IP (if there are multiple) is the actual client -- see
            ;; https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For
            (str/split #"\s*,\s*")
            first
            ;; strip out non-ip-address characters like square brackets which we get sometimes
            (str/replace #"[^0-9a-fA-F.:]" ""))))
