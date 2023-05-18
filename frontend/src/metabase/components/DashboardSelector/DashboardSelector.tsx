import React from "react";
import { t } from "ttag";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import DashboardPicker from "metabase/containers/DashboardPicker";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDashboardQuery } from "metabase/common/hooks";
import { Collection } from "metabase-types/api";
import {
  DashboardPickerContainer,
  DashboardPickerButton,
} from "./DashboardSelector.styled";

interface DashboardSelectorProps {
  onChange: (value?: number | null) => void;
  value?: number;
  collectionFilter?: (collection: Collection) => boolean;
}

const DashboardSelector = ({
  onChange,
  value,
  ...rest
}: DashboardSelectorProps) => {
  const {
    data: dashboard,
    error,
    isLoading,
  } = useDashboardQuery({ id: value });
  return (
    <LoadingAndErrorWrapper loading={isLoading}>
      <TippyPopoverWithTrigger
        sizeToFit
        maxWidth={600}
        renderTrigger={({ onClick }) => (
          <DashboardPickerButton onClick={onClick}>
            {dashboard?.name || t`Select a dashboard`}
          </DashboardPickerButton>
        )}
        popoverContent={({ closePopover }) => (
          <DashboardPickerContainer>
            <DashboardPicker
              value={error ? undefined : dashboard?.id}
              onChange={value => {
                closePopover();
                onChange(value);
              }}
              {...rest}
            />
          </DashboardPickerContainer>
        )}
      />
    </LoadingAndErrorWrapper>
  );
};

export default DashboardSelector;
