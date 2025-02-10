import { green } from "chalk";

import { LINK_TO_NEXT_JS_GUIDE } from "../constants/messages";
import { getNextJsCustomAppOrRootLayoutSnippet } from "../snippets/nextjs-app-snippets";

import { checkIsInTypeScriptProject } from "./check-typescript-project";
import { getSdkPackageName } from "./snippets-helpers";

export const getNextJsSetupMessages = async ({
  componentPath,
  hasNextJsCustomAppOrRootLayout,
}: {
  componentPath: string;
  hasNextJsCustomAppOrRootLayout: boolean;
}): Promise<string[]> => {
  const packageName = getSdkPackageName({ isNextJs: true });

  const isInTypeScriptProject = await checkIsInTypeScriptProject();
  const componentExtension = isInTypeScriptProject ? "tsx" : "jsx";

  const snippets = [];

  // If the user already has an _app.tsx or layout.tsx, we need to show them the snippet,
  // so they can add the example providers and the example CSS to their file.
  // Otherwise, we automatically generate the needed files.
  if (hasNextJsCustomAppOrRootLayout) {
    snippets.push(`
  Add the example providers and the example CSS to your _app.${componentExtension} file. For example:

  ${green(getNextJsCustomAppOrRootLayoutSnippet(componentPath))}`);
  }

  snippets.push(`
  If the import for "${packageName}" is not resolving, add the following to your tsconfig.json:

  ${green(`{
    "module": "NodeNext",
    "moduleResolution": "nodenext",
  }`)}

  For guides on using Next.js with Embedding SDK, see
  ${green(LINK_TO_NEXT_JS_GUIDE)}
  `);

  return snippets.map(snippet => snippet.trim());
};
