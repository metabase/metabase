(ns metabase.exec-log.schema
  "The wire format for the execution-log firehose.

  Every record on the stream is an *envelope* plus a *payload*. The envelope keys are identical for every topic --
  they are what a consumer can rely on without knowing anything about the topic. The payload varies by topic and is
  dispatched on `:topic` by [[record]].

  To add a topic:

  1. `mr/def` a `::payload.<topic>` schema. Make it `{:closed true}`.
  2. Add the topic to [[topics]] and a branch to [[record]].
  3. Implement `metabase.exec-log.core/->record` for the source event.

  Nothing else changes -- the envelope, the sink, and the writer are topic-agnostic.

  ## Wire format rules

  - Keys are kebab-case keywords; they serialize to kebab-case JSON strings.
  - Every map is `{:closed true}`. Widening the format is a deliberate schema edit here, never an incidental `assoc`
    at a call site.
  - Fields that may legitimately be absent are `[:maybe ...]` and always present as keys, rather than
    `{:optional true}`. A consumer reads `null`, never a missing key, so a rule predicate does not have to
    distinguish the two. `:request` is the one exception: it is `[:maybe ...]` as a whole map, because a consumer
    should branch once on \"do we have request context\" rather than four times on four nullable fields.
  - Values are grouped rather than flat. `:target` is a tagged union instead of five mutually-contradicting nullable
    ID columns; `:access`, `:client`, `:cache`, and `:request` are submaps, so a consumer's types stay legible.

  ## Version rule ([[wire-version]], emitted as `:v`)

  Bump `:v` when a change **requires more from the consumer** or **provides less to it**: removing a field, renaming
  one, narrowing a type, changing a field's representation, or adding a field under closed-map validation (a strict
  consumer rejects the record, so it is breaking here even though it is additive elsewhere).

  Do **not** bump for: a new value in an open-ended enum such as `:context`, a genuinely optional field a consumer
  may ignore, or a new topic (a consumer dispatches on `:topic` and skips what it does not know).

  `:v` governs *shape* only. If a field's meaning changes while its type does not -- a `:context` value's scope
  shifts, `:result-rows` starts counting differently -- `:v` does not move. `:metabase-version` is on every record so
  a consumer has some discriminator for that case.

  ## `:context` is open, not an enum

  `:context` accepts **any keyword**. It comes from `metabase.lib.schema.info/context`, which carries 34 values today
  and grows whenever Metabase adds an execution path. Adding a value there must not be a breaking change here, so
  this schema does not enumerate the set and `:v` does not move when it grows.

  **A consumer must bucket an unrecognized `:context` into a catch-all variant rather than reject the record.** This
  matters more than it looks: `:context` is the field rules predicate on most, so a consumer that enumerated
  yesterday's set breaks precisely where it is used hardest.

  The field inventory behind these payloads is `metabase.analytics.sdk/sdk-info-row`."
  (:require
   [metabase.util.malli.registry :as mr]))

(def wire-version
  "Version of the envelope + payload contract, emitted on every record as `:v`. See the version rule in the namespace
  docstring: bump when a change requires more from a consumer or provides less."
  1)

(def topics
  "Every topic that may appear on the stream. A consumer may switch exhaustively on this set."
  #{:query-executed})

;;; ------------------------------------------- envelope -------------------------------------------

(mr/def ::actor
  "Who caused the event. `:user-id` is nil for events with no authenticated user (scheduled pulses, sync, transforms
  running on a schedule). `:tenant-id` is nil outside multi-tenant instances."
  [:map {:closed true}
   [:user-id   [:maybe pos-int?]]
   [:tenant-id [:maybe pos-int?]]])

(mr/def ::pii
  "Whether PII retention was on when this record was emitted, and therefore whether `:request` is populated.

  A boolean deliberately, not a three-state reason. `analytics-pii-retention-enabled` is gated on both an admin
  toggle and the `:audit-app` feature, so `:request` can also vanish because a license lapsed rather than because
  the operator chose it. Distinguishing those two would let a consumer warn that rules have silently become
  unmatchable, but it is not yet confirmed that the producer can tell them apart cheaply at emission time. Until
  that is verified this stays a boolean; widening it to an enum later adds a value without removing one, so it is
  not a breaking change under the version rule."
  :boolean)

(def ^:private envelope-entries
  "The envelope entries, as raw `:map` entries. Restated in each [[record]] branch rather than `:merge`d, because
  `:merge` of a closed map with an open one yields an *open* map -- an unknown top-level key would then validate."
  [[:topic       (into [:enum] (sort topics))]
   [:v           pos-int?]
   ;; ISO-8601 with offset, e.g. "2026-09-22T14:03:11.412Z". A string rather than an instant so the JSON and the
   ;; in-memory record are the same shape -- the sidecar and a test read identical data.
   [:ts          :string]
   ;; Which Metabase emitted this. Lets one sidecar serve several instances.
   [:instance-id [:maybe :string]]
   [:actor       [:ref ::actor]]
   [:pii         [:ref ::pii]]])

;;; ------------------------------------------- target -------------------------------------------

(mr/def ::target
  "What was executed, as a tagged union dispatched on `:kind`. The execution row carries five nullable integer ID
  columns (`card_id`, `dashboard_id`, `pulse_id`, `transform_id`, `action_id`) plus the string `lens_id`, and they can
  contradict each other; this union cannot.

  `:lens` is the irregular variant: its `:id` is a **string**, not an integer, and it carries `:params`. That is what
  `sdk-info-row` types it as. A consumer whose target type assumes a uniform numeric ID breaks on lens records."
  [:multi {:dispatch :kind}
   [:card      [:map {:closed true} [:kind [:= :card]]      [:id pos-int?]]]
   [:dashboard [:map {:closed true} [:kind [:= :dashboard]] [:id pos-int?]]]
   [:pulse     [:map {:closed true} [:kind [:= :pulse]]     [:id pos-int?]]]
   [:transform [:map {:closed true} [:kind [:= :transform]] [:id pos-int?]]]
   [:action    [:map {:closed true} [:kind [:= :action]]    [:id pos-int?]]]
   [:lens      [:map {:closed true}
                [:kind   [:= :lens]]
                [:id     :string]
                [:params [:map {:closed true} [:join-step [:maybe :int]]]]]]
   ;; An ad-hoc question or a native-editor run: nothing saved to point at.
   [:ad-hoc    [:map {:closed true} [:kind [:= :ad-hoc]]]]])

;;; ------------------------------------------- payload submaps -------------------------------------------

(mr/def ::cache
  "Whether the result came from the cache, and the cache key on a hit.

  A union on `:hit?` rather than a boolean beside a nullable hash, so `{:hit? false, :hash \"abc\"}` cannot be
  constructed. Same reason `::target` is a union."
  [:multi {:dispatch :hit?}
   [true  [:map {:closed true}
           [:hit? [:= true]]
           ;; Nullable even on a hit: the row's `cache_hash` is populated by the cache middleware and can be absent
           ;; for a hit it did not write. Better a null here than an empty string standing in for one.
           [:hash [:maybe :string]]]]
   [false [:map {:closed true}
           [:hit? [:= false]]]]])

(mr/def ::access
  "The access-control core of the record: which enforcement mechanisms applied, and how the caller authenticated.

  `:auth-method` is normalized to a **string** at emission. Upstream it is `[:maybe [:or :keyword :string]]` -- the
  same logical value arrives as `\"jwt\"` or `:jwt` depending on which code path set the dynamic var, and emitting
  both shapes would mean a rule matching `\"jwt\"` silently misses half its records."
  [:map {:closed true}
   [:sandboxed?    :boolean]
   [:impersonated? :boolean]
   [:db-routed?    :boolean]
   [:auth-method   [:maybe :string]]
   ;; No `:tenant-id` here: it lives once on the envelope's `:actor`. `sdk-info-row` has a single `tenant_id`, so
   ;; carrying it twice would let two copies disagree.
   ])

(mr/def ::client
  "Which embedding client or SDK made the request. All nil for a request from the Metabase app itself."
  [:map {:closed true}
   [:embedding-client [:maybe :string]]
   [:sdk-version      [:maybe :string]]
   [:hostname         [:maybe :string]]
   [:route            [:maybe :string]]
   [:identifier       [:maybe :string]]])

(mr/def ::request
  "Request context, present only when PII retention is enabled -- see [[pii]]. Nullable as a whole rather than four
  nullable fields, so a rule predicating on IP simply cannot match when retention is off."
  [:map {:closed true}
   [:ip-address           [:maybe :string]]
   [:user-agent           [:maybe :string]]
   [:sanitized-user-agent [:maybe :string]]
   [:embedding-path       [:maybe :string]]])

(mr/def ::outcome
  "How the execution ended. A union on `:status` rather than a status enum beside a nullable `:error`, so
  `{:status :completed, :error \"boom\"}` cannot be constructed. Same reason `::target` and `::cache` are unions.

  `:error` carries the message only -- never a stack trace, never the query text."
  [:multi {:dispatch :status}
   [:completed [:map {:closed true}
                [:status [:= :completed]]]]
   [:failed    [:map {:closed true}
                [:status [:= :failed]]
                [:error  :string]]]])

;;; ------------------------------------------- payloads -------------------------------------------

(mr/def ::payload.query-executed
  "One query execution, successful or failed, from any source -- a saved card, an ad-hoc question, the native editor,
  a pulse, a transform, an action, a lens. Mirrors the QueryExecution row built in
  `metabase.query-processor.middleware.process-userland-query`, after `metabase.analytics.sdk/include-sdk-info`."
  [:map {:closed true}
   ;; What ran.
   [:target           [:ref ::target]]
   ;; Where it ran.
   [:database-id      [:maybe pos-int?]]
   ;; Hex-encoded query hash. Stable across runs of the same query; lets a sidecar group without seeing the query.
   [:query-hash       [:maybe :string]]
   ;; How it was invoked. ANY keyword -- see the namespace docstring. Not an enum, deliberately.
   [:context          [:maybe :keyword]]
   [:native?          :boolean]
   [:parameterized?   :boolean]
   ;; Outcome. `:status` and `:error` live together in a union so a completed execution cannot carry an error.
   [:outcome          [:ref ::outcome]]
   [:running-ms       [:maybe nat-int?]]
   [:result-rows      [:maybe nat-int?]]
   [:cache            [:ref ::cache]]
   [:access           [:ref ::access]]
   [:client           [:ref ::client]]
   [:request          [:maybe [:ref ::request]]]
   [:metabase-version [:maybe :string]]])

;;; ------------------------------------------- record -------------------------------------------

(defn- with-payload
  "Envelope entries + a `:data` payload, in one closed map. The envelope entries are restated rather than `:merge`d for
  the reason given on [[envelope-entries]]."
  [payload-schema]
  (into [:map {:closed true} [:data payload-schema]] envelope-entries))

(mr/def ::record
  "A complete record on the stream: the envelope with its topic's payload at `:data`. Dispatches on `:topic`, so a new
  topic is one new branch and nothing else."
  [:multi {:dispatch :topic}
   [:query-executed (with-payload [:ref ::payload.query-executed])]])
