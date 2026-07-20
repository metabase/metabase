(ns metabase-enterprise.workspaces.core
  "Facade for the workspaces module: the only namespace code outside the module
   may require. Everything here is a re-export; the implementations live in the
   module-internal namespaces (`instance`, `provisioning`, `models.*`, ...)."
  (:require
   [metabase-enterprise.workspaces.instance]
   [metabase.util.namespaces :as shared.ns]))

(shared.ns/import-fns
 [metabase-enterprise.workspaces.instance
  clear-instance-workspace!
  instance-workspace
  set-instance-workspace!])
