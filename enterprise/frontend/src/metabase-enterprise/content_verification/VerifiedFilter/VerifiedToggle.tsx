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
        variant="subtle"
        aria-label={buttonLabel}
        aria-selected={verified}
        role="switch"
        onClick={() => handleVerifiedFilterChange(!verified)}
        c={verified ? "core-brand" : "text-primary"}
      >
        <Icon name="verified" />
      </ActionIcon>
    </Tooltip>
  );
};
