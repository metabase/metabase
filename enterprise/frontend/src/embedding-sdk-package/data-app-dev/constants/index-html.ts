// A namespace import stays single-line so the disable covers the reported line.
// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import * as dataAppVirtualModules from "build-configs/embedding-sdk/constants/data-app-virtual-modules";

const { DATA_APP_DEV_ENTRY_VIRTUAL_ID } = dataAppVirtualModules;

/** The preview shell. There is no index.html on disk; the dev server serves this. */
export const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Data App Dev Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import ${JSON.stringify(DATA_APP_DEV_ENTRY_VIRTUAL_ID)};
    </script>
  </body>
</html>
`;
