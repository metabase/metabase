import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import ActionViz from "metabase/actions/components/ActionViz";
import { ConnectedActionDashcardSettings } from "metabase/actions/components/ActionViz/ActionDashcardSettings";
import { isActionDashCard } from "metabase/actions/utils";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { FormField } from "metabase/common/components/FormField/FormField";
import CS from "metabase/css/core/index.css";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useDashboardContext } from "metabase/dashboard/context";
import { Form, FormProvider, FormSelect, FormTextInput } from "metabase/forms";
import { Box, Button, Divider, Flex, Modal, Stack, Title } from "metabase/ui";
import type { ActionDashboardCard } from "metabase-types/api";

const buttonVariantOptions = ActionViz.settings["button.variant"].props.options;

export function ActionSidebar() {
  const {
    dashboard,
    sidebar,
    closeSidebar: onClose,
    onUpdateDashCardVisualizationSettings,
  } = useDashboardContext();

  const [
    actionModalOpened,
    { open: openActionModal, close: closeActionModal },
  ] = useDisclosure();

  const dashcardId = sidebar.props.dashcardId;

  const dashcard = useMemo(() => {
    if (!dashboard?.dashcards || !dashcardId) {
      return null;
    }
    return dashboard.dashcards.find(
      (dc) => dc?.id === dashcardId && isActionDashCard(dc),
    ) as ActionDashboardCard | undefined;
  }, [dashboard?.dashcards, dashcardId]);

  if (!dashcard || !dashboard) {
    return null;
  }

  return (
    <Sidebar>
      <Box px="xl" py="md">
        <Title order={4} c="text-primary" fz="lg">{t`Button properties`}</Title>
      </Box>
      <Divider />
      <Stack px="xl" py="md" flex={1} className={CS.overflowYAuto}>
        <FormProvider
          initialValues={{
            button_text:
              dashcard?.visualization_settings?.["button.label"] ?? t`Click me`,
            button_variant:
              dashcard?.visualization_settings?.["button.variant"] ?? "primary",
          }}
          enableReinitialize
          onSubmit={() => {
            onClose();
          }}
        >
          <Form display="contents">
            <FormTextInput
              title={t`Button text`}
              label={t`Button text`}
              name="button_text"
              placeholder={t`Button text`}
              autoFocus
              onChangeCapture={(e) =>
                onUpdateDashCardVisualizationSettings(dashcard.id, {
                  "button.label": e.currentTarget.value,
                })
              }
            />
            <FormSelect
              title={t`Button variant`}
              label={t`Button variant`}
              name="button_variant"
              data={buttonVariantOptions}
              onChange={(value) =>
                onUpdateDashCardVisualizationSettings(dashcard.id, {
                  "button.variant": value,
                })
              }
            />
          </Form>
        </FormProvider>
        <Box>
          <FormField.LabelContainer
            orientation="vertical"
            hasDescription={false}
          >
            <FormField.Label hasError={false}>{t`Action`}</FormField.Label>
          </FormField.LabelContainer>
          {!dashcard.action ? (
            <Button
              variant="filled"
              fullWidth
              onClick={openActionModal}
            >{t`Pick an action`}</Button>
          ) : (
            <Flex justify="space-between" py="xs">
              <Ellipsified fw="bold">{dashcard.action.name}</Ellipsified>
              <Button
                h="auto"
                variant="transparent"
                onClick={openActionModal}
                flex="0 0 auto"
              >{t`Change action`}</Button>
            </Flex>
          )}
        </Box>

        <Modal.Root
          opened={actionModalOpened}
          onClose={closeActionModal}
          size="auto"
        >
          <Modal.Overlay />
          <Modal.Content>
            <ConnectedActionDashcardSettings
              dashboard={dashboard}
              dashcard={dashcard as ActionDashboardCard}
              onClose={closeActionModal}
            />
          </Modal.Content>
        </Modal.Root>
      </Stack>
      <Divider />
      <Flex px="xl" py="md" justify="flex-end">
        <Button onClick={onClose} variant="filled">
          {t`Close`}
        </Button>
      </Flex>
    </Sidebar>
  );
}
