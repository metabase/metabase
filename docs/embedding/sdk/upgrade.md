---
title: Upgrading Metabase and the Embedded analytics SDK
summary: How to upgrade your Metabase and Embedded analytics SDK versions, test the changes, and check for breaking changes that might affect your app.
---

# Upgrading Metabase and the Embedded analytics SDK

Here's a basic overview of the steps you'll want to take when upgrading your SDK.

## 1. Read the release post and changelog for both Metabase and the Embedded analytics SDK

- [Release posts](https://www.metabase.com/releases) give a good overview of what's in each release, and call out breaking changes (which are rare).
- [Metabase changelogs](https://www.metabase.com/changelog) list Metabase changes.
- [Embedded analytics SDK changelogs](https://www.metabase.com/changelog/55) list changes specific to the SDK package.

Check for any relevant changes, especially breaking changes that require you to update your application's code. If there are breaking changes, we'll have docs that'll walk you through what changes you'll need to make and why.

## 2. Test the upgrade

When upgrading to a new major version, you'll want to upgrade both Metabase and the SDK version in parallel, as having Metabase and the SDK major versions out of sync can cause errors.

### Spin up the new version of Metabase for testing

You can do this locally or in a dev instance. If your testing setup involves a lot of test user accounts, getting a [development instance](../../installation-and-operation/development-instance.md) could be more cost-effective.

See [upgrading Metabase](../../installation-and-operation/upgrading-metabase.md).

### Upgrade the SDK with npm or yarn

You'll want to test the changes locally first, as there may be breaking changes that require you to upgrade your application code.

Check out a new branch in your application and install the next stable version, either with npm or yarn:

Via npm:

```bash
npm install @metabase/embedding-sdk-react@{next-major-version-number}-stable
```

For example, if you were upgrading to version 55 of the SDK:

```bash
npm install @metabase/embedding-sdk-react@55-stable
```

If you're using yarn:

```bash
yarn add @metabase/embedding-sdk-react@{next-major-version-number}-stable
```

See more on [SDK versions](./version.md).

### If there are breaking changes, make the necessary changes to your application code

Breaking changes are rare, but if you do need to make changes, we'll mention it in the release notes for the new major version and have docs that walk you through the changes.

Update or add tests for any application code changes that you make.

### Deploy to your staging environment

Before deploying your app to your staging environment, make sure you've tested your app locally (manually, as well as running any automated tests).

If all goes well with your local tests, deploy to your staging environment. Check that the Metabase embeds in your staging app are still working as expected, and perform any other testing you normally do with your application with respect to your embedded analytics.

## 3. Deploy to production

If everything is working in staging, you're ready to deploy to production.

Be sure to deploy your application changes and upgrade your Metabase in parallel so that the SDK version and the Metabase version stay in sync.

### If your instance is pinned on Metabase Cloud, you'll need to request an upgrade

If you're on Metabase Cloud, and you've [pinned the version of your Metabase](./version.md#you-can-pin-instances-to-a-version-on-metabase-cloud), you'll need to request an upgrade by [contacting support](https://www.metabase.com/help-premium).

We'll coordinate with you so that your instance is upgraded when you deploy the changes to your application.
