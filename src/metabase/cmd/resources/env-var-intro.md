---
title: Environment variables
redirect_from:
  - /docs/latest/operations-guide/environment-variables
---

# Environment variables

_This documentation was generated from source by running:_

```
clojure -M:ee:run environment-variables-documentation
```

Many settings in Metabase can be viewed and modified in the Admin Panel, or set via environment variables. The environment variables always take precedence. Note that, unlike settings configured in the Admin settings of your Metabase, the environment variables won't get written into the application database.

## How to set environment variables

Setting environment variables can be done in various ways depending on how you're running Metabase.

JAR file:

```
# Mac, Linux and other Unix-based systems
export MB_SITE_NAME="Awesome Company"
# Windows Powershell
$env:MB_SITE_NAME="Awesome Company"
# Windows batch/cmd
set MB_SITE_NAME="Awesome Company"

java -jar metabase.jar
```

Or set it as Java property, which works the same across all systems:

```
java -DMB_SITE_NAME="Awesome Company" -jar metabase.jar
```

Docker:

```
docker run -d -p 3000:3000 -e MB_SITE_NAME="Awesome Company" --name metabase metabase/metabase
```

---

## List of environment variables
