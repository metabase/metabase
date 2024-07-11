import styled from "@emotion/styled";

import FormTextArea from "metabase/core/components/FormTextArea";
import { color } from "metabase/lib/colors";

export const FormSnippetTextArea = styled(FormTextArea)`
  ${FormTextArea.Root} {
    width: 100%;
    background-color: ${color("bg-light")};
    font-family: Monaco, monospace;
    font-size: 0.875em;
    font-weight: 400;
    line-height: 1.5em;
  }
`;

export const SnippetFormFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const SnippetFormFooterContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
`;
