import { t } from "ttag";

import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useSetting } from "metabase/settings";
import {
  Button,
  Ellipsified,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
} from "metabase/ui";

import { CheckoutBadge } from "../CheckoutBadge";

type MainBranchSectionProps = {
  isCheckedOut: boolean;
  onCheckout: () => void;
};

export function MainBranchSection({
  isCheckedOut,
  onCheckout,
}: MainBranchSectionProps) {
  const branch = useSetting("remote-sync-branch");
  const url = useSetting("remote-sync-url");

  return (
    <TitleSection
      label={t`Main branch`}
      description={t`The branch this instance syncs with. Everyone works here unless they check out a worktree.`}
    >
      <Group p="xl" justify="space-between" wrap="nowrap">
        <Stack gap="xs" miw={0}>
          <Group gap="sm" wrap="nowrap">
            <FixedSizeIcon name="git_branch" />
            <Text fw="bold">{branch}</Text>
            {isCheckedOut && <CheckoutBadge />}
          </Group>
          <Ellipsified c="text-secondary">{url}</Ellipsified>
        </Stack>
        {!isCheckedOut && <Button onClick={onCheckout}>{t`Check out`}</Button>}
      </Group>
    </TitleSection>
  );
}
