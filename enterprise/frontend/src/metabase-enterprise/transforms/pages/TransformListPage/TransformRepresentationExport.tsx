import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { POST } from "metabase/lib/api";

export const TransformRepresentationExport = () => {
  const handleClick = async () => {
    try {
      await POST(`/api/ee/representation/transform/export`)({});
    } catch (error) {
      console.error("Failed to export transform representations:", error);
    }
  };

  return (
    <ToolbarButton
      icon="download"
      aria-label={t`Export transform representations`}
      tooltipLabel={t`Export transform representations`}
      tooltipPosition="bottom"
      onClick={handleClick}
    />
  );
};
