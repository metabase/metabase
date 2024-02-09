import _ from "underscore";
import { t } from "ttag";

import { useEffect ,useCallback, useState } from "react";
import type {
  Card,
  CollectionEssentials,
  SearchResult,
} from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Link from "metabase/core/components/Link";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Search from "metabase/entities/search";

import type { useSearchListQuery } from "metabase/common/hooks";

import { Box, Flex, Group, Icon, Paper, Text, Title } from "metabase/ui";
import NoResults from "assets/img/no_results.svg";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getLocale } from "metabase/setup/selectors";
import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { updateSetting } from "metabase/admin/settings/settings";
import { getHasDismissedBrowseModelsBanner } from "metabase/browse/selectors";
import { getCollectionName, groupModels } from "../utils";
import { CenteredEmptyState } from "./BrowseApp.styled";
import {
  BannerCloseButton,
  BannerModelIcon,
  CollectionHeaderContainer,
  CollectionHeaderGroup,
  CollectionHeaderLink,
  GridContainer,
  ModelCard,
  MultilineEllipsified,
} from "./BrowseModels.styled";
import { LastEdited } from "./LastEdited";

export const BrowseModels = ({
  modelsResult,
}: {
  modelsResult: ReturnType<typeof useSearchListQuery<SearchResult>>;
}) => {
  const dispatch = useDispatch();
  const { data: models = [], error, isLoading } = modelsResult;
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;
  const modelsFiltered = models.filter(
    model => !isInstanceAnalyticsCollection(model.collection),
  );
  const groupsOfModels = groupModels(modelsFiltered, localeCode);
  const hasDismissedBanner = useSelector(getHasDismissedBrowseModelsBanner);

  const [shouldShowBanner, setShouldShowBanner] = useState(!hasDismissedBanner);

  const dismissBanner = useCallback(() => {
    setShouldShowBanner(false);
    dispatch(
      updateSetting({
        key: "dismissed-browse-models-banner",
        value: true,
      }),
    );
  }, [dispatch]);

  useEffect(() => {
    if (error || isLoading) {
      return;
    }
    dispatch(
      updateSetting({
        key: "default-browse-tab",
        value: "models",
      }),
    );
  }, [error, isLoading, dispatch]);

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  if (modelsFiltered.length) {
    return (
      <>
        {shouldShowBanner && (
          <Paper
            mt="1rem"
            p="1rem"
            color="text-dark"
            bg="brand-lighter"
            shadow="0"
            radius="0.25rem"
            role="complementary"
            w="100%"
          >
            <Flex>
              <BannerModelIcon name="model" />
              <Text size="md" lh="1rem" mr="1rem">
                {t`Models help curate data to make it easier to find answers to questions all in one place.`}
              </Text>
              <BannerCloseButton
                onClick={() => {
                  dismissBanner();
                }}
              >
                <Icon name="close" />
              </BannerCloseButton>
            </Flex>
          </Paper>
        )}
        <GridContainer role="grid" mt={shouldShowBanner ? "1rem" : "0"}>
          {groupsOfModels.map((groupOfModels, index) => (
            <ModelGroup
              models={groupOfModels}
              key={`modelgroup-${groupOfModels[0].collection.id}`}
              localeCode={localeCode}
              fixPaddingUnderBanner={index === 0 && shouldShowBanner}
            />
          ))}
        </GridContainer>
      </>
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
  localeCode,
  fixPaddingUnderBanner,
}: {
  models: SearchResult[];
  localeCode: string | undefined;
  fixPaddingUnderBanner: boolean;
}) => {
  const sortedModels = models.sort((a, b) => {
    if (!a.name && b.name) {
      return 1;
    }
    if (a.name && !b.name) {
      return -1;
    }
    if (!a.name && !b.name) {
      return 0;
    }
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    return nameA.localeCompare(nameB, localeCode);
  });
  const collection = models[0].collection;

  /** This id is used by aria-labelledby */
  const collectionHtmlId = `collection-${collection.id}`;

  // TODO: Check padding above the collection header
  return (
    <>
      <CollectionHeader
        collection={collection}
        key={collectionHtmlId}
        id={collectionHtmlId}
        fixPaddingUnderBanner={fixPaddingUnderBanner}
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
  collectionHtmlId: string;
}

const ModelCell = ({ model, collectionHtmlId }: ModelCellProps) => {
  const headingId = `heading-for-model-${model.id}`;

  const lastEditorFullName =
    model.last_editor_common_name ?? model.creator_common_name;
  const timestamp = model.last_edited_at ?? model.created_at ?? "";

  return (
    <Link
      aria-labelledby={`${collectionHtmlId} ${headingId}`}
      key={model.id}
      to={Urls.model(model as unknown as Partial<Card>)}
    >
      <ModelCard>
        <Box mb="auto">
          <Icon name="model" size={20} color={color("brand")} />
        </Box>
        <Title mb=".25rem" size="1rem">
          <MultilineEllipsified tooltipMaxWidth="20rem" id={headingId}>
            {model.name}
          </MultilineEllipsified>
        </Title>
        <LastEdited editorFullName={lastEditorFullName} timestamp={timestamp} />
      </ModelCard>
    </Link>
  );
};

const CollectionHeader = ({
  collection,
  id,
  fixPaddingUnderBanner,
}: {
  collection: CollectionEssentials;
  id: string;
  fixPaddingUnderBanner: boolean;
}) => {
  const dispatch = useDispatch();
  const wrappable = { ...collection, model: "collection" };
  const wrappedCollection = Search.wrapEntity(wrappable, dispatch);
  const icon = wrappedCollection.getIcon();

  return (
    <CollectionHeaderContainer
      id={id}
      role="heading"
      pt={fixPaddingUnderBanner ? "0" : "1rem"}
      mr="1rem"
      align="center"
    >
      <CollectionHeaderGroup grow noWrap>
        <CollectionHeaderLink to={Urls.collection(collection)}>
          <Group spacing=".25rem">
            <Icon {...icon} />
            <Text weight="bold" color="text-dark">
              {getCollectionName(collection)}
            </Text>
          </Group>
        </CollectionHeaderLink>
      </CollectionHeaderGroup>
    </CollectionHeaderContainer>
  );
};
