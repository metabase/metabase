(ns metabase.util.urls
  (:require [metabase.models.setting :as setting]))

(defn pulse-url
  "Return an appropriate URL for a `Pulse` with ID.

     (pulse-url 10) -> \"http://localhost:3000/pulse#10\""
  [^Integer id]
  (format "%s/pulse#%d" (setting/get :-site-url) id))

(defn dashboard-url
  "Return an appropriate URL for a `Dashboard` with ID.

     (dashboard-url 10) -> \"http://localhost:3000/dash/10\""
  [^Integer id]
  (format "%s/dash/%d" (setting/get :-site-url) id))

(defn card-url
  "Return an appropriate URL for a `Card` with ID.

     (card-url 10) -> \"http://localhost:3000/card/10\""
  [^Integer id]
  (format "%s/card/%d" (setting/get :-site-url) id))

(defn segment-url
  "Return an appropriate URL for a `Segment` with ID.

     (segment-url 10) -> \"http://localhost:3000/admin/datamodel/segment/10\""
  [^Integer id]
  (format "%s/admin/datamodel/segment/%d" (setting/get :-site-url) id))
