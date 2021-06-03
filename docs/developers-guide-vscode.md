# Developing Metabase with Visual Studio Code

These instructions allow you to work on Metabase codebase on Windows, Linux, or macOS using [Visual Studio Code](https://code.visualstudio.com/), **without** manually installing the necessary dependencies. This is possible by leveraging Docker container and the Remote Containers extension from VS Code.

For more details, please follow the complete VS Code guide on [Developing inside a Container](https://code.visualstudio.com/docs/remote/containers). The summary is as follows.

Requirements:

* [Visual Studio Code](https://code.visualstudio.com/) (obviously)
* [Docker](https://www.docker.com/)
* [Remote - Containers extension](vscode:extension/ms-vscode-remote.remote-containers) for VS Code

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
