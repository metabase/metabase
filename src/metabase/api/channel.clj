(ns metabase.api.channel
  "/api/channel endponts"
  (:require
   [cheshire.core :as json]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [compojure.core :refer [DELETE GET POST PUT]]
   [medley.core :as m]
   [metabase.analyze :as analyze]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.field :as api.field]
   [metabase.api.query-metadata :as api.query-metadata]
   [metabase.compatibility :as compatibility]
   [metabase.driver.util :as driver.u]
   [metabase.events :as events]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models :refer [Card CardBookmark Collection Database
                            PersistedInfo Table]]
   [metabase.models.card :as card]
   [metabase.models.collection :as collection]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]
   [metabase.models.params :as params]
   [metabase.models.params.custom-values :as custom-values]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.query :as query]
   [metabase.models.query.permissions :as query-perms]
   [metabase.models.revision.last-edit :as last-edit]
   [metabase.models.timeline :as timeline]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.task.persist-refresh :as task.persist-refresh]
   [metabase.upload :as upload]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(api/defendpoint GET "/api/channel"
  "Get all channels"
  [_])


(api/defendpoint GET "/api/channel/:id"
  "Get a channel"
  [])


(api/defendpoint GET "/api/channel/:id"
  "Get a channel"
  [])
