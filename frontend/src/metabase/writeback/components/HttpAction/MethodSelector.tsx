import React from "react";

import Radio from "metabase/core/components/Radio";

import { Container } from "./MethodSelector.styled";

const METHODS = ["GET", "POST", "PUT", "DELETE"].map(method => ({
  name: method,
  value: method,
}));

type Props = {
  value: string;
  setValue: (value: string) => void;
};

const MethodSelector: React.FC<Props> = ({ value, setValue }: Props) => {
  return (
    <Container>
      <Radio value={value} options={METHODS} onOptionClick={setValue} />
    </Container>
  );
};

export default MethodSelector;
