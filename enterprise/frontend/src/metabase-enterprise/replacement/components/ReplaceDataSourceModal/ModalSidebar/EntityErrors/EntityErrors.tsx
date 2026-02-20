import { List, Text } from "metabase/ui";
import { getEntityErrorMessage } from "metabase-enterprise/replacement/utils";
import type { ReplaceSourceErrorType } from "metabase-types/api";

type EntityErrorsProps = {
  errors: ReplaceSourceErrorType[];
};

export const EntityErrors = ({ errors }: EntityErrorsProps) => {
  if (errors.length === 0) {
    return null;
  }
  if (errors.length === 1) {
    return <Text c="error"> {getEntityErrorMessage(errors[0])}</Text>;
  }

  return (
    <List spacing="sm">
      {errors.map((error) => (
        <List.Item key={error} c="error">
          {getEntityErrorMessage(error)}
        </List.Item>
      ))}
    </List>
  );
};
