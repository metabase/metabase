import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import Markdown from "../Markdown/Markdown";

export const TruncatedMarkdown = styled(Markdown)`
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
  white-space: pre-line;
`;

export const TooltipMarkdown = styled(Markdown)`
  hr {
    border: none;
    border-bottom: 1px solid ${color("bg-dark")};
  }
`;
