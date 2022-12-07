import React from "react";
import { CodeContainer, CodeRoot, CodeText } from "./QueryPreviewCode.styled";

export interface QueryPreviewCodeProps {
  value: string;
}

const QueryPreviewCode = ({ value }: QueryPreviewCodeProps): JSX.Element => {
  return (
    <CodeRoot>
      <CodeContainer>
        <CodeText>{value}</CodeText>
      </CodeContainer>
    </CodeRoot>
  );
};

export default QueryPreviewCode;
