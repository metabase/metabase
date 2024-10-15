(ns metabase.metabot-v3.tools.who-is-your-favorite
  (:require
   [metabase.metabot-v3.tools.interface :as metabot-v3.tools.interface]))

(metabot-v3.tools.interface/deftool :metabot-v3.tool/who-is-your-favorite
  "Figure out who your favorite person is."
  {:properties            {}
   :required              #{}
   :additional-properties false}
  [_args])
