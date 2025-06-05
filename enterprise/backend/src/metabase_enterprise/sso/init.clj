(ns metabase-enterprise.sso.init
  (:require
   [metabase-enterprise.sso.integrations.google] ; has a `define-multi-setting` impl
   [metabase-enterprise.sso.settings]))
