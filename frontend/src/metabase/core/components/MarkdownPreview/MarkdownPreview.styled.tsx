import styled from "@emotion/styled";

import Markdown from "../Markdown/Markdown";

export const TruncatedMarkdown = styled(Markdown)`
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
  white-space: pre-line;
`;
