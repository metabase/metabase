import { ActionIcon, Icon, Tooltip } from "metabase/ui";

export const VerifiedToggle = ({
  verified,
  handleVerifiedFilterChange,
  labelWhenOn,
  labelWhenOff,
}: {
  verified?: boolean;
  handleVerifiedFilterChange: (val: boolean) => void;
  labelWhenOn: string;
  labelWhenOff: string;
}) => {
  const buttonLabel = verified ? labelWhenOn : labelWhenOff;
  return (
    <Tooltip label={buttonLabel} position="bottom">
      <ActionIcon
        aria-label={buttonLabel}
        aria-selected={verified}
        size={32}
        role="switch"
        variant="viewHeader"
        onClick={() => handleVerifiedFilterChange(!verified)}
        c={verified ? "brand" : "text-primary"}
      >
        <Icon name="verified" />
      </ActionIcon>
    </Tooltip>
  );
};
