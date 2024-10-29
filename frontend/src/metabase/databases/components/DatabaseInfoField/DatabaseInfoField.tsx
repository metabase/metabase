import { Banner } from "metabase/components/Banner";

export interface DatabaseInfoFieldProps {
  placeholder?: string;
}

const DatabaseInfoField = ({
  placeholder,
}: DatabaseInfoFieldProps): JSX.Element => {
  return (
    <Banner mb="sm" style={{ borderRadius: "sm" }}>
      {placeholder}
    </Banner>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseInfoField;
