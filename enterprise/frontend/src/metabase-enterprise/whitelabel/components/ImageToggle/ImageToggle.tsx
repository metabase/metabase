import React, { ReactNode } from "react";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { Toggle } from "metabase/core/components/Toggle";
import {
  ImageContainer,
  ToggleContainer,
  ToggleLabel,
  ToggleRoot,
} from "./ImageToggle.styled";

export interface ImageToggleProps {
  label: string;
  value: boolean;
  children?: ReactNode;
  onChange: (value: boolean) => void;
}

const ImageToggle = ({
  label,
  value,
  children,
  onChange,
}: ImageToggleProps): JSX.Element => {
  const toggleId = useUniqueId();

  return (
    <ToggleRoot>
      <ImageContainer>{children}</ImageContainer>
      <ToggleContainer>
        <ToggleLabel htmlFor={toggleId}>{label}</ToggleLabel>
        <Toggle
          id={toggleId}
          aria-checked={value}
          role="switch"
          value={value}
          onChange={onChange}
        />
      </ToggleContainer>
    </ToggleRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ImageToggle;
