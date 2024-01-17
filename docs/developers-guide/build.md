---
title: Building Metabase
---

# Building Metabase

This doc will show you how you can build and run Metabase on your own computer so you can play around with it or test features in development. You can also run development branches of Metabase [using a pre-built Docker image](dev-branch-docker.md).

## Install the prerequisites

If you're using macOS, you'll want to install Xcode Command Line Tools first, by running:

```
xcode-select --install
```

To complete any build of the Metabase code, you'll need to install the following.

1. [Clojure (https://clojure.org)](https://clojure.org/guides/getting_started) - install the latest release by following the guide depending on your OS

2. [Java Development Kit JDK (https://adoptopenjdk.net/releases.html)](https://adoptopenjdk.net/releases.html) - you need to install JDK 11 ([more info on Java versions](../installation-and-operation/running-the-metabase-jar-file.md))

3. [Node.js (http://nodejs.org/)](http://nodejs.org/) - latest LTS release

4. [Yarn package manager for Node.js](https://yarnpkg.com/) - latest release of version 1.x - you can install it in any OS by running:

```
npm install --global yarn
```

On a most recent stable Ubuntu/Debian, all the tools above, with the exception of Clojure, can be installed by using:

```
sudo apt install openjdk-11-jdk nodejs && sudo npm install --global yarn
```

If you have multiple JDK versions installed in your machine, be sure to switch your JDK before building with:

```
sudo update-alternatives --config java
```

Then select Java 11 in the menu.

### Running on M1 Apple computers

If you are developing on newer Apple M1 computers, please note that the current NodeJS LTS has native support for arm architecture. However, make sure you have Rosetta 2 installed before you attempt to build the frontend:

```
/usr/sbin/softwareupdate --install-rosetta (root permission not required)
```

or

```
/usr/sbin/softwareupdate --install-rosetta --agree-to-license (root permission required)
```

### If you're running Windows, use WSL

If you are developing on Windows, you should run Ubuntu on Windows Subsystem for Linux (WSL) and follow instructions for Ubuntu/Linux.

### Developing with VS Code in a remote container

Alternatively, without the need to explicitly install the above dependencies, follow the guide [on using Visual Studio Code](visual-studio-code.md) and its remote container support.

## Clone the Metabase repo

Once you've installed all the build tools, you'll need to clone the [Metabase repository](https://github.com/metabase/metabase) from GitHub.

1. Create a `workspace` folder (you can name it that or whatever you want), which will store the Metabase code files.

2. Open up your terminal app, and navigate to your workspace folder with:

```
cd ~/workspace
```

{:start="3"}
3. Run the following command to “clone” Metabase into this folder, using the URL of the Metabase repository on GitHub:

```
git clone https://github.com/metabase/metabase
```

## Choose the branch you want to run, and run it

This is the part that you’ll use over and over.

The “official” branch of Metabase is called `master`, and other feature development branches get merged into it when they’re approved. So if you want to try out a feature before then, you’ll need to know the name of that branch so you can switch over to it. Here’s what to do:

{:start="4"}
4. Open up your terminal app

5. Navigate to where you're storing the Metabase code. If you followed this guide exactly, you'd get there by entering this command:

   ```
   cd ~/workspace/metabase
   ```

6. "Pull” down the latest code by running:

   ```
   git pull
   ```

   You should do this every time to make sure that you have all the latest Metabase branches and code on your computer. It’s also how you’ll get updates on a feature branch someone make changes to it.

7. Find the name of the branch you want to run by going to the “pull request” page for that feature on GitHub and copying the branch name from there. Here’s [an example PR page](https://github.com/metabase/metabase/pull/19138), with the branch name
`fix-native-dataset-drill-popover`.

8. Switch to, or “check out,” that branch by running:

   ```
   git checkout <branch-name>
   ```

   If we wanted to switch to the branch in the previous step, we'd run:

   ```
   git checkout fix-native-dataset-drill-popover
   ```

   When you want to switch back to `master`, run:

   ```
   git checkout master
   ```

## Run Metabase

{:start="9"}
9. Now we’ll start up the backend server of Metabase with:

   ```
   clojure -M:run
   ```

   When it’s done, you should see a message that says something like “Metabase initialization complete.” Keep this tab in your terminal app running, otherwise it’ll stop Metabase.

10. Open up another tab or window of your terminal app, and then “build” the frontend (all the UI) with this command:

   ```
   yarn build-hot
   ```

If you're having trouble with this step, make sure you are using the LTS version of [Node.js (http://nodejs.org/)](http://nodejs.org/).

{:start="11"}
11. In your web browser of choice, navigate to `http://localhost:3000`, where you should see Metabase!

   This is the local “server” on your computer, and 3000 is the “port” that Metabase is running on. You can have multiple different apps running on different ports on your own computer. Note that if you share any URLs with others that begin with `localhost`, they won’t be able to access them because your computer by default isn’t open up to the whole world, for security.

To switch to a different branch or back to `master`, open up another Terminal tab, and repeat steps 6, 7, and 8. If Metabase wasn’t already running, you'll need to complete steps 9 and 10 again too. If it was already running, the frontend will automatically rebuild itself. You can check its progress by switching to that tab in your Terminal — it usually takes something like 15 seconds, but will depend on your hardware.

## Shutting down Metabase

If you want to make Metabase stop running, you can either quit your terminal program, or go to the tab with the backend running and hit `Ctrl+C` to stop the backend. Most of the time you don’t have to do this to switch branches, but there are some cases where the change or feature you’re trying to see is a change with the backend, and you may need to stop the backend with `Ctrl+C` and then restart it by completing step 9 again.

## Building the Metabase Uberjar

The entire Metabase application is compiled and assembled into a single .jar file which can run on any modern JVM. There is a script which will execute all steps in the process and output the final artifact for you. You can pass the environment variable MB_EDITION before running the build script to choose the version that you want to build. If you don't provide a value, the default is `oss` which will build the Community Edition.

    ./bin/build.sh

After running the build script simply look in `target/uberjar` for the output .jar file and you are ready to go.

### Build  a Metabase Uberjar in a containerized environment

If you want to build Metabase without installing Clojure, Java, and Node.js on your host machine, you can build the Uberjar inside a container by running:
```
DOCKER_BUILDKIT=1 docker build --output container-output/ .
```
Make sure that your Docker Daemon is running before executing the command. After running the command, you'll find the Metabase JAR file at `./container-output/app/metabase.jar`.
