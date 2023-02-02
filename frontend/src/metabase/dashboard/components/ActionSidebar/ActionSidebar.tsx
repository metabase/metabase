import React, { useRef, useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";

import type {
  Dashboard,
  ActionDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import Search from "metabase/entities/search";

import Button from "metabase/core/components/Button";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSelect from "metabase/core/components/FormSelect";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Sidebar from "metabase/dashboard/components/Sidebar";

import { ConnectedActionDashcardSettings } from "metabase/actions/components/ActionViz/ActionDashcardSettings";
import ActionViz from "metabase/actions/components/ActionViz";

import { addActionToDashboard, closeSidebar } from "metabase/dashboard/actions";
import { isActionDashCard } from "metabase/actions/utils";

import {
  Heading,
  SidebarBody,
  SidebarHeader,
  SidebarFooter,
} from "./ActionSidebar.styled";

const buttonVariantOptions = ActionViz.settings["button.variant"].props.options;

const mapDispatchToProps = {
  addAction: addActionToDashboard,
  closeSidebar,
};

interface ActionSidebarProps {
  dashboard: Dashboard;
  dashcardId: number;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  onClose: () => void;
}

function ActionSidebarFn({
  dashboard,
  dashcardId,
  onUpdateVisualizationSettings,
  onClose,
}: ActionSidebarProps) {
  const actionSettingsModalRef = useRef<any>(null);

  const dashcard = useMemo(
    () =>
      dashboard.ordered_cards.find(
        dc => dc?.id === dashcardId && isActionDashCard(dc),
      ) as ActionDashboardCard | undefined,
    [dashboard.ordered_cards, dashcardId],
  );

  if (!dashcard) {
    return null;
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <Heading>{t`Button properties`}</Heading>
      </SidebarHeader>
      <SidebarBody data-dashcardId={dashcard.id}>
        <FormProvider
          initialValues={{
            name:
              dashcard?.visualization_settings?.["button.label"] ?? t`Click me`,
            variant:
              dashcard?.visualization_settings?.["button.variant"] ?? "primary",
          }}
          enableReinitialize
          onSubmit={onClose}
        >
          <Form>
            <FormInput
              title={t`Button text`}
              name="name"
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
              name="variant"
              options={buttonVariantOptions}
              onChange={e =>
                onUpdateVisualizationSettings({
                  "button.variant": e.target.value,
                })
              }
            />
          </Form>
        </FormProvider>

        <ModalWithTrigger
          ref={actionSettingsModalRef}
          fit
          enableMouseEvents
          triggerElement={
            <Button primary={!dashcard.action} fullWidth>
              {dashcard.action ? t`Update assigned action` : t`Pick an action`}
            </Button>
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

export const ActionSidebar = _.compose(
  Search.loadList({
    query: () => ({
      models: ["dataset"],
    }),
    loadingAndErrorWrapper: false,
    listName: "models",
  }),
  connect(null, mapDispatchToProps),
)(ActionSidebarFn);
