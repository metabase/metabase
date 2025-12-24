---
title: Upgrading Metabase and the modular embedding SDK
summary: How to upgrade your Metabase and modular embedding SDK versions, test the changes, and check for breaking changes that might affect your app.
---

# Upgrading Metabase and the modular embedding SDK

Here's a basic overview of the steps you'll want to take when upgrading your SDK.

## 1. Read the release post and changelog for Metabase and the modular embedding SDK

- [Release posts](https://www.metabase.com/releases) give a good overview of what's in each release, and call out breaking changes (which are rare).
- [Metabase changelog](https://www.metabase.com/changelog) lists all Metabase and modular embedding SDK changes.
- [Modular embedding SDK changelog](https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk-package/CHANGELOG.md) lists changes specific to the SDK's `@metabase/embedding-sdk-react` package.

Check for any relevant changes, especially deprecations or breaking changes that require you to update your application's code. If there are deprecation changes, we'll have docs that'll walk you through what changes you'll need to make and why.

## 2. Test the upgrade

When upgrading to a new major version, you'll want to upgrade both Metabase and the SDK version in parallel, as having Metabase and the SDK major versions out of sync can cause errors.

### Spin up the new version of Metabase for testing

You can do this locally or in a dev instance. If your testing setup involves a lot of test user accounts, getting a [development instance](../../installation-and-operation/development-instance.md) could be more cost-effective.

See [upgrading Metabase](../../installation-and-operation/upgrading-metabase.md).

### Upgrade the SDK with npm or Yarn

You'll want to test the changes locally first, as there may be breaking changes that require you to upgrade your application code.

Check out a new branch in your application and install the next stable version, either with npm or Yarn:

Via npm:

```bash
npm install @metabase/embedding-sdk-react@{next-major-version-number}-stable
```

For example, if you were upgrading to version 56 of the SDK:

```bash
npm install @metabase/embedding-sdk-react@56-stable
```

If you're using Yarn:

```bash
yarn add @metabase/embedding-sdk-react@{next-major-version-number}-stable
```

See more on [SDK versions](./version.md).

### If there are deprecations or breaking changes, make the necessary changes to your application code

Deprecations or breaking changes are rare, but if you do need to make changes, we'll mention it in the release notes for the new major version and have docs that walk you through the changes.

Update or add tests for any application code changes that you make.

In most cases, a deprecated change becomes a breaking change in the release following its deprecation.
For example, if we plan to remove a prop from an SDK React component, we first mark it as **deprecated**, and then remove it in the next release.

### Deploy to your staging environment

Before deploying your app to your staging environment, make sure you've tested your app locally (manually, as well as running any automated tests).

If all goes well with your local tests, deploy to your staging environment. Check that the Metabase embeds in your staging app are still working as expected, and perform any other testing you normally do with your application with respect to your embedded analytics.

## 3. Deploy to production

If everything is working in staging, you're ready to deploy to production.

Be sure to deploy your application changes and upgrade your Metabase in parallel so that the SDK version and the Metabase version stay in sync.

### Caching may delay the upgrade by up to a minute

This is intentional. After upgrading, Metabase may still serve the previous, cached version of the SDK Bundle for up to 60 seconds (`Cache-Control: public, max-age=60`). This short cache window helps ensure fast performance while still allowing updates to propagate quickly.

If you don’t see your changes immediately, clear your browser's cache or just wait a minute. After that, the SDK Package will load the newly deployed SDK Bundle.

### If your instance is pinned on Metabase Cloud, you'll need to request an upgrade

If you're on Metabase Cloud, and you've [pinned the version of your Metabase](./version.md#you-can-pin-instances-to-a-version-on-metabase-cloud), you'll need to request an upgrade by [contacting support](https://www.metabase.com/help-premium).

We'll coordinate with you so that your instance is upgraded when you deploy the changes to your application.
