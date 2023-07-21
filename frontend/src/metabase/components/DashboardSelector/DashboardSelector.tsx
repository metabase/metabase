import { t } from "ttag";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import DashboardPicker from "metabase/containers/DashboardPicker";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDashboardQuery } from "metabase/common/hooks";
import { Collection, DashboardId } from "metabase-types/api";
import {
  DashboardPickerContainer,
  DashboardPickerButton,
} from "./DashboardSelector.styled";

interface DashboardSelectorProps {
  onChange: (value?: DashboardId) => void;
  value?: DashboardId;
  collectionFilter?: (
    collection: Collection,
    index: number,
    allCollections: Collection[],
  ) => boolean;
}

export const DashboardSelector = ({
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
