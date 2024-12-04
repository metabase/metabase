(ns metabase.request.session
  (:require
   ;; TODO FIXME -- the stuff below should get MOVED into this namespace. For now tho we can use Potemkin to import it,
   ;; and move it later.
   ;;
   #_{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.server.middleware.session]
   [potemkin :as p]))

(comment metabase.server.middleware.session/keep-me)

(ns metabase.request.session)

(p/import-vars
  [metabase.server.middleware.session
   as-admin
   clear-session-cookie
   metabase-session-cookie
   with-current-user
   set-session-cookies])
