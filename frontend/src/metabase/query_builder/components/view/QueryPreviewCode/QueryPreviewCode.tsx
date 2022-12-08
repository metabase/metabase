import React from "react";
import { CodeContainer, CodeRoot, CodeText } from "./QueryPreviewCode.styled";

export interface QueryPreviewCodeProps {
  value: string;
  isHighlighted?: boolean;
}

const QueryPreviewCode = ({
  value,
  isHighlighted,
}: QueryPreviewCodeProps): JSX.Element => {
  return (
    <CodeRoot>
      <CodeContainer isHighlighted={isHighlighted}>
        <CodeText>{value}</CodeText>
      </CodeContainer>
    </CodeRoot>
  );
};

export default QueryPreviewCode;
