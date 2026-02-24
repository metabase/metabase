import {
  computed,
  ref,
  shallowRef,
  watch,
} from "@reactive-vscode/reactivity";
import {
  defineExtension,
  useFileSystemWatcher,
  useWebviewView,
  useWorkspaceFolders,
} from "reactive-vscode";
import { Uri, workspace } from "vscode";
import type { Webview } from "vscode";
import { getWebviewHtml } from "./webview-html";

const CONFIG_FILENAME = "metabase.config.json";

const { activate, deactivate } = defineExtension((context) => {
  const { extensionUri } = context;
  const workspaceFolders = useWorkspaceFolders();
  const configExists = ref(false);

  async function checkConfigExists() {
    const folders = workspaceFolders.value;
    if (!folders?.length) {
      configExists.value = false;
      return;
    }

    const configUri = Uri.joinPath(folders[0].uri, CONFIG_FILENAME);
    try {
      await workspace.fs.stat(configUri);
      configExists.value = true;
    } catch {
      configExists.value = false;
    }
  }

  checkConfigExists();

  useFileSystemWatcher(`**/${CONFIG_FILENAME}`, {
    onDidCreate: checkConfigExists,
    onDidDelete: checkConfigExists,
  });

  const webviewInstance = shallowRef<Webview | undefined>();

  const html = computed(() => {
    const webview = webviewInstance.value;
    if (!webview) {
      return "<!DOCTYPE html><html><body></body></html>";
    }
    return getWebviewHtml(webview, extensionUri);
  });

  const { webview, postMessage } = useWebviewView(
    "metabase.sidebarPanel",
    html,
    {
      webviewOptions: {
        enableScripts: true,
        localResourceRoots: [
          Uri.joinPath(extensionUri, "dist", "webview"),
        ],
      },
      onDidReceiveMessage(message: { type: string }) {
        if (message.type === "ready") {
          postMessage({ type: "init", configExists: configExists.value });
        }
      },
    },
  );

  watch(webview, (instance) => {
    webviewInstance.value = instance;
  });

  watch(configExists, (value) => {
    postMessage({ type: "configExistsChanged", configExists: value });
  });
});

export { activate, deactivate };
