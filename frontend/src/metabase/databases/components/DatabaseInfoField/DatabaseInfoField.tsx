import { Markdown } from "metabase/common/components/Markdown";
import { Flex } from "metabase/ui";

export interface DatabaseInfoFieldProps {
  placeholder?: string;
}

const DatabaseInfoField = ({
  placeholder,
}: DatabaseInfoFieldProps): JSX.Element | null => {
  return placeholder ? (
    <Flex
      bg="background-secondary"
      c="text-secondary"
      data-testid="app-banner"
      mb="sm"
      p="0.75rem"
      style={{ borderRadius: "0.375rem" }}
    >
      <Markdown>{placeholder}</Markdown>
    </Flex>
  ) : null;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseInfoField;
