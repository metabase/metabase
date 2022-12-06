import React from "react";
import { NativeCodeContainer, NativeCodeRoot } from "./NativeCode.styled";

export interface NativeCodeProps {
  code: string;
}

const NativeCode = ({ code }: NativeCodeProps): JSX.Element => {
  return (
    <NativeCodeRoot>
      <NativeCodeContainer>{code}</NativeCodeContainer>
    </NativeCodeRoot>
  );
};

export default NativeCode;
