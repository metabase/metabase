import cx from "classnames";

import { CopyButton } from "metabase/common/components/CopyButton";
import CS from "metabase/css/core/index.css";
import { Box, Code } from "metabase/ui";

import S from "./CodeTextBlock.module.css";

interface CodeTextBlockProps {
  children: string;
  codeClassName?: string;
}

export const CodeTextBlock = ({
  children,
  codeClassName,
}: CodeTextBlockProps) => (
  <Box p="md" className={cx(CS.bordered, CS.rounded, CS.bgLight, CS.relative)}>
    <Box className={S.InfoBlockButton}>
      <CopyButton value={children} />
    </Box>
    <Code bg="transparent" block className={codeClassName}>
      {children}
    </Code>
  </Box>
);
