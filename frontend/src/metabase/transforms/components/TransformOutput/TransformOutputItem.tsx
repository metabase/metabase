import { ForwardRefLink } from "metabase/common/components/Link";
import { Anchor, Box, Ellipsified, FixedSizeIcon, Group } from "metabase/ui";
import type { IconName } from "metabase-types/api";

type TransformOutputItemProps = {
  icon: IconName;
  label: string;
  to?: string;
  "data-testid": string;
};

export const TransformOutputItem = ({
  icon,
  label,
  to,
  "data-testid": dataTestId,
}: TransformOutputItemProps) => {
  const content = (
    <Group gap="sm" wrap="nowrap" miw={0}>
      <FixedSizeIcon name={icon} />
      <Ellipsified>{label}</Ellipsified>
    </Group>
  );

  return to ? (
    <Anchor
      display="flex"
      flex="1 1 0"
      miw={0}
      maw="max-content"
      component={ForwardRefLink}
      to={to}
      target="_blank"
      lh="inherit"
      fz="inherit"
      data-testid={dataTestId}
    >
      {content}
    </Anchor>
  ) : (
    <Box
      component="span"
      display="flex"
      flex="1 1 0"
      miw={0}
      maw="max-content"
      data-testid={dataTestId}
    >
      {content}
    </Box>
  );
};
