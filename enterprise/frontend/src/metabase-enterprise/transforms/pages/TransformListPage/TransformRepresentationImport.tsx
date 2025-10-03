import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { POST } from "metabase/lib/api";

export const TransformRepresentationImport = () => {
  const handleClick = async () => {
    try {
      await POST(`/api/ee/representation/transform/import`)({});
    } catch (error) {
      console.error("Failed to import transform representations:", error);
    }
  };

  return (
    <ToolbarButton
      icon="upload"
      aria-label={t`Import transform representations`}
      tooltipLabel={t`Import transform representations`}
      tooltipPosition="bottom"
      onClick={handleClick}
    />
  );
};
