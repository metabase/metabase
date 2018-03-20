

###### Before submitting the PR, please make sure you do the following 
-  [ ] If there are changes to the backend codebase, run the backend tests with `lein test && lein eastwood && lein bikeshed && lein docstring-checker && ./bin/reflection-linter`
-  [ ] Run the frontend and integration tests with  `yarn && yarn run prettier && yarn run lint && yarn run flow && ./bin/build version uberjar && yarn run test`)
-  [ ] Sign the [Contributor License Agreement](https://docs.google.com/a/metabase.com/forms/d/1oV38o7b9ONFSwuzwmERRMi9SYrhYeOrkbmNaq9pOJ_E/viewform)
(unless it's a tiny documentation change).
