(ns metabase.metabot.tools.recoverable.legacy
  "The one recoverable error a not-yet-converted tool can raise.

  A tool written against the old shape signals \"relay this to the model\" by throwing with
  `:agent-error? true`, or by catching that itself and returning the message as `:output`. The flag
  is the author saying the sentence was written for a model, which is the same judgement
  `metabase.metabot.tools.recoverable.pipeline` relies on for pipeline errors, so the message is
  authored text and the payload may carry it.

  One declaration for all of them, because a tool that has not been converted has not said which
  error it raised. Converting a tool means replacing its uses of this with declarations of its own,
  and this namespace goes away when the last tool is converted."
  (:require
   [metabase.metabot.tools.error :refer [defrecoverable]]))

(set! *warn-on-reflection* true)

(defrecoverable agent-error!
  "A tool that has not been converted relayed a message to the model."
  {:payload [:map {:closed true}
             [:message   :string]
             [:tool-name :string]]}
  [{:keys [message]}]
  ;; No recovery steps. The tool knows how to recover and has not been asked yet; a step invented
  ;; here would be a guess, and a wrong one sends the agent at the wrong tool.
  {:message  message
   :recovery []})
