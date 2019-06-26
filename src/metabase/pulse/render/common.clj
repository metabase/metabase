(ns metabase.pulse.render.common
  (:require [schema.core :as s])
  (:import java.net.URL))

(def RenderedPulseCard
  "Schema used for functions that operate on pulse card contents and their attachments"
  {:attachments (s/maybe {s/Str URL})
   :content     [s/Any]})
