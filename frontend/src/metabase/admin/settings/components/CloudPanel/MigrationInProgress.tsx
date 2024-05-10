import { c, t } from "ttag";

import { useCancelCloudMigrationMutation } from "metabase/api";
import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  Card,
  type CardProps,
  Flex,
  Text,
  List,
  Button,
  Box,
} from "metabase/ui";

interface MigrationInProgressProps extends Omit<CardProps, "children"> {
  progress: number;
}

export const MigrationInProgress = ({
  progress,
  ...props
}: MigrationInProgressProps) => {
  const dispatch = useDispatch();
  const [cancelCloudMigration] = useCancelCloudMigrationMutation();

  const handleCancelMigration = async () => {
    await cancelCloudMigration();
    dispatch(
      addUndo({
        icon: "info_filled",
        message: t`Migration to Metabase Cloud has been cancelled.`,
        undo: false,
      }),
    );
  };

  return (
    <Card withBorder px="2.5rem" {...props}>
      <Flex gap="sm" align="center">
        <Text fw="bold">{t`You have started migration to Metabase Cloud`}</Text>
      </Flex>
      <List size="md" mt="md">
        <List.Item>{t`This instance will be in ready-only mode when taking a snapshot. It should take about 5-10 minutes.`}</List.Item>
        <List.Item>{c(`{0} is a link titled "Metabase Store"`)
          .jt`In the meantime, you can go to the ${(
          <ExternalLink href="https://store.metabase.com/">{t`Metabase Store`}</ExternalLink>
        )} to finish account creation and configuring your new Cloud instance.`}</List.Item>
      </List>

      <Box mt="lg" mb="md">
        <Text size="md" fw="bold" color={color("brand")}>
          {t`Progress`} - {progress} / 100%
        </Text>
      </Box>

      <Button
        mt="md"
        onClick={handleCancelMigration}
        c="error"
      >{t`Cancel migration`}</Button>
    </Card>
  );
};
