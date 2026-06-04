import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import PinnedQuestionLoader from "metabase/collections/components/PinnedQuestionCard/PinnedQuestionLoader";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import type { IconData } from "metabase/common/utils/icon";
import { useGetIcon } from "metabase/hooks/use-icon";
import { setArtifactDragData } from "metabase/metabot/components/MetabotBar/artifactDragData";
import { makeRoundedDragImage } from "metabase/metabot/components/MetabotBar/artifactDragImage";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import {
  Box,
  Button,
  Center,
  Flex,
  HoverCard,
  Loader,
  Text,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { CardId } from "metabase-types/api";

import { PaddedSidebarLink, SidebarHeading } from "../MainNavbar.styled";

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = "13.25rem";
// artifacts collapse to this many rows until the user expands the section
const MAX_VISIBLE_ROWS = 10;

function ArtifactRow({
  id,
  name,
  icon,
  onClick,
}: {
  id: CardId;
  name: string;
  icon: IconData;
  onClick: (id: CardId) => void;
}) {
  return (
    <HoverCard
      position="right-start"
      offset={12}
      openDelay={150}
      closeDelay={0}
    >
      <HoverCard.Target>
        <div
          draggable
          data-testid="metabot-artifact-row"
          onDragStart={(e) => {
            setArtifactDragData(e.dataTransfer, { model: "card", id });
            // a rounded offscreen clone keeps the drag ghost's corners rounded
            const ghost = makeRoundedDragImage(e.currentTarget);
            e.dataTransfer.setDragImage(ghost, 0, 0);
            // the clone must be in the DOM while the browser rasterizes it
            window.setTimeout(() => ghost.remove(), 0);
          }}
        >
          <PaddedSidebarLink
            icon={icon}
            onClick={() => onClick(id)}
            aria-label={name}
          >
            {name}
          </PaddedSidebarLink>
        </div>
      </HoverCard.Target>
      <HoverCard.Dropdown p={0}>
        <Box w={PREVIEW_WIDTH} data-testid="metabot-artifact-preview">
          <PinnedQuestionLoader id={id}>
            {({ question, rawSeries, loading, error, errorIcon }) => (
              <Flex direction="column" h={PREVIEW_HEIGHT}>
                <Text fw="bold" size="sm" truncate px="md" pt="sm" pb="xs">
                  {question?.displayName() ?? name}
                </Text>
                <Box flex="1 0 0" mih={0}>
                  {loading ? (
                    <Center h="100%">
                      <Loader size="sm" />
                    </Center>
                  ) : (
                    <Visualization
                      rawSeries={rawSeries}
                      error={error}
                      errorIcon={errorIcon}
                      isDashboard
                    />
                  )}
                </Box>
              </Flex>
            )}
          </PinnedQuestionLoader>
        </Box>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

type Props = {
  onItemSelect: () => void;
};

export function MetabotArtifactsSection({ onItemSelect }: Props) {
  const dispatch = useDispatch();
  const getIcon = useGetIcon();
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const personalCollectionId = useSelector(getUserPersonalCollectionId);
  const [showAll, setShowAll] = useState(false);

  const { data } = useListCollectionItemsQuery(
    personalCollectionId != null
      ? {
          id: personalCollectionId,
          models: ["card"],
          ai_generated: true,
          sort_column: "created_at",
          sort_direction: "desc",
        }
      : skipToken,
    { skip: !hasMetabotAccess },
  );

  const artifacts = data?.data ?? [];

  // hide the whole section when there's nothing to show
  if (!hasMetabotAccess || artifacts.length === 0) {
    return null;
  }

  const handleClick = (id: CardId) => {
    onItemSelect();
    dispatch(push(`/question/${id}`));
  };

  const visibleArtifacts = showAll
    ? artifacts
    : artifacts.slice(0, MAX_VISIBLE_ROWS);

  return (
    <Box role="section" aria-label={t`Artifacts`} mt="sm" pl="md" pr="6px">
      <ErrorBoundary>
        <CollapseSection
          header={<SidebarHeading>{t`Artifacts`}</SidebarHeading>}
          initialState="expanded"
          iconPosition="right"
          iconSize={8}
          role="section"
          aria-label={t`Artifacts`}
        >
          <Box data-testid="metabot-artifacts-section">
            {visibleArtifacts.map((item) => (
              <ArtifactRow
                key={item.id}
                id={item.id}
                name={item.name}
                icon={getIcon(item)}
                onClick={handleClick}
              />
            ))}
            {artifacts.length > MAX_VISIBLE_ROWS && (
              <Button
                variant="subtle"
                size="xs"
                fz="xs"
                c="text-secondary"
                pl="16px"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? t`Show less` : t`Show more`}
              </Button>
            )}
          </Box>
        </CollapseSection>
      </ErrorBoundary>
    </Box>
  );
}
