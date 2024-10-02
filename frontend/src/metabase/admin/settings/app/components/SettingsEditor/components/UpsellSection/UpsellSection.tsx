import { UpsellSSO } from "metabase/admin/upsells";
import { Box } from "metabase/ui";

export const UpsellSection = ({
  activeSectionName,
}: {
  activeSectionName: string;
}) => {
  if (activeSectionName !== "authentication") {
    return null;
  }

  return (
    <Box style={{ flexShrink: 0 }}>
      <UpsellSSO source="authentication-sidebar" />
    </Box>
  );
};
