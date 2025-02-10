import { green } from "chalk";

import { LINK_TO_NEXT_JS_GUIDE } from "../constants/messages";
import { getNextJsAppSnippet } from "../snippets/nextjs-app";

import { checkIsInTypeScriptProject } from "./check-typescript-project";
import { checkIfNextJsCustomAppExists } from "./nextjs-helpers";
import { getSdkPackageName } from "./snippets-helpers";

export const getNextJsSetupMessages = async (
  generatedDir: string,
): Promise<string[]> => {
  const packageName = getSdkPackageName({ isNextJs: true });
  const hasCustomApp = await checkIfNextJsCustomAppExists();

  const isInTypeScriptProject = await checkIsInTypeScriptProject();
  const componentExtension = isInTypeScriptProject ? "tsx" : "jsx";

  const snippets = [];

  // If the user already has an _app.tsx, we need to show them the snippet.
  // Otherwise we automatically create a _app.tsx for them.
  if (hasCustomApp) {
    snippets.push(`
  Add the example providers and the example CSS to your _app.${componentExtension} file. For example:

  ${green(getNextJsAppSnippet({ generatedDir }))}`);
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
