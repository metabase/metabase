import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  EntityPickerModal,
  MiniPicker,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";

import type { PickedItem } from "../types";
import { useEntityPickerSearch } from "../use-entity-picker-search";

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
  onChange: (item: PickedItem) => void;
  onClose: () => void;
};

export function GoalEntityPickers({
  hasOpened,
  opened,
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

  return (
    <>
      <MiniPicker
        className={S.entityPicker}
        forceSearch
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
