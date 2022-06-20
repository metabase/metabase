(ns metabase-enterprise.serialization.v2.extract
  "Extraction is the first step in serializing a Metabase appdb so it can be eg. written to disk.

  See the detailed descriptions of the (de)serialization processes in [[metabase.models.serialization.base]]."
  (:require [metabase-enterprise.serialization.v2.models :as serdes.models]
            [metabase.models.serialization.base :as serdes.base]))

(defn extract-metabase
  "Extracts the appdb database into a reducible stream of serializable maps, with `:serdes/meta` keys.

  This is the first step is serialization; see [[metabase-enterprise.serialization.v2.storage]] for actually writing to
  files. Only the models listed in [[serdes.models/exported-models]] get exported.

  Takes an options map which is passed on to [[serdes.base/extract-all]] for each model. The options are documented
  there."
  [opts]
  (eduction cat (for [model serdes.models/exported-models]
                   (serdes.base/extract-all model opts))))
