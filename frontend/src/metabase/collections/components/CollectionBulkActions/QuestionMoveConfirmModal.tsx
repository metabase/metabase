import { useEffect, useMemo } from "react";
import { useLatest } from "react-use";
import { jt, msgid, ngettext, t } from "ttag";
import { first } from "underscore";

import { useGetMultipleCardsDashboardsQuery } from "metabase/api";
import { Button, Flex, List, Loader, Modal, Text, Title } from "metabase/ui";
import type {
  CardId,
  Collection,
  CollectionItem,
  Dashboard,
  DashboardId,
} from "metabase-types/api";

export type CardDashboards = {
  cardId: CardId;
  dashboards: {
    dashboardId: DashboardId;
    name: string;
  }[];
};
export type Destination =
  | (Pick<Collection, "id"> & { model: "collection" })
  | (Pick<Dashboard, "id"> & { model: "dashboard" });

export const QuestionMoveConfirmModal = ({
  selectedItems = [],
  onConfirm,
  onClose,
  destination,
}: {
  selectedItems: Pick<CollectionItem, "id" | "model" | "name">[];
  onConfirm: () => void;
  onClose: () => void;
  destination: Destination | null;
}) => {
  const onConfirmRef = useLatest(onConfirm);
  const { currentData: cardDashboards, isFetching: isLoading } =
    useGetMultipleCardsDashboardsQuery(
      {
        card_ids: selectedItems.map(s => s.id),
      },
      {
        refetchOnMountOrArgChange: true,
      },
    );

  const cardsThatAppearInOtherDashboards = useMemo(
    () =>
      cardDashboards?.filter(cd => {
        if (cd.dashboards.length === 0) {
          return false;
        }

        if (cd.dashboards.length > 1) {
          return true;
        }

        return first(cd.dashboards)?.id !== destination?.id;
      }),
    [destination, cardDashboards],
  );

  const hasNoCardsThatAppearInOtherDashboards =
    !isLoading &&
    Array.isArray(cardsThatAppearInOtherDashboards) &&
    cardsThatAppearInOtherDashboards.length === 0;

  // Based on the results of fetching the data, if we find that the only dashboard
  // that will be affected is the destination dashboard, there is no need to display
  // a message and we can automatically confirm. We put onConfirm in a ref so that it doesn't
  // cause the useEffect to fire
  useEffect(
    function autoConfirmIfUserConsentNotRequired() {
      if (hasNoCardsThatAppearInOtherDashboards) {
        onConfirmRef.current();
      }
    },
    [hasNoCardsThatAppearInOtherDashboards, onConfirmRef],
  );

  const hasError = cardDashboards?.some(cd => cd.dashboards.some(d => d.error));

  const heading = useMemo(() => {
    if (isLoading) {
      return null;
    } else if (hasError) {
      return t`Can't move this question into a dashboard`;
    } else if (cardsThatAppearInOtherDashboards) {
      return ngettext(
        msgid`Move this question?`,
        `Move these questions?`,
        cardsThatAppearInOtherDashboards?.length ?? 0,
      );
    }
  }, [isLoading, hasError, cardsThatAppearInOtherDashboards]);

  const content = useMemo(() => {
    // a bunch of weird checks to keep TS happy. destination should never be null if we're displaying the modal,
    // is isLoading will never be true if cardsThatAppearInOtherDashboards is defined.
    if (
      isLoading ||
      !Array.isArray(cardsThatAppearInOtherDashboards) ||
      !destination
    ) {
      return (
        <Flex
          direction="column"
          justify="center"
          align="center"
          gap="2rem"
          py="3rem"
        >
          <Loader size="lg" />
          <Title>{t`Checking on some things...`}</Title>
        </Flex>
      );
    } else {
      if (hasError) {
        return (
          <>
            <Text>{t`This question currently appears in a dashboard that you don't have permission to edit.`}</Text>
            <Flex justify="end" gap="1rem" mt="1rem">
              <Button onClick={onClose}>{t`Okay`}</Button>
            </Flex>
          </>
        );
      } else {
        return (
          <>
            <Text my="0.5rem">{t`Moving a question into a dashboard removes it from all other dashboards it appears in`}</Text>
            <List>
              {cardsThatAppearInOtherDashboards.map(cd => {
                const card = selectedItems.find(
                  item => item.id === cd.card_id && item.model === "card",
                );

                const dashboardNames = cd.dashboards
                  .filter(d => d.id !== destination.id)
                  .map(d => d.name);

                return (
                  <List.Item key={`card-${cd.card_id}`}>
                    <Text>{jt`${(
                      <Text span fw={700}>
                        {card?.name}
                      </Text>
                    )} will be removed from ${(
                      <DashboardNames names={dashboardNames} />
                    )}`}</Text>
                  </List.Item>
                );
              })}
            </List>

            <Flex justify="end" gap="1rem" mt="1rem">
              <Button variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <Button variant="filled" onClick={onConfirm}>
                {ngettext(
                  msgid`Move it`,
                  `Move them`,
                  cardsThatAppearInOtherDashboards.length,
                )}
              </Button>
            </Flex>
          </>
        );
      }
    }
  }, [
    isLoading,
    cardsThatAppearInOtherDashboards,
    onClose,
    onConfirm,
    destination,
    selectedItems,
    hasError,
  ]);

  return (
    <Modal
      opened={isLoading || !hasNoCardsThatAppearInOtherDashboards}
      title={heading}
      onClose={onClose}
      size="lg"
      withCloseButton={!isLoading}
    >
      {content}
    </Modal>
  );
};

const DashboardNames = ({ names }: { names: string[] }) => {
  if (names.length === 0) {
    return null;
  } else if (names.length === 1) {
    return (
      <Text span fw={700}>
        {names[0]}
      </Text>
    );
  } else {
    const lastName = names.slice(-1);
    const restOfNames = names.slice(0, -1);

    return [
      ...restOfNames.map((name, i, arr) => (
        <Text span key={`dashboard-${name}`}>
          <Text span fw={700}>
            {name}
          </Text>
          {i < arr.length - 1 ? ", " : ""}
        </Text>
      )),
      <Text span key={`dashboard-${lastName}`}>
        {t` and `}
        <Text span fw={700}>
          {lastName}
        </Text>
      </Text>,
    ];
  }
};
