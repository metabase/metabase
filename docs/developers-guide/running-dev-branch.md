# How to run a development branch of Metabase on your own computer

This doc will show you how you can run Metabase on your own computer so you can play around with it as you please or test features that are in development.

If you're looking to download and run the latest official open source version of Metabase, check the [operations guide](/docs/operations-guide/installing-metabase.md). 

The instructions below apply to those using macOS. You can either [use a pre-built Docker image](#running-metabase-using-a-pre-built-docker-image) (the easiest way to get started) or [build and run Metabase locally](#building-and-running-metabase-locally-to-try-out-an-in-development-feature-branch).

## Running Metabase using a pre-built Docker image

### Installing Docker

The only thing you’ll need to get started is Docker itself.

- [Install Docker Desktop](https://www.docker.com/products/docker-desktop), which installs like other Mac apps.

OR

- If you like to install things via Homebrew:

```bash
brew install docker
```
Once Docker is installed, you’re ready to go.

### Run an in development branch to test or verify features

1. Open your terminal app of choice

2. Copy and paste this command, switching out `<branch-name>` for the name of the branch you’d like to test.

```bash
docker run -d -p 3000:3000 metabase/metabase-dev:<branch-name>
```
3. In your browser, navigate to [localhost:3000](http://localhost:3000), where you should see Metabase. It may take a minute or two to start up depending on your computer.

Note that this will always start Metabase with a fresh database.

### Pull and run all the latest changes

The “latest” tag is not automatically upgraded on your local machine, so make sure you run `docker pull metabase/metabase-enterprise-head:latest` to ensure that you’re pulling the latest changes.

Then to get those latest changes in master, run:

`docker run -d -p 3000:3000 metabase/metabase-enterprise-head:latest`

## Building and running Metabase locally to try out an in development feature branch

Steps 1 and 2 only need to be completed once. After that, you'll use step 3 whenever you want to build and run Metabase locally to try out a feature branch.

### 1. Install the required stuff

Even though you only need to do it once, this is a long, annoying list, especially if this is your first time doing this kind of thing or if you’re not the sort who messes around with the Terminal app much.

Speaking of which, the first step will be to find and open Terminal, which you’ll need to do a lot. You can find it using Spotlight search on macOS, or navigate to it: Applications → Utilities → Terminal. 

Open it up, and you’ll be looking probably at a black interface where you’ll type or paste commands.

This list of what we need to install should be done in order. Each step has a command that you should copy exactly and paste into Terminal, then hit enter to execute the command.

1. Install the macOS Xcode dev tools: 
`xcode-select --install`

2. Install Homebrew, which is a little program that lets you install other things. This is all one long command, so make sure to copy it all the way from the first `/` all the way to the last `"`:
    
    `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
    
3. Install the GitHub command line interface (CLI) tools:
`brew install gh`

4. Install Clojure, the language Metabase is coded in:
`brew install clojure/tools/clojure`

5. Install the [Java developer kit (JDK) by downloading this file](https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.13%2B8/OpenJDK11U-jdk_x64_mac_hotspot_11.0.13_8.pkg), then opening and running through the installer once it’s done downloading.

6. Install Node, which is a package manager thingie: 
`brew install node`

7. Install Yarn 1.x (not 2.x), which is used to build the frontend:
`npm install --global yarn`

### 2. Copy the Metabase code to your computer

Once you have all that installed, you’re going to get a copy of Metabase's source code from GitHub, where it’s stored.

1. Create a `workspace` folder (you can name it that or whatever you want) in the Home folder on your Mac. You’ll put the Metabase code files inside this `workspace` folder.

2. Open up your Terminal app, and navigate to your workspace folder: 
`cd ~/workspace`

3. Run this GitHub command to “clone” Metabase into this folder:
 `gh repo clone metabase/metabase`

### 3. Choose the branch you want to run, and run it!

This is the part that you’ll use over and over. 

The “official” branch of Metabase is called `master`, and other feature development branches get merged into it when they’re approved. So if you want to try out a feature before then, you’ll need to know the name of that branch so you can switch over to it. Here’s what to do:

1. Open up Terminal

2. Navigate to where you're storing the Metabase code. If you followed this guide exactly, you'd get there by entering this command: 
`cd ~/workspace/metabase`

1. Use the `git pull` command to “pull” down the latest code. You should do this every time to make sure that you have all the latest Metabase branches and code on your computer. It’s also how you’ll get updates on a feature branch if the engineer make changes to it.

2. Find the name of the branch you want to run by going to the “pull request” page for that feature on GitHub and copying the branch name from there. Here’s [an example PR page](https://github.com/metabase/metabase/pull/19138), with the branch name
`fix-native-dataset-drill-popover`.

5. Switch to, or “check out,” that branch by entering the command
`git checkout branch-name`. If we wanted to switch to the branch in the previous step, we'd run  
`git checkout fix-native-dataset-drill-popover`. When you want to switch back to `master`, run `git checkout master`.

6. Now we’ll start up the backend server of Metabase with
`clojure -M:run`. When it’s done, you should see a message in Terminal that says something like “Metabase initialization complete.” Keep this tab in Terminal running, otherwise it’ll stop Metabase! 

7. Open up another Terminal tab (command+T), and then “build” the frontend (all the UI) with this command: `yarn build-hot`.

8. In your web browser of choice, navigate to [localhost:3000](http://localhost:3000), where you should see Metabase!
     
    This is the local “server” on your computer, and 3000 is the “port” that Metabase is running on. You can have multiple different apps running on different ports on your own computer. Note that if you share any URLs with others that begin with `localhost`, they won’t be able to access them because your computer by default isn’t open up to the whole world, for security.    

A couple useful tips:

- To switch to a different branch or back to `master`, open up another Terminal tab, and repeat steps 3, 4, and 5. You’ll need to do steps 6 and 7 too if Metabase wasn’t already running. If it was already running, the frontend will automatically rebuild itself. You can check its progress by switching to that tab in your Terminal — it usually takes something like 15 seconds, but will depend on your hardware.

- If you want to make Metabase stop running, you can either quit the Terminal program, or go to your Terminal tab with the backend running and hit Ctrl+C to stop the backend. Most of the time you don’t have to do this to switch branches, but there are some cases where the change or feature you’re trying to see is a change with the backend, and you may need to stop the backend with Ctrl+C and then restart it by completing Step 6 again.