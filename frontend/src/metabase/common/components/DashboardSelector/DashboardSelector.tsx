import { useState } from "react";
import { t } from "ttag";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  DashboardPickerModal,
  type DashboardPickerValueItem,
} from "metabase/common/components/Pickers/DashboardPicker";
import { Flex, Group, Icon } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import { DashboardPickerButton } from "./DashboardSelector.styled";

interface DashboardSelectorProps {
  onChange: (value?: DashboardId) => void;
  value?: DashboardId;
  fullWidth?: boolean;
}

export const DashboardSelector = ({
  onChange,
  value,
  fullWidth = true,
}: DashboardSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    data: dashboard,
    isLoading,
    error,
  } = useGetDashboardQuery(
    value
      ? {
          id: value,
          ignore_error: true, // don't throw up an error page if the user can't access the dashboard
        }
      : skipToken,
  );

  if (isLoading) {
    return (
      <Flex>
        <DashboardPickerButton disabled>{t`Loading...`}</DashboardPickerButton>
      </Flex>
    );
  }

  if (error) {
    return (
      <Group bg="background-secondary" p="1rem">
        <Icon name="warning" />
        {t`Error loading dashboard.`}
        {"  "}
        {getErrorMessage(error)}
      </Group>
    );
  }
  ``;
  return (
    <Flex>
      <DashboardPickerButton
        fullWidth={fullWidth}
        onClick={() => setIsOpen(true)}
      >
        {dashboard?.name || t`Pick a dashboard`}
      </DashboardPickerButton>
      {isOpen && (
        <DashboardPickerModal
          title={t`Choose a dashboard`}
          value={
            dashboard?.id ? { model: "dashboard", id: dashboard.id } : undefined
          }
          onChange={(dashboard: DashboardPickerValueItem) => {
            onChange(dashboard.id);
            setIsOpen(false);
          }}
          onClose={() => setIsOpen(false)}
          options={{
            showPersonalCollections: false,
            showRootCollection: true,
            allowCreateNew: false,
            hasConfirmButtons: false,
          }}
        />
      )}
    </Flex>
  );
};
