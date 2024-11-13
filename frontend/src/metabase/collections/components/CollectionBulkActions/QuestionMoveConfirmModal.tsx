import {
  Box,
  Button,
  Center,
  Flex,
  List,
  Loader,
  Modal,
  Text,
} from "metabase/ui";
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
        "Moving a question into a dashboard will remove it from all other dashboards"
      }
      onClose={onClose}
      size="lg"
      withCloseButton={!isLoading}
    >
      {isLoading ? (
        <Center>
          <Loader size="lg" />
        </Center>
      ) : (
        <>
          {cardDashboards.map(cd => {
            const card = selectedItems.find(
              item => item.id === cd.cardId && item.model === "card",
            );
            return (
              <Box mt="1rem" key={`card-${cd.cardId}`}>
                <Text>
                  Moving{" "}
                  <Text span fw={700}>
                    {card?.name}
                  </Text>{" "}
                  will remove it from the following dashboards
                </Text>
                <List>
                  {cd.dashboards.map(dashboard => (
                    <List.Item key={`dashboard-${dashboard.dashboardId}`}>
                      {dashboard.name}
                    </List.Item>
                  ))}
                </List>
              </Box>
            );
          })}

          <Flex justify="end" gap="1rem" mt="1rem">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="filled" onClick={onConfirm}>
              Confirm
            </Button>
          </Flex>
        </>
      )}
    </Modal>
  );
};
