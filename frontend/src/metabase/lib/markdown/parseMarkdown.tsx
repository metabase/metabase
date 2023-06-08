import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const REMARK_PLUGINS = [remarkGfm];

export const parseMarkdown = (value: string) => {
  const processor = unified()
    .use(remarkParse)
    .use(REMARK_PLUGINS)
    .use(remarkRehype);

  const file = { value };
  const root = processor.runSync(processor.parse(file), file);

  return root;
};
