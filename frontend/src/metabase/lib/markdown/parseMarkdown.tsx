import type { Options } from "react-markdown/lib/rehype-filter";
import rehypeFilter from "react-markdown/lib/rehype-filter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const REMARK_PLUGINS = [remarkGfm];

export const parseMarkdown = (value: string, options: Options = {}) => {
  const processor = unified()
    .use(remarkParse)
    .use(REMARK_PLUGINS)
    .use(remarkRehype)
    .use(rehypeFilter, options);
  const file = { value };
  const root = processor.runSync(processor.parse(file), file);

  return root;
};
