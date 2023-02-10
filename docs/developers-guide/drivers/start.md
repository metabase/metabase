---
title: Guide to writing a Metabase driver
---

# Guide to writing a Metabase driver

So here's the scenario: you love Metabase. It's changed your life. But you have some data in a Visual Fox Pro '98 database and you need to make charts with it, and it might be a while before the core Metabase team writes a driver for Visual Fox Pro '98. No problem! Writing a driver can be fun.

## Does a driver for your data source already exist?

Before you start building a driver from scratch, see if one already exists that you could contribute to:

- [Officially supported drivers](../../databases/connecting.md#connecting-to-supported-databases)
- [Partner and community drivers](../partner-and-community-drivers.md)

## Setting up

Before you start working on a driver, you'll need to set up your [development environment](../devenv.md).

Having an in-depth understanding of Clojure is less important when writing JDBC-based drivers because their implementation is simpler -- much of the work is already done for you -- but it would still be helpful to understand what things like [multimethods](https://clojure.org/reference/multimethods) are. See [Working with Clojure](../clojure.md).

## Writing a driver

Try to avoid skipping right to whichever page you think will give you the code you'll need to copy-pasta. While Metabase drivers are often fairly small (some as little as fifty lines of code), you should put some careful thought into deciding what goes into those fifty lines. You'll have an easier time writing the driver, and end up with a better one.

1. [Driver basics](basics.md)
2. [Plugin manifests](plugins.md)
3. [Implementing multimethods for your driver](multimethods.md)
4. [Submitting a PR for your driver](driver-tests.md)

## Example drivers

- [Sample driver](https://github.com/metabase/sample-driver)
- [Metabase driver modules](https://github.com/metabase/metabase/tree/master/modules/drivers)
- [A sample sudoku driver](https://github.com/metabase/sudoku-driver)

## Driver development announcements

Occasionally, we may make changes to Metabase that impact database drivers. We'll try to give everyone as much of a heads up as possible. For notifications regarding potential driver changes, subscribe to the [Metabase Community Authors mailing list](http://eepurl.com/gQcIO9).
