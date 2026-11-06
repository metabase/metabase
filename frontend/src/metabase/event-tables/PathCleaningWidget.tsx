import { useTimeout } from "@mantine/hooks";
import { type FocusEvent, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "metabase/ui";

import S from "./PathCleaningWidget.module.css";
import type { PathCleaningRule } from "./path-cleaning";
import type { SettingWidgetProps } from "./settings/types";

const EMPTY_RULE: PathCleaningRule = { pattern: "", replacement: "" };

const isBlank = ({ pattern, replacement, description }: PathCleaningRule) =>
  pattern === "" && replacement === "" && !description;

/** A blank rule is one still being added, so it has no error yet. */
const getRuleError = (rule: PathCleaningRule) =>
  !isBlank(rule) && rule.pattern === "" ? t`Enter a pattern` : undefined;

const withDescription = (
  { description: _description, ...rule }: PathCleaningRule,
  description: string,
): PathCleaningRule => (description !== "" ? { ...rule, description } : rule);

type PathCleaningWidgetProps = SettingWidgetProps<PathCleaningRule[]>;

export const PathCleaningWidget = ({
  id,
  value: rules,
  onChange,
}: PathCleaningWidgetProps) => {
  const [drafts, setDrafts] = useState(rules);
  /** Our last save, until it comes back as the rules. */
  const [pendingRules, setPendingRules] = useState<PathCleaningRule[]>();
  const [previousRules, setPreviousRules] = useState(rules);

  // Rules from outside, such as an undo, replace the drafts. Ours coming
  // back from a save don't, so edits made meanwhile are kept.
  if (!_.isEqual(rules, previousRules)) {
    setPreviousRules(rules);
    setPendingRules(undefined);
    if (!_.isEqual(rules, pendingRules)) {
      setDrafts(rules);
    }
  }

  /** Saves the drafts once every rule in them is complete. */
  const commit = (newDrafts: PathCleaningRule[]) => {
    const newRules = newDrafts.filter((rule) => !isBlank(rule));
    const isValid = newRules.every((rule) => getRuleError(rule) === undefined);
    if (isValid && !_.isEqual(newRules, rules)) {
      setPendingRules(newRules);
      onChange(newRules);
    }
  };

  // Saving on each field's blur would save every rule as it's typed, so the
  // list saves when the focus leaves it.
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      commit(drafts);
    }
  };

  const handleRuleChange = (index: number, rule: PathCleaningRule) =>
    setDrafts(drafts.map((draft, i) => (i === index ? rule : draft)));

  const handleRemove = (index: number) => {
    const newDrafts = drafts.filter((_draft, i) => i !== index);
    setDrafts(newDrafts);
    commit(newDrafts);
  };

  return (
    <Stack id={id} gap="sm" onBlur={handleBlur}>
      {drafts.map((rule, index) => (
        <RuleRow
          key={index}
          rule={rule}
          onChange={(newRule) => handleRuleChange(index, newRule)}
          onRemove={() => handleRemove(index)}
          onSubmit={() => commit(drafts)}
        />
      ))}
      <Group gap="sm">
        <Button
          variant="subtle"
          leftSection={<Icon name="add" />}
          onClick={() => setDrafts([...drafts, EMPTY_RULE])}
        >{t`Add a rule`}</Button>
      </Group>
    </Stack>
  );
};

type RuleRowProps = {
  rule: PathCleaningRule;
  onChange: (rule: PathCleaningRule) => void;
  onRemove: () => void;
  onSubmit: () => void;
};

const RuleRow = ({ rule, onChange, onRemove, onSubmit }: RuleRowProps) => (
  <Group gap="sm" wrap="nowrap">
    <TextInput
      aria-label={t`Pattern`}
      value={rule.pattern}
      placeholder={t`Pattern`}
      error={getRuleError(rule)}
      classNames={{ input: S.patternInput }}
      onChange={(event) => onChange({ ...rule, pattern: event.target.value })}
      onKeyDown={(event) => event.key === "Enter" && onSubmit()}
    />
    <Icon name="arrow_right" c="text-secondary" />
    <TextInput
      aria-label={t`Replacement`}
      value={rule.replacement}
      placeholder={t`Replacement`}
      classNames={{ input: S.patternInput }}
      onChange={(event) =>
        onChange({ ...rule, replacement: event.target.value })
      }
      onKeyDown={(event) => event.key === "Enter" && onSubmit()}
    />
    <Group gap={0} wrap="nowrap">
      <DescriptionButton
        description={rule.description}
        onChange={(description) => onChange(withDescription(rule, description))}
        onClose={onSubmit}
      />
      <ActionIcon
        aria-label={t`Remove rule`}
        variant="subtle"
        onClick={onRemove}
      >
        <Icon name="close" />
      </ActionIcon>
    </Group>
  </Group>
);

type DescriptionMode = "closed" | "preview" | "editing";

/** Long enough to move the pointer into the preview, as in a `HoverCard`. */
const PREVIEW_CLOSE_DELAY_MS = 150;

type DescriptionButtonProps = {
  description: string | undefined;
  onChange: (description: string) => void;
  /**
   * Clicking outside closes the editor before its field blurs, so the
   * description saves when the editor closes.
   */
  onClose: () => void;
};

/**
 * Hovering previews the description, with a link that edits it in the same
 * dropdown; clicking the button edits it too. The field isn't in the preview:
 * hover can't be reached from a keyboard or a touch screen, and the preview
 * closes when the pointer leaves.
 */
const DescriptionButton = ({
  description,
  onChange,
  onClose,
}: DescriptionButtonProps) => {
  const [mode, setMode] = useState<DescriptionMode>("closed");
  const hasDescription = description !== undefined;

  const close = () => {
    if (mode === "editing") {
      onClose();
    }
    setMode("closed");
  };

  const { start: schedulePreviewClose, clear: cancelPreviewClose } = useTimeout(
    () => setMode((current) => (current === "preview" ? "closed" : current)),
    PREVIEW_CLOSE_DELAY_MS,
  );

  const handleMouseEnter = () => {
    cancelPreviewClose();
    setMode((current) => (current === "closed" ? "preview" : current));
  };

  return (
    <Popover
      opened={mode !== "closed"}
      position="top-end"
      shadow="md"
      trapFocus={mode === "editing"}
      onChange={(isOpened) => !isOpened && close()}
    >
      <Popover.Target>
        <ActionIcon
          aria-label={t`Description`}
          variant="subtle"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={schedulePreviewClose}
          onClick={() => (mode === "editing" ? close() : setMode("editing"))}
        >
          <Icon
            name="info"
            c={hasDescription ? "icon-brand" : "icon-secondary"}
          />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown
        p="md"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={schedulePreviewClose}
      >
        {mode === "editing" ? (
          <Textarea
            aria-label={t`Rule description`}
            value={description ?? ""}
            placeholder={t`What is this rule for?`}
            autosize
            w="20rem"
            minRows={2}
            data-autofocus
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <DescriptionPreview
            description={description}
            onEdit={() => setMode("editing")}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
};

type DescriptionPreviewProps = {
  description: string | undefined;
  onEdit: () => void;
};

const DescriptionPreview = ({
  description,
  onEdit,
}: DescriptionPreviewProps) => (
  <Stack gap={0}>
    {description !== undefined && <Text maw="20rem">{description}</Text>}
    <Anchor
      component="button"
      type="button"
      onClick={onEdit}
      style={{ alignSelf: "flex-end" }}
    >
      {description !== undefined ? t`Edit description` : t`Add a description`}
    </Anchor>
  </Stack>
);
