import React from "react";
import { t } from "ttag";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger/PopoverWithTrigger";
import DashboardPicker from "metabase/containers/DashboardPicker";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDashboardQuery } from "metabase/common/hooks";
import {
  DashboardPickerContainer,
  DashboardPickerButton,
} from "./DashboardSelector.styled";

interface DashboardSelectorProps {
  onChange: (value?: number | null) => void;
  value?: number;
}

const DashboardSelector = ({ onChange, value }: DashboardSelectorProps) => {
  const {
    data: dashboard,
    error,
    isLoading,
  } = useDashboardQuery({ id: value });
  return (
    <LoadingAndErrorWrapper loading={isLoading}>
      <PopoverWithTrigger
        triggerElement={
          <DashboardPickerButton>
            {dashboard?.name || t`Select a Dashboard`}
          </DashboardPickerButton>
        }
      >
        <DashboardPickerContainer>
          <DashboardPicker
            value={error ? undefined : dashboard?.id}
            onChange={onChange}
          />
        </DashboardPickerContainer>
      </PopoverWithTrigger>
    </LoadingAndErrorWrapper>
  );
};

export default DashboardSelector;
