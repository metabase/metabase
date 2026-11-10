import { useMemo } from "react";
import { t } from "ttag";

import { useListActionTemplateCategoriesQuery } from "metabase/api";
import type {
  ActionSecretTemplate,
  ActionTemplateCategory,
} from "metabase-types/api";

import {
  type TemplatePickerCategory,
  TemplatePickerModal,
} from "../TemplatePickerModal";

const CUSTOM_SECRET_ID = "custom";

type ActionSecretTemplateModalProps = {
  onSelect: (template: ActionSecretTemplate | undefined) => void;
  onClose: () => void;
};

export function ActionSecretTemplateModal({
  onSelect,
  onClose,
}: ActionSecretTemplateModalProps) {
  const {
    data: categories = [],
    isLoading,
    error,
  } = useListActionTemplateCategoriesQuery();
  const pickerCategories = useMemo(
    () => getPickerCategories(categories),
    [categories],
  );

  const handleSelect = (itemId: string) => {
    onSelect(
      categories
        .flatMap(({ secrets }) => secrets)
        .find(({ id }) => id === itemId),
    );
  };

  return (
    <TemplatePickerModal
      title={t`New secret`}
      categories={pickerCategories}
      isLoading={isLoading}
      error={error}
      onSelect={handleSelect}
      onClose={onClose}
    />
  );
}

function getPickerCategories(
  categories: ActionTemplateCategory[],
): TemplatePickerCategory[] {
  return [
    {
      id: CUSTOM_SECRET_ID,
      name: t`Custom`,
      items: [
        {
          id: CUSTOM_SECRET_ID,
          name: t`Custom secret`,
          description: t`Any name, value and allowed hosts.`,
        },
      ],
    },
    ...categories
      .filter(({ secrets }) => secrets.length > 0)
      .map(({ id, name, secrets }) => ({ id, name, items: secrets })),
  ];
}
