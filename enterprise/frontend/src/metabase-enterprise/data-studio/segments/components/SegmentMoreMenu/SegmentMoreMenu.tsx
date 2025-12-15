import { t } from "ttag";

import { MoreMenu } from "metabase-enterprise/data-studio/common/components/MoreMenu/MoreMenu";

type SegmentMoreMenuProps = {
  previewUrl?: string;
  onRemove?: () => void;
};

export function SegmentMoreMenu({
  previewUrl,
  onRemove,
}: SegmentMoreMenuProps) {
  return (
    <MoreMenu
      previewUrl={previewUrl}
      onRemove={onRemove}
      ariaLabel={t`Segment actions`}
      removeLabel={t`Remove segment`}
      removeTitle={t`Remove this segment?`}
      removeMessage={t`This segment will be permanently removed.`}
    />
  );
}
