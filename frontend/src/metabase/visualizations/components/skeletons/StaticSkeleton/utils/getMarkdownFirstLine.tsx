import ReactDOMServer from "react-dom/server";

import Markdown from "metabase/core/components/Markdown";

export const getMarkdownFirstLine = (content: string): string => {
  const div = document.createElement("div");
  div.innerHTML = ReactDOMServer.renderToStaticMarkup(
    <Markdown>{content}</Markdown>,
  );
  const children = div.children[0]?.children || [];

  const firstTextChild = Array.from(children).find(child => child.textContent);
  return firstTextChild?.textContent || "";
};
