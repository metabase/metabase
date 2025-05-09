# Metabot v3

## Sending requests to Metabot

### Request format

Every request is made up of three parts: `message`, `context` and `history`.
The `message` is usually the prompt typed in the Metabot chat bar by the user.
In the case of user confirmation, `message` is a predefined value that Metabot has asked to be sent in response to the user choosing a path.
The `context` is the "eyes" of Metabot, allowing it to "see" what the user sees.
Lastly `history` is the `history` value from the last Metabot response forwarded back in the next request to keep all requests stateless.

### Registering chat context

Chat context is currently managed via React context, which is perfect because I heard you liked context with your context.
`context.tsx` defines two methods `registerChatContextProvider` and `getChatContext`.
Registered provider functions will be called when `getChatContext` is executed and are passed the redux state at that point in time.
These functions return partial context objects which are then shallow merged to produce a final chat context object for the current view.
The functions may pick values off the redux state or pull in values available within their defined scope.
Default chat context required for all requests, like the current time, can be set in base context defined in `context.tsx`.
In OSS,`registerChatContextProvider` and `getChatContext` are no-ops, so any registered context functions will not be consumed.
A helper util has been provided to make registering context easier in React. The `useRegisterMetabotContextProvider(providerFn, providerFnDeps)`
hook will automatically register/deregister a provider function from a component as it is mounted and unmounted.

## Handling responses from Metabot

### Processing reactions

The backend sends reactions as a list, which are processed sequentially.
Each reaction type should have an associated handler which can either return a `Promise<void>` or `void`.
Async reaction handlers will be awaited before processing the next reaction.

### Adding a new reaction

Reactions are defined by the backend and their definition must be hand-copied into the frontend.
You can define new reaction types in `frontend/src/metabase-types/api/metabot.ts`.
To handle your new reaction, add your reaction's `type` to the `reactionHandlers` map in `reactions/index.ts` with a matching handler.
The reactions folder organizes handlers by similar functionality – you can either add your handler to an existing file or create a new one to handle a new domain of reactions.

### Handling errors in reactions

If a handler encounters an error, it can halt all subsequent reaction processing by setting Metabot's `isProcessing` flag to `false` and returning early.
The reaction processor will detect this change and stop further execution.
Some basic error handling utilities can be found in `reactions/errors.ts`, but generally you can still leverage the same tools for making Metabot say something to notify the user of the error.
Future updates will improve this system to allow sending errors to the backend for better user-facing error messages or even coach Metabot to make corrections.
