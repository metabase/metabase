# Build Metabase

## Install Prerequisites

These are the tools which are required in order to complete any build of the Metabase code. Follow the links to download and install them on your own before continuing.

1. [Clojure (https://clojure.org)](https://clojure.org/guides/getting_started) - install the latest release by following the guide depending on your OS
2. [Java Development Kit JDK (https://adoptopenjdk.net/releases.html)](https://adoptopenjdk.net/releases.html) - you need to install JDK 11 ([more info on Java versions](../operations-guide/java-versions.md))
3. [Node.js (http://nodejs.org/)](http://nodejs.org/) - latest LTS release
4. [Yarn package manager for Node.js](https://yarnpkg.com/) - latest release of version 1.x - you can install it in any OS by doing `npm install --global yarn`

On a most recent stable Ubuntu/Debian, all the tools above, with the exception of Clojure, can be installed by using:

```
sudo apt install openjdk-11-jdk nodejs && sudo npm install --global yarn
```
If you have multiple JDK versions installed in your machine, be sure to switch your JDK before building by doing `sudo update-alternatives --config java` and selecting Java 11 in the menu

If you are developing on Windows, make sure to use Ubuntu on Windows and follow instructions for Ubuntu/Linux instead of installing ordinary Windows versions.

Alternatively, without the need to explicitly install the above dependencies, follow the guide [on using Visual Studio Code](deven.md#developing-with-visual-studio-code.md) and its remote container support.

## Build Metabase Uberjar

The entire Metabase application is compiled and assembled into a single .jar file which can run on any modern JVM. There is a script which will execute all steps in the process and output the final artifact for you. You can pass the environment variable MB_EDITION before running the build script to choose the version that you want to build. If you don't provide a value, the default is `oss` which will build the Community Edition.

    ./bin/build

After running the build script simply look in `target/uberjar` for the output .jar file and you are ready to go.

