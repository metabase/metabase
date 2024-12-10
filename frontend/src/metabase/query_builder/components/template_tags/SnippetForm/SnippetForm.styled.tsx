import styled from "@emotion/styled";

import FormTextArea from "metabase/core/components/FormTextArea";

export const FormSnippetTextArea = styled(FormTextArea)`
  ${FormTextArea.Root} {
    width: 100%;
    background-color: var(--mb-color-bg-light);
    font-family: Monaco, monospace;
    font-size: 0.875em;
    font-weight: 400;
    line-height: 1.5em;
  }
`;
