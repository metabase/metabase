import { Uri } from "vscode";
import type { Webview } from "vscode";

function getNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getWebviewHtml(
  webview: Webview,
  extensionUri: Uri,
): string {
  const distUri = Uri.joinPath(extensionUri, "dist", "webview");
  const scriptUri = webview.asWebviewUri(
    Uri.joinPath(distUri, "assets", "index.js"),
  );
  const styleUri = webview.asWebviewUri(
    Uri.joinPath(distUri, "assets", "index.css"),
  );
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function getTableDataWebviewHtml(
  webview: Webview,
  extensionUri: Uri,
): string {
  const distUri = Uri.joinPath(extensionUri, "dist", "webview");
  const scriptUri = webview.asWebviewUri(
    Uri.joinPath(distUri, "assets", "table-data.js"),
  );
  const styleUri = webview.asWebviewUri(
    Uri.joinPath(distUri, "assets", "table-data.css"),
  );
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function getPreviewWebviewHtml(
  webview: Webview,
  extensionUri: Uri,
): string {
  const distUri = Uri.joinPath(extensionUri, "dist", "webview");
  const scriptUri = webview.asWebviewUri(
    Uri.joinPath(distUri, "assets", "preview.js"),
  );
  const styleUri = webview.asWebviewUri(
    Uri.joinPath(distUri, "assets", "preview.css"),
  );
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
