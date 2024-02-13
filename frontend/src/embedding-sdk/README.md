#### How to run this example

1. Navigate to the `example-nodejs-backend` folder and run `yarn` to install dependencies.
2. Navigate to the root `metabase` folder and run `yarn build-embedding-sdk`. Once that's done, copy the `resources/embedding-sdk` folder to the `host-app-example/node_modules` folder using:
```cp -R ./resources/embedding-sdk ./host-app-example/node_modules/metabase-embedding-sdk```
3. Run the backend server with `yarn run-embedding-example-backend`.
4. Run the frontend running `yarn start` in the `host-app-example` folder.
5. Open `localhost:3004`. Login to the app with `rene@example.com` and `foobar` as the password.