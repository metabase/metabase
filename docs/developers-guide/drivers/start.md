# Guide to writing a Metabase driver

So here's the scenario: you love Metabase. It's changed your life. But you have some data in a Visual Fox Pro '98 database and you need to make charts with it, and it might be a while before the core Metabase team writes a driver for Visual Fox Pro '98. No problem! Writing a driver yourself can be fun.

## Does a driver for your data source already exist?

See:

- [Officially supported databases](https://www.metabase.com/docs/latest/administration-guide/01-managing-databases.html#officially-supported-databases)
- [Community databases](https://www.metabase.com/docs/latest/developers-guide-drivers.html#how-to-use-a-community-built-driver)

## Before you start coding

Avoid skipping right to whichever chapter you think will give you code to copy-pasta to write your driver. While Metabase drivers are often fairly small (some as little as fifty lines of code), you should put some careful thought into deciding what goes into those fifty lines. You'll have an easier time writing the driver, and end up with a better driver. 


- [The Basics](basics.md)
- [Packaging a driver]
- [Metabase plugin basics]
- [Implementing metabase.driver methods]
- 

Chapter 2: Packaging a Driver & Metabase Plugin Basics
Chapter 3: Implementing metabase.driver methods
Chapter 4: A Sample Driver
Chapter 5: Writing Drivers for SQL-Based Databases
Chapter 6: A Sample SQL Driver
Chapter 7: Writing Drivers for SQL-Based Databases that have a JDBC Driver
Chapter 8: A Sample SQL JDBC Driver
Chapter 9: Adding Test Extensions, Tests, and Setting up CI
Chapter 10: Publishing a Driver
