# Guide to writing a Metabase driver

So here's the scenario: you love Metabase. It's changed your life. But you have some data in a Visual Fox Pro '98 database and you need to make charts with it, and it might be a while before the core Metabase team writes a driver for Visual Fox Pro '98. No problem! Writing a driver yourself can be fun.

## Does a driver for your data source already exist?

Before you start building a driver from scratch, see if one already exists that you could contribute to:

- [Officially supported databases](https://www.metabase.com/docs/latest/administration-guide/01-managing-databases.html#officially-supported-databases)
- [Community databases](https://www.metabase.com/docs/latest/developers-guide-drivers.html#how-to-use-a-community-built-driver)

## Setting up

See [Setting up your development environment](../devend.md)

## Writing a driver

Avoid skipping right to whichever page you think will give you code to copy-pasta to write your driver. While Metabase drivers are often fairly small (some as little as fifty lines of code), you should put some careful thought into deciding what goes into those fifty lines. You'll have an easier time writing the driver, and end up with a better driver. 

- [Driver basics](basics.md)
- [Packaging your driver](plugins.md)
- [Submitting a PR for your driver](driver-tests.md)
- [A sample driver](https://github.com/metabase/sudoku-driver)
- [An official driver](https://github.com/metabase/metabase/tree/master/modules/drivers/sqlite)

