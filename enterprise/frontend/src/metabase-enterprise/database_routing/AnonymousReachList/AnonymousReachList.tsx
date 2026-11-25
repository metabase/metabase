import { useId } from "react";
import { match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { modelIconMap } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Card,
  FixedSizeIcon,
  Flex,
  Group,
  ScrollArea,
  Stack,
  Text,
} from "metabase/ui";
import { modelToUrl, publicSharingSettings } from "metabase/urls";
import type {
  AnonymousSurface,
  AnonymouslyReachableEntity,
  DatabaseAnonymousReach,
} from "metabase-types/api";

import S from "./AnonymousReachList.module.css";

const ROWS_IN_A_QUESTION = 5;

const PANEL_LIST_MAX_HEIGHT = "13.75rem";

export type PanelReachFraming = "keeps-working" | "has-stopped" | "would-stop";

type QuestionReachFraming = "at-stake" | "would-stop";

type AnonymousReachListProps = {
  reach: DatabaseAnonymousReach | undefined;
} & (
  | {
      variant: "panel";
      framing: PanelReachFraming;
    }
  | {
      variant: "question";
      framing: QuestionReachFraming;
    }
);

export const AnonymousReachList = ({
  reach,
  framing,
  variant,
}: AnonymousReachListProps) => {
  const captionId = useId();

  if (!reach || reach.total === 0) {
    return null;
  }

  const { total, data } = reach;
  const listed =
    variant === "question" ? data.slice(0, ROWS_IN_A_QUESTION) : data;
  const unlisted = total - listed.length;

  const rows = (
    <Card
      component="ul"
      // Safari drops list semantics when list-style is none
      role="list"
      aria-labelledby={captionId}
      className={S.list}
      p={0}
      shadow="none"
      withBorder
    >
      {listed.map((entity) => (
        <AnonymousReachRow
          key={`${entity.model}-${entity.id}`}
          entity={entity}
        />
      ))}
    </Card>
  );

  return (
    <Stack gap="sm" data-testid="anonymous-reach-list">
      <Text id={captionId} fw="bold">
        {getFramingCaption(framing)}
      </Text>
      {variant === "panel" ? (
        <ScrollArea.Autosize
          mah={PANEL_LIST_MAX_HEIGHT}
          type="auto"
          data-testid="anonymous-reach-scroll"
        >
          {rows}
        </ScrollArea.Autosize>
      ) : (
        rows
      )}
      {unlisted > 0 && (
        <Group gap="xs">
          <Text c="text-secondary" fz="sm">
            {getUnlistedMessage(unlisted)}
          </Text>
          {variant === "panel" && (
            <Text c="text-secondary" fz="sm" td="underline">
              <Link
                to={publicSharingSettings()}
                target="_blank"
              >{t`See public sharing settings`}</Link>
            </Text>
          )}
        </Group>
      )}
    </Stack>
  );
};

const AnonymousReachRow = ({
  entity,
}: {
  entity: AnonymouslyReachableEntity;
}) => (
  <Box component="li" className={S.row} p="md">
    <Flex justify="space-between" align="center" gap="md" wrap="nowrap">
      <Flex align="center" gap="sm" wrap="nowrap" miw={0}>
        <FixedSizeIcon name={modelIconMap[entity.model]} c="text-secondary" />
        <Box miw={0}>
          <Link to={modelToUrl(entity)} target="_blank" variant="brand">
            {entity.name}
          </Link>
          {entity.reaches_indirectly && (
            <Text
              c="text-secondary"
              fz="sm"
              lh="1rem"
            >{t`Reaches this database through a filter's value list`}</Text>
          )}
        </Box>
      </Flex>
      <Text className={CS.textNoWrap} c="text-secondary" fz="sm">
        {getSurfacesLabel(entity.surfaces)}
      </Text>
    </Flex>
  </Box>
);

const getFramingCaption = (
  framing: PanelReachFraming | QuestionReachFraming,
): string =>
  match(framing)
    .with(
      "keeps-working",
      () => t`These keep working while anonymous access is allowed:`,
    )
    .with("has-stopped", () => t`These have stopped returning data:`)
    .with("at-stake", () => t`Anonymous visitors reach this database through:`)
    .with("would-stop", () => t`These will stop returning data:`)
    .exhaustive();

const getUnlistedMessage = (unlisted: number): string =>
  ngettext(
    msgid`${unlisted} more is not listed here.`,
    `${unlisted} more are not listed here.`,
    unlisted,
  );

const getSurfacesLabel = (
  surfaces: readonly AnonymousSurface[],
): string | null =>
  match([
    surfaces.includes("public-link"),
    surfaces.includes("guest-embed"),
  ] as const)
    .with([true, true], () => t`Public link and guest embed`)
    .with([true, false], () => t`Public link`)
    .with([false, true], () => t`Guest embed`)
    // unreachable: every row has at least one surface
    .with([false, false], () => null)
    .exhaustive();
