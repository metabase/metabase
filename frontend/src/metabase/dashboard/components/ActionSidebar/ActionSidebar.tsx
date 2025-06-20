import { useDebouncedCallback, useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import ActionViz from "metabase/actions/components/ActionViz";
import { isActionDashCard } from "metabase/actions/utils";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import FormField from "metabase/core/components/FormField/FormField";
import FormInput from "metabase/core/components/FormInput";
import FormSelect from "metabase/core/components/FormSelect";
import { closeSidebar } from "metabase/dashboard/actions";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { Form, FormProvider } from "metabase/forms";
import { connect } from "metabase/lib/redux";
import { Box, Button, Flex, Title } from "metabase/ui";
import type {
  ActionDashboardCard,
  Dashboard,
  VisualizationSettings,
} from "metabase-types/api";

import S from "./ActionSidebar.module.css";
import { DashboardActionPickerModal } from "./DashboardActionPickerModal";

const buttonVariantOptions = ActionViz.settings["button.variant"].props.options;

const mapDispatchToProps = {
  closeSidebar,
};

interface ActionSidebarProps {
  dashboard: Dashboard;
  dashcardId: number;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  onClose: () => void;
}

export function ActionSidebar({
  dashboard,
  dashcardId,
  onUpdateVisualizationSettings,
  onClose,
}: ActionSidebarProps) {
  const [isOpen, { close, open }] = useDisclosure(false);

  const dashcard = useMemo(() => {
    return dashboard.dashcards.find(
      (dc) => dc?.id === dashcardId && isActionDashCard(dc),
    ) as ActionDashboardCard | undefined;
  }, [dashboard.dashcards, dashcardId]);

  const onChangeLabelDebounced = useDebouncedCallback(
    (settings: Partial<VisualizationSettings>) => {
      onUpdateVisualizationSettings(settings);
    },
    300,
  );

  if (!dashcard) {
    return null;
  }

  return (
    <Sidebar>
      <Box px="xl" py="md" className={S.SidebarHeader}>
        <Title order={4} className={S.Heading}>{t`Button properties`}</Title>
      </Box>
      <Box px="xl" py="md" className={S.SidebarBody}>
        <FormProvider
          initialValues={{
            button_text:
              dashcard?.visualization_settings?.["button.label"] ?? t`Click me`,
            button_variant:
              dashcard?.visualization_settings?.["button.variant"] ?? "primary",
          }}
          enableReinitialize
          onSubmit={onClose}
        >
          <Form>
            <FormInput
              title={t`Button text`}
              name="button_text"
              placeholder={t`Button text`}
              autoFocus
              onChangeCapture={(e) =>
                onChangeLabelDebounced({
                  "button.label": e.currentTarget.value,
                })
              }
            />
            <FormSelect
              title={t`Button variant`}
              name="button_variant"
              options={buttonVariantOptions}
              onChange={(e) =>
                onUpdateVisualizationSettings({
                  "button.variant": e.target.value,
                })
              }
            />
          </Form>
        </FormProvider>
        <FormField.LabelContainer orientation="vertical" hasDescription={false}>
          <FormField.Label hasError={false}>{t`Action`}</FormField.Label>
        </FormField.LabelContainer>

        {!dashcard.action ? (
          <Button
            variant={!dashcard.action ? "primary" : "default"}
            fullWidth
            onClick={open}
          >
            {t`Pick an action`}
          </Button>
        ) : (
          <Flex justify="space-between" align="center">
            <Ellipsified>
              <strong>{dashcard.action.name}</strong>
            </Ellipsified>
            <Button
              variant="subtle"
              size="compact-md"
              onClick={open}
            >{t`Change`}</Button>
          </Flex>
        )}
      </Box>
      <Flex px="xl" py="md" justify="flex-end" className={S.SidebarFooter}>
        <Button variant="primary" onClick={onClose}>
          {t`Close`}
        </Button>
      </Flex>

      {isOpen && (
        <DashboardActionPickerModal
          isOpen
          dashboard={dashboard}
          dashcard={dashcard}
          onClose={close}
        />
      )}
    </Sidebar>
  );
}

export const ActionSidebarConnected = connect(
  null,
  mapDispatchToProps,
)(ActionSidebar);
