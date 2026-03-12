import { t } from "ttag";

import { MoreMenu } from "metabase/data-studio/common/components/MoreMenu/MoreMenu";

type MeasureMoreMenuProps = {
  previewUrl?: string;
  onRemove?: () => void;
};

export function MeasureMoreMenu({
  previewUrl,
  onRemove,
}: MeasureMoreMenuProps) {
  return (
    <MoreMenu
      previewUrl={previewUrl}
      onRemove={onRemove}
      ariaLabel={t`Measure actions`}
      removeLabel={t`Remove measure`}
      removeTitle={t`Remove this measure?`}
      removeMessage={t`This measure will be permanently removed.`}
    />
  );
}
