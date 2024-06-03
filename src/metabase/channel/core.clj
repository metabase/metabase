(ns metabase.channel.core
  (:require
   [metabase.channel.interface :as channel.interface]
   [potemkin :as p]))

(p/import-vars
 [channel.interface
  deliver!])
