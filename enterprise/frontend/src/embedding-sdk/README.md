# Metabase embedded analytics SDK

> This SDK is actively being developed. You can expect some changes to the API. The SDK currently only works with a specific version of Metabase.

With Metabase's Embedded analytics SDK, you can embed individual [Metabase](https://www.metabase.com/) components with React (like standalone charts, dashboards, the query builder, and more). You can manage access and interactivity per component, and you have advanced customization for seamless styling.

[Learn more](https://www.metabase.com/docs/latest/embedding/sdk/introduction).

## Installation

You can install Metabase Embedded analytics SDK for React via npm:

```bash
npm install @metabase/embedding-sdk-react
```

or using yarn:

```bash
yarn add @metabase/embedding-sdk-react
```

## Docs

For how to use the SDK, check out our [docs for the Embedded analytics SDK](https://www.metabase.com/docs/latest/embedding/sdk/introduction).

## Development

### Storybook

You can use storybook to run SDK components during local development.

When you have Metabase instance running:

```bash
yarn storybook-embedding-sdk
```

### Initial configuration

1. Set JWT secret to be "`0000000000000000000000000000000000000000000000000000000000000000`" in Admin > Authentication >
   JWT > String used by the JWT signing key
1. Make sure "User Provisioning" setting is set to "`on`".
1. Set Authorized Origins to "`*`" in Admin > Embedding > Interactive embedding

### Building locally

First you need to build the Metabase Embedding SDK for React locally:

```bash
yarn build-release:cljs
```

And then run:

```bash
yarn build-embedding-sdk:watch
```

### Using the local build

After that you need to add this built SDK package location to your package.json. In this example we assume that your
application is located in the same directory as Metabase directory:

```json
"dependencies": {
"@metabase/embedding-sdk-react": "file:../metabase/resources/embedding-sdk"
}
```

And then you can install the package using npm or yarn:

```bash
npm install
# or
yarn
```

## Releases

Embedding SDK package build happens with Github actions if `embedding-sdk-build` label has been set on the PR.

Published package will use a version from `package.template.json` + current date and commit short hash.
