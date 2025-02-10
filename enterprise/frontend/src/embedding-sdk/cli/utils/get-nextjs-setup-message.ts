import { green } from "chalk";

import {
  LINK_TO_NEXT_JS_GUIDE,
  LINK_TO_NEXT_JS_SAMPLE,
} from "../constants/messages";
import { getNextJsCustomAppOrRootLayoutSnippet } from "../snippets/nextjs-app-snippets";

import { checkIsInTypeScriptProject } from "./check-typescript-project";
import { checkIfUsingAppOrPagesRouter } from "./nextjs-helpers";
import { getSdkPackageName } from "./snippets-helpers";

export const getNextJsSetupMessages = async ({
  componentPath,
  hasNextJsCustomAppOrRootLayout,
}: {
  componentPath: string;
  hasNextJsCustomAppOrRootLayout: boolean;
}): Promise<string[]> => {
  const packageName = getSdkPackageName({ isNextJs: true });

  const router = await checkIfUsingAppOrPagesRouter();
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
  Created an analytics-demo route in your "${green(router)}" directory.

  Instead of having a separate Express.js server, you can create API routes
  for them. See the examples from ${green(LINK_TO_NEXT_JS_SAMPLE)}.
  `);

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
