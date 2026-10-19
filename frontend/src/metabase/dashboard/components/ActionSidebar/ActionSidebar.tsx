import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { isActionDashCard } from "metabase/actions/utils";
import { Sidebar } from "metabase/common/components/Sidebar";
import CS from "metabase/css/core/index.css";
import ActionViz from "metabase/dashboard/components/ActionViz";
import { ActionDashcardSettings } from "metabase/dashboard/components/ActionViz/ActionDashcardSettings";
import { useDashboardContext } from "metabase/dashboard/context";
import { Form, FormProvider, FormSelect, FormTextInput } from "metabase/forms";
import {
  Box,
  Button,
  Divider,
  Ellipsified,
  Flex,
  Input,
  Modal,
  Stack,
  Title,
} from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";
import type { ActionDashboardCard } from "metabase-types/api";

const getButtonVariantOptions = () =>
  checkNotNull(ActionViz.settings)["button.variant"].getProps().options;

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
    // Unjustified type cast. FIXME
    return dashboard.dashcards.find(
      (dc) => dc?.id === dashcardId && isActionDashCard(dc),
    ) as ActionDashboardCard | undefined;
  }, [dashboard?.dashcards, dashcardId]);

  if (!dashcard || !dashboard) {
    return null;
  }

  return (
    <Sidebar>
      <Box px="xxl" py="lg">
        <Title order={4} c="text-primary" fz="lg">{t`Button properties`}</Title>
      </Box>
      <Divider />
      <Stack px="xxl" py="lg" flex={1} className={CS.overflowYAuto}>
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
              data={getButtonVariantOptions()}
              onChange={(value) =>
                onUpdateDashCardVisualizationSettings(dashcard.id, {
                  "button.variant": value,
                })
              }
            />
          </Form>
        </FormProvider>
        <Input.Wrapper label={t`Action`}>
          {!dashcard.action ? (
            <Button
              variant="filled"
              fullWidth
              onClick={openActionModal}
            >{t`Pick an action`}</Button>
          ) : (
            <Flex justify="space-between" py="xxs">
              <Ellipsified fw="bold">{dashcard.action.name}</Ellipsified>
              <Button
                size="compact-md"
                variant="transparent"
                onClick={openActionModal}
                flex="0 0 auto"
              >{t`Change action`}</Button>
            </Flex>
          )}
        </Input.Wrapper>

        <Modal.Root
          opened={actionModalOpened}
          onClose={closeActionModal}
          size="auto"
        >
          <Modal.Overlay />
          <Modal.Content className={cx(CS.flex, CS.flexColumn)}>
            <ActionDashcardSettings
              dashboard={dashboard}
              dashcard={dashcard}
              onClose={closeActionModal}
            />
          </Modal.Content>
        </Modal.Root>
      </Stack>
      <Divider />
      <Flex px="xxl" py="lg" justify="flex-end">
        <Button onClick={onClose} variant="filled">
          {t`Close`}
        </Button>
      </Flex>
    </Sidebar>
  );
}
