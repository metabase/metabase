import { useDisclosure } from "@mantine/hooks";
import type { ComponentProps, ReactNode } from "react";
import { t } from "ttag";

import {
  EntityPickerModal,
  MiniPicker,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import type { MenuDropdownProps } from "metabase/ui";

import type { PickedItem } from "../types";
import { useEntityPickerSearch } from "../use-entity-picker-search";

import { GoalEntityPickerBackItem } from "./GoalEntityPickerBackItem";
import S from "./GoalEntityPickers.module.css";

const BROWSE_ALL_MODELS: OmniPickerItem["model"][] = [
  "metric",
  "measure",
  "table",
  "card",
];

const SELECTABLE_BROWSE_MODELS: OmniPickerItem["model"][] = [
  "metric",
  "measure",
  "card",
];

type Props = {
  hasOpened: boolean;
  opened: boolean;
  onBack: () => void;
  onChange: (item: PickedItem) => void;
  onClose: () => void;
};

type DropdownPropsWithRoot = MenuDropdownProps & {
  // MenuDropdownProps does not declare renderRoot, but Menu.Dropdown passes it to Mantine's Box
  renderRoot: (rootProps: ComponentProps<"div">) => ReactNode;
};

export function GoalEntityPickers({
  hasOpened,
  opened,
  onBack,
  onChange,
  onClose,
}: Props) {
  const [isBrowseModalOpen, browseModal] = useDisclosure(false);
  const { models, searchParams } = useEntityPickerSearch(hasOpened);

  const handleBrowseAll = () => {
    onClose();
    browseModal.open();
  };

  const handleChange = (item: PickedItem) => {
    onClose();
    browseModal.close();
    onChange(item);
  };

  const menuDropdownProps: DropdownPropsWithRoot = {
    renderRoot({ children, ...rootProps }) {
      return (
        <div {...rootProps}>
          <GoalEntityPickerBackItem onClick={onBack} />
          {children}
        </div>
      );
    },
  };

  return (
    <>
      <MiniPicker
        className={S.entityPicker}
        forceSearch
        menuDropdownProps={menuDropdownProps}
        menuProps={{
          position: "bottom-start",
        }}
        models={models}
        opened={opened}
        searchInputPlaceholder={t`Search…`}
        searchParams={searchParams}
        showSearchInput
        onBrowseAll={handleBrowseAll}
        onChange={handleChange}
        onClose={onClose}
      />

      {isBrowseModalOpen && (
        <EntityPickerModal
          isSelectableItem={(item: OmniPickerItem) => {
            return (
              SELECTABLE_BROWSE_MODELS.includes(item.model) &&
              typeof item.id === "number"
            );
          }}
          models={BROWSE_ALL_MODELS}
          options={{
            hasConfirmButtons: false,
            hasDatabases: true,
            disableSearchScope: true,
          }}
          title={t`Pick a measure, metric, or saved question`}
          onChange={handleChange}
          onClose={browseModal.close}
        />
      )}
    </>
  );
}
