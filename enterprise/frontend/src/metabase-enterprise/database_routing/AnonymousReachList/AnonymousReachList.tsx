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
import { modelToUrl } from "metabase/urls";
import type {
  AnonymousSurface,
  AnonymouslyReachingEntity,
  DatabaseAnonymousReach,
} from "metabase-types/api";

import S from "./AnonymousReachList.module.css";

const ROWS_IN_A_QUESTION = 5;

const PUBLIC_SHARING_SETTINGS = "/admin/settings/public-sharing";

/** Keeps a busy instance's list from pushing the rest of the panel off the page. */
const PANEL_LIST_MAX_HEIGHT = "13.75rem";

/** How the panel frames the list, following the grant recorded on the database. */
export type PanelReachFraming = "keeps-working" | "has-stopped" | "would-stop";

/** How a question frames it: nothing is decided yet, or a grant is being taken away. */
type QuestionReachFraming = "at-stake" | "would-stop";

type AnonymousReachListProps = {
  /** Absent until the fact arrives, and the fact is admin-only. */
  reach: DatabaseAnonymousReach | undefined;
} & (
  | {
      /** Lists everything the server served, scrolling, and points at the settings where the cap bit. */
      variant: "panel";
      framing: PanelReachFraming;
    }
  | {
      /** Lists five rows and counts the rest, which is enough to decide on. */
      variant: "question";
      framing: QuestionReachFraming;
    }
);

/**
 * The public links and published guest embeds through which anonymous traffic gets data from a
 * database.
 */
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
      // Safari drops list semantics from a list with no markers, and the rows are the list
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
                to={PUBLIC_SHARING_SETTINGS}
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
  entity: AnonymouslyReachingEntity;
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

/** Labels which anonymous surfaces reach the database through this entity. */
const getSurfacesLabel = (surfaces: AnonymousSurface[]): string | null =>
  match([
    surfaces.includes("public-link"),
    surfaces.includes("guest-embed"),
  ] as const)
    .with([true, true], () => t`Public link and guest embed`)
    .with([true, false], () => t`Public link`)
    .with([false, true], () => t`Guest embed`)
    // the relation only produces a row because some surface reaches the database through it
    .with([false, false], () => null)
    .exhaustive();
