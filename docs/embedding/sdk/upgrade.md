---
title: Upgrading Metabase and the Embedded analytics SDK
---

# Upgrading Metabase and the Embedded analytics SDK

Here's a basic overview of the steps you'll want to take when upgrading your SDK.

## 1. Read the release post and changelog for both Metabase and the Embedded analytics SDK

- [Release posts](https://www.metabase.com/releases). Gives a good overview of what's in the release, and calls out breaking changes (which are rare).
- [Metabase changelogs](https://www.metabase.com/changelog) lists Metabase changes.
- [Embedded analytics SDK changelogs](https://www.metabase.com/changelog/55) lists changes specific to the SDK package.

Check for any relevant changes, especially breaking changes that require you to update your application's code. If there are breaking changes, we'll have docs that'll walk you through what changes you'll need to make and why.

## 2. Test the upgrade

When upgrading to a new major version, you'll want to upgrade both your Metabase and your SDK version in parallel in your staging environment, as having Metabase and the SDK major versions out of sync can cause errors.

### Spin up the new version of Metabase for testing

You can do this locally or in your staging environment. If your testing setup involves a lot of test user accounts, getting a [development instance](../../installation-and-operation/development-instance.md) could be more cost-effective.

See [upgrading Metabase](../../installation-and-operation/upgrading-metabase.md).

### Upgrade the SDK with npm or yarn

Check out a new branch in your application and install the next stable version, either via npm or yarn:

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

In your staging environment, check that the Metabase embeds in your app are still working as expected, and perform any other testing you normally do with your application with respect to your embedded analtyics.

## 3. Deploy to production

If everything is working in staging, you're ready to deploy to production.

Be sure to deploy your application changes and upgrade your Metabase in parallel so that the SDK version and the Metabase version stay in sync.

### If your instance is on Metabase Cloud, you'll need to request an upgrade

If you're on Metabase Cloud, your instance version is pinned, so you'll need to request an upgrade by [contacting support](https://www.metabase.com/help-premium).

We'll coordinate with you so that your instance is upgraded when you deploy the changes to your application.