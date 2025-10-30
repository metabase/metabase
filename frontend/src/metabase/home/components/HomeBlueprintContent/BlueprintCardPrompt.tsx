import { Flex, Title, Text, Group, Button, Icon } from "metabase/ui";
import { t } from "ttag";
import { PlaceholderCardGrid } from "./PlaceholderCardGrid";

type BlueprintCardState = "prompt" | "loading";

interface BlueprintCardPromptProps {
  isLoading?: boolean;
  onConfirm: () => void;
  onHide: () => void;
}

const cardConfig: Record<
  BlueprintCardState,
  {
    title: string;
    description: string;
    showButtons: boolean;
  }
> = {
  prompt: {
    title: t`Can we create some nicer tables for you to explore?`,
    description: t`If it's okay with you, we'll run some transformations to give you tables in your database that are easier to explore.`,
    showButtons: true,
  },
  loading: {
    title: t`Making some nicer tables…`,
    description: t`This shouldn't take more than about five minutes.`,
    showButtons: false,
  },
};

export const BlueprintCardPrompt = ({
  isLoading,
  onConfirm,
  onHide,
}: BlueprintCardPromptProps) => {
  const config = cardConfig[isLoading ? "loading" : "prompt"];

  return (
    <>
      <Flex
        w="100%"
        bg="bg-white"
        p="md"
        bdrs="12px"
        style={{
          border: "1px solid var(--mb-color-border)",
        }}
        direction="column"
      >
        <Title order={4} mb="sm" c="text-secondary" fz={17} fw={700} lh="20px">
          {config.title}
        </Title>
        <Text fz={14} lh="16px" fw={400} c="text-secondary">
          {config.description}
        </Text>
        {config.showButtons && (
          <Group mt="lg">
            <Button
              fz="13px"
              mah="32px"
              bdrs="8px"
              py="8px"
              px="12px"
              onClick={onHide}
            >{t`No thanks`}</Button>
            <Button
              fz="13px"
              mah="32px"
              bdrs="8px"
              py="8px"
              px="12px"
              bg="#358CD9"
              variant="filled"
              leftSection={<Icon name="table2" opacity={0.6} c="white" />}
              onClick={onConfirm}
            >{t`Create nicer tables`}</Button>
          </Group>
        )}
      </Flex>
      <PlaceholderCardGrid isLoading={isLoading} />
    </>
  );
};
