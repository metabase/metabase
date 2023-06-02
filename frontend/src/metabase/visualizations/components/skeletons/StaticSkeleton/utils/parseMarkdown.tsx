import ReactDOMServer from "react-dom/server";

import Markdown from "metabase/core/components/Markdown";

export const parseMarkdown = (content: string): Element[] => {
  const div = document.createElement("div");
  div.innerHTML = ReactDOMServer.renderToStaticMarkup(
    <Markdown>{content}</Markdown>,
  );

  if (!div.children || !div.children[0]) {
    return [];
  }

  return Array.from(div.children[0].children);
};
