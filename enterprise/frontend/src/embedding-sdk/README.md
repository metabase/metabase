# Metabase embedded analytics SDK

![Metabase logo](../../../../docs/images/metabase-logo.svg)

> This SDK is in public beta and actively being developed. You can expect some changes to the API, especially during the beta. The SDK currently only works with a Metabase 1.51 or higher.

With Metabase's Embedded analytics SDK, you can embed individual [Metabase](https://www.metabase.com/) components with React (like standalone charts, dashboards, the query builder, and more). You can manage access and interactivity per component, and you have advanced customization for seamless styling.

[Learn more](https://www.metabase.com/docs/latest/embedding/sdk/introduction).

## Docs for the Embedded analytics SDK

For how to use the SDK with your app, check out our [docs for the Embedded analytics SDK](https://www.metabase.com/docs/latest/embedding/sdk/introduction).

## Quickstart

Just some commands to get you started. For more on how to set up the SDK with your app, see the [SDK docs](https://www.metabase.com/docs/latest/embedding/sdk/introduction).

### Installing Metabase

Start a free trial of [Metabase Pro](https://www.metabase.com/pricing).

Or run it locally. Here's a docker one-liner:

```sh
docker run -d -p 3000:3000 --name metabase metabase/metabase-enterprise:latest
```

You can also [download the JAR](https://downloads.metabase.com/enterprise/latest/metabase.jar), and run it like so:

```sh
java -jar metabase.jar
```

By default, Metabase will run at `http://localhost:3000`.

If you get stuck, check out our [installation docs](https://www.metabase.com/docs/latest/installation-and-operation/installing-metabase).

### Installing the SDK

You can install Metabase Embedded analytics SDK for React via npm:

```bash
npm install @metabase/embedding-sdk-react
```

or using yarn:

```bash
yarn add @metabase/embedding-sdk-react
```

For more on the SDK, check out the [SDK docs](https://www.metabase.com/docs/latest/embedding/sdk/introduction).

## Development docs

For developing the SDK, see the [dev docs](https://www.metabase.com/docs/latest/developers-guide/sdk).
