import { useGetFieldQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { Box, Title } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface Props {
  fieldId: FieldId;
}

export const FieldSection = ({ fieldId }: Props) => {
  const { data: field, error, isLoading } = useGetFieldQuery({ id: fieldId });

  if (error || isLoading || !field) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <Box>
      <Title mb="md" order={2}>
        {field.display_name || field.name || NULL_DISPLAY_VALUE}
      </Title>
    </Box>
  );
};
