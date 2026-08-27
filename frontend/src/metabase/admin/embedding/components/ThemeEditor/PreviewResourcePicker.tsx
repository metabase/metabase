import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  EntityPickerModal,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import { Button, Icon } from "metabase/ui";

import type { PreviewResource } from "./types";

interface PreviewResourcePickerProps {
  resource: PreviewResource;
  onChange: (resource: PreviewResource) => void;
}

const SELECTABLE_MODELS: OmniPickerItem["model"][] = ["dashboard", "card"];

export function PreviewResourcePicker({
  resource,
  onChange,
}: PreviewResourcePickerProps) {
  const [isPickerOpen, { open: openPicker, close: closePicker }] =
    useDisclosure(false);

  const handleChange = (item: OmniPickerItem) => {
    if (
      (item.model === "dashboard" || item.model === "card") &&
      typeof item.id === "number"
    ) {
      onChange({
        model: item.model,
        id: item.id,
        name: item.name,
      });
      closePicker();
    }
  };

  return (
    <>
      <Button
        variant="default"
        rightSection={<Icon name="chevrondown" size={12} />}
        onClick={openPicker}
        aria-label={t`Change preview resource`}
      >
        {resource.name}
      </Button>

      {isPickerOpen && (
        <EntityPickerModal
          title={t`Select data to preview`}
          models={SELECTABLE_MODELS}
          value={{ id: resource.id, model: resource.model }}
          onChange={handleChange}
          onClose={closePicker}
          isSelectableItem={isSelectableItem}
          options={{
            hasConfirmButtons: false,
            hasPersonalCollections: true,
            hasRootCollection: true,
          }}
        />
      )}
    </>
  );
}

const isSelectableItem = (item: OmniPickerItem) =>
  item.model === "dashboard" || item.model === "card";
