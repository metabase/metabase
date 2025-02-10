import { green } from "chalk";

import {
  LINK_TO_NEXT_JS_GUIDE,
  LINK_TO_NEXT_JS_SAMPLE,
} from "../constants/messages";
import { getNextJsCustomAppOrRootLayoutSnippet } from "../snippets/nextjs-app-snippets";

import { checkIsInTypeScriptProject } from "./check-typescript-project";
import { checkIfUsingAppOrPagesRouter } from "./nextjs-helpers";

export const getNextJsSetupMessages = async ({
  componentPath,
  hasNextJsCustomAppOrRootLayout,
}: {
  componentPath: string;
  hasNextJsCustomAppOrRootLayout: boolean;
}): Promise<string[]> => {
  const router = await checkIfUsingAppOrPagesRouter();
  const isInTypeScriptProject = await checkIsInTypeScriptProject();
  const componentExtension = isInTypeScriptProject ? "tsx" : "js";

  const messages = [];

  const layoutFile = `${router === "app" ? "app/layout" : "pages/_app"}.${componentExtension}`;

  let componentMessage = `Added an analytics-demo route to your "${green(router)}" directory.\n`;

  if (hasNextJsCustomAppOrRootLayout) {
    const layoutSnippet =
      await getNextJsCustomAppOrRootLayoutSnippet(componentPath);

    // If the user already has an _app.tsx or layout.tsx, we need to show them the snippet,
    // so they can add the example providers and the example CSS to their file.
    componentMessage += `  Next, add the example providers and the example CSS to your ${green(layoutFile)} file. For example:

  ${green(layoutSnippet)}`;
  } else {
    // Otherwise, we tell them that we've generated the needed files.
    componentMessage += `  An example Next.js ${layoutFile} is also added to your ${router} directory.`;
  }

  messages.push(componentMessage);

  messages.push(`
  Instead of having a separate Express.js server, you can create API routes
  for them. See the examples from ${green(LINK_TO_NEXT_JS_SAMPLE)}.

  For guides on using Next.js with Embedding SDK, see
  ${green(LINK_TO_NEXT_JS_GUIDE)}
  `);

  return messages.map(snippet => snippet.trim());
};
