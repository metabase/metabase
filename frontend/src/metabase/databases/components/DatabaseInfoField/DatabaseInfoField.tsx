import { InfoBanner } from "./DatabaseInfoField.styled";

export interface DatabaseInfoFieldProps {
  placeholder?: string;
}

const DatabaseInfoField = ({
  placeholder,
}: DatabaseInfoFieldProps): JSX.Element => {
  return <InfoBanner>{placeholder}</InfoBanner>;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseInfoField;
