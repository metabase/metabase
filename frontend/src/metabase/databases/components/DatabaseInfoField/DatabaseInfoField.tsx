import React from "react";
import { InfoBanner } from "./DatabaseInfoField.styled";

export interface DatabaseInfoFieldProps {
  placeholder?: string;
}

const DatabaseInfoField = ({
  placeholder,
}: DatabaseInfoFieldProps): JSX.Element => {
  return <InfoBanner>{placeholder}</InfoBanner>;
};

export default DatabaseInfoField;
