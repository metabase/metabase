(ns metabase.request.session
  (:require
   ;; TODO FIXME -- the stuff below should get MOVED into this namespace. For now tho we can use Potemkin to import it,
   ;; and move it later.
   ;;
   #_{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.server.middleware.session]
   [potemkin :as p]))

(comment metabase.server.middleware.session/keep-me)

(p/import-vars
  [metabase.server.middleware.session
   as-admin
   with-current-user])
