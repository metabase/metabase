---
title: Developing with Visual Studio Code
---

# Developing with Visual Studio Code

## Debugging

First, install the following extension:
* [Debugger for Firefox](https://marketplace.visualstudio.com/items?itemName=firefox-devtools.vscode-firefox-debug)

_Note_: Debugger for Chrome has been deprecated. You can safely delete it as Visual Studio Code now has [a bundled JavaScript Debugger](https://github.com/microsoft/vscode-js-debug) that covers the same functionality.

Before starting the debugging session, make sure that Metabase is built and running. Choose menu _View_, _Command Palette_, search for and choose _Tasks: Run Build Task_. Alternatively, use the corresponding shortcut `Ctrl+Shift+B`. The built-in terminal will appear to show the progress, wait a few moment until webpack indicates a complete (100%) bundling.

To begin debugging Metabase, switch to the Debug view (shortcut: `Ctrl+Shift+D`) and then select one of the two launch configurations from the drop-down at the top:

* Debug with Firefox, or
* Debug with Chrome

After that, begin the debugging session by choosing menu _Run_, _Start Debugging_ (shortcut: `F5`).

For more details, please refer to the complete VS Code documentation on [Debugging](https://code.visualstudio.com/docs/editor/debugging).

## Docker-based Workflow

These instructions allow you to work on Metabase codebase on Windows, Linux, or macOS using [Visual Studio Code](https://code.visualstudio.com/), **without** manually installing the necessary dependencies. This is possible by leveraging Docker container and the Remote Containers extension from VS Code.

For more details, please follow the complete VS Code guide on [Developing inside a Container](https://code.visualstudio.com/docs/remote/containers).

Requirements:

* [Visual Studio Code](https://code.visualstudio.com/) (obviously)
* [Docker](https://www.docker.com/)
* [Remote - Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) for VS Code

_Important_: Ensure that Docker is running properly and it can be used to download an image and launch a container, e.g. by running:

```
$ docker run hello-world
```
If everything goes well, you should see the following message:

```
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

Steps:

1. Clone Metabase repository

2. Launch VS Code and open your cloned Metabase repository

3. From the _View_ menu, choose _Command Palette..._ and then find _Remote-Container: Reopen in Container_. (VS Code may also prompt you to do this with an "Open in container" popup).
   **Note**: VS Code will create the container for the first time and it may take some time. Subsequent loads should be much faster.

4. Use the menu _View_, _Command Palette_, search for and choose _Tasks: Run Build Task_ (alternatively, use the shortcut `Ctrl+Shift+B`).

5. After a while (after all JavaScript and Clojure dependencies are completely downloaded), open localhost:3000 with your web browser.

See [here](dev-branch-docker.md) for more on running development branches of Metabase using Docker.
