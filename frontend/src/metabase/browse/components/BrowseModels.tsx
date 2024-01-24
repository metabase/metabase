import _ from "underscore";
import cx from "classnames";
import { c, t } from "ttag";
import dayjs from "dayjs";
import updateLocale from "dayjs/plugin/updateLocale";
import relativeTime from "dayjs/plugin/relativeTime";

import type { Card, Collection, SearchResult } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Link from "metabase/core/components/Link";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import type { useSearchListQuery } from "metabase/common/hooks";

import { Box, Group, Icon, Text, Title, Tooltip } from "metabase/ui";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { sortModels } from "metabase/browse/utils";
import NoResults from "assets/img/no_results.svg";
import { useSelector } from "metabase/lib/redux";
import { getLocale } from "metabase/setup/selectors";
import { CenteredEmptyState } from "./BrowseApp.styled";
import {
  CollectionHeaderContainer,
  CollectionHeaderLink,
  GridContainer,
  ModelCard,
  MultilineEllipsified,
} from "./BrowseModels.styled";

dayjs.extend(updateLocale);
dayjs.extend(relativeTime);

// TODO: Move to separate file, along with LastEdited
// Move localization to separate PR
const giveContext = (unit: string) =>
  c(
    `Abbreviation for "{0} ${unit}(s)". Keep abbreviations distinct from one another.`,
  );

let relativeTimeConfig: Record<string, unknown> = {
  // The following line means: Take the translation of the string "{0}min".
  // Substitute "%d" for the number. Tell dayjs to use that string when
  // describing recent dates. For example, in English, the string would
  // be "%ds". So, if theDate is a Dayjs date that is 5 minutes in the
  // past, theDate.fromNow will return "5min".
  // In Swahili, "5min" is "5 dk". "{0}min" translates to "{0} dk".
  // So "%s dk" will be the string provided to Dayjs.fromNow for
  // describing dates that are mere minutes in the past.
  // Given a date 30 minutes in the past, it will return "30 dk".
  m: giveContext("minute").t`${"%d"}min`,
  h: giveContext("hour").t`${"%d"}h`,
  d: giveContext("day").t`${"%d"}d`,
  M: giveContext("month").t`${"%d"}mo`,
  y: giveContext("year").t`${"%d"}yr`,
  // For any number of seconds, just show 1min
  s: () => giveContext("minute").t`${1}min`,
  // Don't use "ago"
  past: "%s",
  // For the edge case where a model's last-edit date is somehow in the future
  future: c("{0} is a period of time such as '5 minutes' or '5 months'")
    .t`${"%s"} from now`,
};

// Use the same abbreviations for singular and plural
relativeTimeConfig = {
  ...relativeTimeConfig,
  mm: relativeTimeConfig.m,
  hh: relativeTimeConfig.h,
  dd: relativeTimeConfig.d,
  MM: relativeTimeConfig.M,
  yy: relativeTimeConfig.y,
};

dayjs.updateLocale(dayjs.locale(), { relativeTime: relativeTimeConfig });

// TODO: Check if this is required:
// // Use a different dayjs instance to avoid polluting the global one
// const dayjsWithAbbrevs = dayjs.extend((_, { instance }) => {
//   return {
//     updateLocale(localeName, config) {
//       const locale = (instance.Ls[localeName] = {
//         ...instance.Ls[localeName],
//         ...config,
//       });
//       return locale;
//     },
//   };
// });

const emptyArray: SearchResult[] = [];

export const groupModels = (
  models: SearchResult[],
  locale: string | undefined,
) => {
  const groupedModels = _.groupBy(models, model => model.collection.id);
  let collections = models.map(model => model.collection);
  collections = _.uniq(collections, collection => collection.id);
  collections.sort((a, b) => a.name.localeCompare(b.name, locale));
  return { groupedModels, collections };
};

export const BrowseModels = ({
  modelsResult,
}: {
  modelsResult: ReturnType<typeof useSearchListQuery<SearchResult>>;
}) => {
  const { data: models = emptyArray, error, isLoading } = modelsResult;
  const locale = useSelector(getLocale);
  const { collections, groupedModels } = groupModels(models, locale?.code);

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  if (models.length) {
    return (
      <GridContainer role="grid">
        {collections.map((collection, index) => (
          <ModelGroup
            index={index}
            models={groupedModels[collection.id]}
            key={`modelgroup-${index}`}
          />
        ))}
      </GridContainer>
    );
  }

  return (
    <CenteredEmptyState
      title={<Box mb=".5rem">{t`No models here yet`}</Box>}
      message={
        <Box maw="24rem">{t`Models help curate data to make it easier to find answers to questions all in one place.`}</Box>
      }
      illustrationElement={
        <Box mb=".5rem">
          <img src={NoResults} />
        </Box>
      }
    />
  );
};

const ModelGroup = ({
  models,
  index,
}: {
  models: SearchResult[];
  index: number;
}) => {
  const sortedModels = models.sort(sortModels);
  const collection = models[0].collection;

  /** This id is used by aria-labelledby */
  const collectionHtmlId = `collection-${collection?.id ?? `index-${index}`}`;

  return (
    <>
      <CollectionHeader
        collection={models[0].collection}
        key={collectionHtmlId}
        id={collectionHtmlId}
      />
      {sortedModels.map(model => (
        <ModelCell
          model={model}
          collectionHtmlId={collectionHtmlId}
          key={`model-${model.id}`}
        />
      ))}
    </>
  );
};

interface ModelCellProps {
  model: SearchResult;
  style?: React.CSSProperties;
  collectionHtmlId: string;
}

const ModelCell = ({ model, style, collectionHtmlId }: ModelCellProps) => {
  const headingId = `heading-for-model-${model.id}`;

  const lastEditorFullName =
    model.last_editor_common_name ?? model.creator_common_name;
  const timestamp = model.last_edited_at ?? model.created_at ?? "";

  return (
    <Link
      aria-labelledby={`${collectionHtmlId} ${headingId}`}
      key={model.id}
      style={style}
      to={Urls.model(model as unknown as Partial<Card>)}
    >
      <ModelCard>
        <Title order={4} className="text-wrap" lh="1rem" mb=".5rem">
          <MultilineEllipsified id={headingId}>
            {model.name}
          </MultilineEllipsified>
        </Title>
        <Text h="2rem" size="xs" mb="auto">
          <MultilineEllipsified
            tooltipMaxWidth="100%"
            className={cx({ "text-light": !model.description })}
          >
            {model.description || "No description."}{" "}
          </MultilineEllipsified>
        </Text>
        <LastEdited
          lastEditorFullName={lastEditorFullName}
          timestamp={timestamp}
        />
      </ModelCard>
    </Link>
  );
};

const getHowLongAgo = (timestamp: string) => {
  const date = dayjs(timestamp);
  if (timestamp && date.isValid()) {
    return date.fromNow();
  } else {
    return t`(invalid date)`;
  }
};

const LastEdited = ({
  lastEditorFullName,
  timestamp,
}: {
  lastEditorFullName: string | null;
  timestamp: string;
}) => {
  const howLongAgo = getHowLongAgo(timestamp);
  const timeLabel = timestamp ? getHowLongAgo(timestamp) : "";
  const formattedDate = formatDateTimeWithUnit(timestamp, "day", {});
  const time = (
    <time key="time" dateTime={timestamp}>
      {formattedDate}
    </time>
  );
  const tooltipLabel = c(
    "{0} is the full name (or if this is unavailable, the email address) of the last person who edited a model. {1} is a phrase like '5 months ago'",
  ).jt`Last edited by ${lastEditorFullName}${(<br key="br" />)}${time}`;
  return (
    <Tooltip label={tooltipLabel} withArrow disabled={!timeLabel}>
      <Text role="note" size="small">
        {lastEditorFullName}
        {lastEditorFullName && howLongAgo && <Text px=".4">•</Text>}
        {howLongAgo}
      </Text>
    </Tooltip>
  );
};

const CollectionHeader = ({
  collection,
  style,
  id,
}: {
  collection?: Pick<Collection, "id" | "name"> | null;
  style?: React.CSSProperties;
  id: string;
}) => {
  const MaybeLink = ({ children }: { children: React.ReactNode }) =>
    collection ? (
      <Group grow noWrap>
        <CollectionHeaderLink to={Urls.collection(collection)}>
          {children}
        </CollectionHeaderLink>
      </Group>
    ) : (
      <>{children}</>
    );
  return (
    <CollectionHeaderContainer id={id} role="heading" style={style}>
      <MaybeLink>
        <Group spacing=".33rem">
          <Icon name="folder" color={"text-dark"} size={16} />
          <Text>{collection?.name || "Untitled collection"}</Text>
        </Group>
      </MaybeLink>
    </CollectionHeaderContainer>
  );
};
