import { t } from "ttag";

import { Button, Group, Tabs, Tooltip } from "metabase/ui";

import type { QueryValidationResult } from "../types";

export type EditorTab = "preview" | "run" | "target" | "dependencies";

type EditorHeaderProps = {
  validationResult?: QueryValidationResult;
  name?: string;
  isNew: boolean;
  isQueryDirty?: boolean;
  isSaving?: boolean;
  hasProposedQuery?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  selectedTab?: EditorTab;
  onTabChange?: (tab: EditorTab) => void;
};

export function EditorHeader({
  validationResult,
  isNew,
  isQueryDirty = false,
  isSaving = false,
  hasProposedQuery = false,
  onSave,
  onCancel,
  selectedTab,
  onTabChange,
}: EditorHeaderProps) {
  const showTabs = selectedTab != null && onTabChange != null;
  const showSaveCancel =
    (!showTabs || selectedTab === "preview") && onSave && onCancel;
  const canSave =
    validationResult &&
    (isNew || isQueryDirty || hasProposedQuery) &&
    validationResult.isValid &&
    !isSaving;

  return (
    <Group
      justify={showTabs ? "space-between" : "flex-end"}
      p="sm"
      style={{ zIndex: 24 }}
      w="100%"
      gap="md"
    >
      {showTabs && (
        <Tabs
          value={selectedTab}
          onChange={onTabChange as (value: string | null) => void}
          variant="pills"
        >
          <Tabs.List>
            <Tabs.Tab value="preview">{t`Preview`}</Tabs.Tab>
            {!isNew && (
              <>
                <Tabs.Tab value="run">{t`Run`}</Tabs.Tab>
                <Tabs.Tab value="target">{t`Target`}</Tabs.Tab>
                <Tabs.Tab value="dependencies">{t`Dependencies`}</Tabs.Tab>
              </>
            )}
          </Tabs.List>
        </Tabs>
      )}
      {showSaveCancel && (
        <Group gap="sm">
          <Button key="cancel" onClick={onCancel} size="compact-sm">{t`Cancel`}</Button>
          <Tooltip
            key="save"
            label={validationResult?.errorMessage}
            disabled={validationResult?.errorMessage == null}
          >
            <Button
              onClick={onSave}
              variant="filled"
              disabled={!canSave}
              size="compact-sm"
            >
              {getSaveButtonLabel(isNew, isSaving)}
            </Button>
          </Tooltip>
        </Group>
      )}
    </Group>
  );
}

function getSaveButtonLabel(isNew: boolean, isSaving: boolean) {
  if (isSaving) {
    return isNew ? t`Saving` : t`Saving changes`;
  } else {
    return isNew ? t`Save` : t`Save changes`;
  }
}
