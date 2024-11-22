import { jt, msgid, ngettext, t } from "ttag";

import { Button, Flex, List, Loader, Modal, Text, Title } from "metabase/ui";
import type { CardId, CollectionItem, DashboardId } from "metabase-types/api";

export type CardDashboards = {
  cardId: CardId;
  dashboards: {
    dashboardId: DashboardId;
    name: string;
  }[];
};

export const QuestionMoveConfirmModal = ({
  cardDashboards = [],
  selectedItems = [],
  onConfirm,
  onClose,
  isLoading = false,
}: {
  cardDashboards?: CardDashboards[];
  selectedItems: Pick<CollectionItem, "id" | "model" | "name">[];
  onConfirm: () => void;
  onClose: () => void;
  isLoading?: boolean;
}) => {
  return (
    <Modal
      opened={cardDashboards.length > 0 || isLoading}
      title={
        !isLoading &&
        ngettext(
          msgid`Move this question?`,
          `Move these questions?`,
          cardDashboards.length,
        )
      }
      onClose={onClose}
      size="lg"
      withCloseButton={!isLoading}
    >
      {isLoading ? (
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
      ) : (
        <>
          <Text my="0.5rem">{t`Moving a question into a dashboard removes it from all other dashboards it appears in`}</Text>
          <List>
            {cardDashboards.map(cd => {
              const card = selectedItems.find(
                item => item.id === cd.cardId && item.model === "card",
              );

              const dashboardNames = cd.dashboards.map(d => d.name);

              return (
                <List.Item key={`card-${cd.cardId}`}>
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
              Cancel
            </Button>
            <Button variant="filled" onClick={onConfirm}>
              {ngettext(msgid`Move it`, `Move them`, cardDashboards.length)}
            </Button>
          </Flex>
        </>
      )}
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
