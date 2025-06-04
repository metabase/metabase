import { useState } from "react";
import { t } from "ttag";

import type { DashboardPickerValueItem } from "metabase/common/components/DashboardPicker";
import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import { useDashboardQuery } from "metabase/common/hooks";
import { Flex } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import { DashboardPickerButton } from "./DashboardSelector.styled";

interface DashboardSelectorProps {
  onChange: (value?: DashboardId) => void;
  value?: DashboardId;
}

export const DashboardSelector = ({
  onChange,
  value,
}: DashboardSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: dashboard, isLoading } = useDashboardQuery({ id: value });

  if (isLoading) {
    return (
      <Flex>
        <DashboardPickerButton>{t`Loading...`}</DashboardPickerButton>
      </Flex>
    );
  }

  return (
    <Flex>
      <DashboardPickerButton onClick={() => setIsOpen(true)}>
        {dashboard?.name || t`Select a dashboard`}
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
