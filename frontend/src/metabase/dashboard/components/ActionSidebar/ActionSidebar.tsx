import { useRef, useMemo } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import type {
  Dashboard,
  ActionDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import Button from "metabase/core/components/Button";
import { Form, FormProvider } from "metabase/forms";
import FormInput from "metabase/core/components/FormInput";
import FormSelect from "metabase/core/components/FormSelect";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import {
  FieldLabel,
  FieldLabelContainer,
} from "metabase/core/components/FormField/FormField.styled";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import { Sidebar } from "metabase/dashboard/components/Sidebar";

import { ConnectedActionDashcardSettings } from "metabase/actions/components/ActionViz/ActionDashcardSettings";
import ActionViz from "metabase/actions/components/ActionViz";

import { closeSidebar } from "metabase/dashboard/actions";
import { isActionDashCard } from "metabase/actions/utils";

import {
  Heading,
  SidebarBody,
  SidebarHeader,
  SidebarFooter,
  ChangeActionContainer,
} from "./ActionSidebar.styled";

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
  const actionSettingsModalRef = useRef<any>(null);

  const dashcard = useMemo(
    () =>
      dashboard.dashcards.find(
        dc => dc?.id === dashcardId && isActionDashCard(dc),
      ) as ActionDashboardCard | undefined,
    [dashboard.dashcards, dashcardId],
  );

  if (!dashcard) {
    return null;
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <Heading>{t`Button properties`}</Heading>
      </SidebarHeader>
      <SidebarBody>
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
              onChangeCapture={e =>
                onUpdateVisualizationSettings({
                  "button.label": e.currentTarget.value,
                })
              }
            />
            <FormSelect
              title={t`Button variant`}
              name="button_variant"
              options={buttonVariantOptions}
              onChange={e =>
                onUpdateVisualizationSettings({
                  "button.variant": e.target.value,
                })
              }
            />
          </Form>
        </FormProvider>
        <FieldLabelContainer orientation="vertical" hasDescription={false}>
          <FieldLabel hasError={false}>{t`Action`}</FieldLabel>
        </FieldLabelContainer>

        <ModalWithTrigger
          ref={actionSettingsModalRef}
          fit
          enableMouseEvents
          closeOnClickOutside
          triggerElement={
            !dashcard.action ? (
              <Button primary={!dashcard.action} fullWidth>
                {t`Pick an action`}
              </Button>
            ) : (
              <ChangeActionContainer>
                <Ellipsified>
                  <strong>{dashcard.action.name}</strong>
                </Ellipsified>
                <Button onlyText>{t`Change action`}</Button>
              </ChangeActionContainer>
            )
          }
        >
          <ConnectedActionDashcardSettings
            dashboard={dashboard}
            dashcard={dashcard as ActionDashboardCard}
            onClose={() => {
              actionSettingsModalRef.current?.close();
            }}
          />
        </ModalWithTrigger>
      </SidebarBody>
      <SidebarFooter>
        <Button onClick={onClose} primary small>
          {t`Close`}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export const ActionSidebarConnected = connect(
  null,
  mapDispatchToProps,
)(ActionSidebar);
