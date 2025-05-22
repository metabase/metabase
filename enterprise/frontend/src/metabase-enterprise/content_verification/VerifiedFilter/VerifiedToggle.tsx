import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

export const VerifiedToggle = ({
  verified,
  handleVerifiedFilterChange,
}: {
  verified?: boolean;
  handleVerifiedFilterChange: (val: boolean) => void;
}) => {
  const buttonLabel = verified
    ? t`Show unverified models, too`
    : t`Only show verified models`;
  return (
    <Tooltip label={buttonLabel} position="bottom">
      <ActionIcon
        aria-label={buttonLabel}
        size={32}
        variant="viewHeader"
        onClick={() => handleVerifiedFilterChange(!verified)}
        c={verified ? "brand" : "text-dark"}
      >
        <Icon name="verified" />
      </ActionIcon>
    </Tooltip>
  );
};
