import type { EditorView } from "@tiptap/pm/view";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";

import type { SuggestionGroup } from "../KeyboardFilterRow/types";

import {
  type ActionContext,
  replaceText,
  replaceTextSelected,
  settle,
} from "./editor-actions";
import {
  AI_PREFIX,
  type Draft,
  type Parsed,
  type Stage,
  draftAt,
  parseDraft,
  stageOf,
} from "./parser";
import type { BarOption, BarOptionGroup } from "./popover-ui";
import { flattenOptions, searchGroups } from "./popover-ui";
import type { FilterSchema, SchemaField } from "./schema";

export type SuggestDeps = ActionContext & {
  view: EditorView;
  startAi: (draft: Draft, prompt: string) => void;
  insertSegment: (draft: Draft, segment: Lib.SegmentMetadata) => void;
};

export type Suggestions = {
  /** Changes when the draft or the stage changes, which resets the highlight. */
  key: string;
  draft: Draft;
  parsed: Parsed;
  stage: Stage;
  /** The caret, relative to the draft. */
  caret: number;
  groups: BarOptionGroup[];
  /** -1 means nothing is highlighted, so Enter does nothing until ↓. */
  defaultIndex: number;
  /**
   * Writes the option at an index into the text, for ↑ and ↓ through the
   * fields and the operators. The highlight follows the text. Returns false
   * for an option it can't write, like a segment.
   */
  previewOption?: (index: number) => boolean;
  /** The popover lists the logic operators in its footer. */
  showsLogicHint: boolean;
};

/** A text with this many words is likely a request, so the AI comes first. */
const SENTENCE_WORD_COUNT = 3;

export function getFieldGroups(schema: FilterSchema): SuggestionGroup[] {
  const groups: SuggestionGroup[] = [];
  schema.fields.forEach((field) => {
    const option = {
      value: field.key,
      label: field.label,
      aliases: field.aliases,
      icon: getColumnIcon(field.column.column),
    };
    const last = groups[groups.length - 1];
    if (last?.section === field.tableLabel) {
      last.options.push(option);
    } else {
      groups.push({ section: field.tableLabel, options: [option] });
    }
  });
  if (schema.segments.length > 0) {
    groups.unshift({
      section: t`Segments`,
      options: schema.segments.map((segment, index) => ({
        value: `segment:${index}`,
        label: Lib.displayInfo(schema.query, schema.stageIndex, segment)
          .displayName,
        icon: "segment" as const,
      })),
    });
  }
  return groups;
}

/** Bar options from suggestion groups, with an action for each option. */
export function toBarGroups(
  groups: SuggestionGroup[],
  run: (value: string) => void,
): BarOptionGroup[] {
  return groups.map((group) => ({
    section: group.section,
    label: group.label,
    options: group.options.map(
      (option): BarOption => ({
        id: option.value,
        label: option.label,
        icon: option.icon,
        description: option.description,
        leftSection: option.leftSection,
        isChecked: option.isChecked,
        share: option.share,
        run: () => run(option.value),
      }),
    ),
  }));
}

function askAiGroup(prompt: string, run: () => void): BarOptionGroup {
  return {
    section: t`AI`,
    options: [{ id: "ask-ai", label: t`Ask AI: “${prompt}”`, icon: "ai", run }],
  };
}

const LOGIC_WORDS = ["and", "or"];

/**
 * Version B: the connectors that the text could be the start of, like OR for
 * "o", at the bottom of the column list. A connector at the end of the text
 * is still a draft, because it could be the start of a column like "Orders".
 */
function getLogicGroup(
  text: string,
  insert: (word: string) => void,
): BarOptionGroup | null {
  const lowerText = text.toLowerCase();
  const words = LOGIC_WORDS.filter((word) => word.startsWith(lowerText));
  if (lowerText.length === 0 || words.length === 0) {
    return null;
  }
  return {
    section: t`Logic operators`,
    options: words.map((word) => ({
      id: `logic:${word}`,
      label: word.toUpperCase(),
      run: () => insert(word),
    })),
  };
}

function getSegment(schema: FilterSchema, value: string) {
  const match = /^segment:(\d+)$/.exec(value);
  return match != null ? schema.segments[Number(match[1])] : undefined;
}

/**
 * The field with its first operator, like "Total is equal to", which the bar
 * fills in when the user picks a field. The caret goes after the operator.
 */
export function getFieldWithOperatorText(field: SchemaField) {
  const [firstOperator] = field.operators ?? [];
  return firstOperator != null
    ? `${field.text} ${firstOperator.label}`
    : `${field.text} `;
}

/**
 * The text after the field when it is the start of an operator and the caret
 * is at its end, like "is equal t", or undefined.
 */
function getOperatorPrefix(parsed: Parsed, caret: number) {
  const operators = parsed.field?.operators;
  if (operators == null || parsed.op == null || caret !== parsed.text.length) {
    return undefined;
  }
  const prefix = parsed.text.slice(parsed.opStart).toLowerCase();
  const isPartialOperator = operators.some((op) =>
    op.aliases.some((alias) => alias !== prefix && alias.startsWith(prefix)),
  );
  return isPartialOperator && prefix.length > parsed.opEnd - parsed.opStart
    ? prefix
    : undefined;
}

/**
 * What the popover under the caret shows, from the current state of the
 * editor. The value stage only has its key here: the value popover adds its
 * options, which need the values of the column.
 */
export function getSuggestions(deps: SuggestDeps): Suggestions | null {
  const { view, schema, knownValues } = deps;
  const { state } = view;
  if (!state.selection.empty) {
    return getFieldPreview(deps);
  }
  const caretPos = state.selection.from;
  const draft = draftAt(state.doc, caretPos, schema, knownValues);
  const parsed = parseDraft(draft.text, schema, knownValues);
  const caret = caretPos - draft.from;
  // Backspacing into an operator, like "Total is equal t", searches the
  // operators instead of taking "equal t" as a value.
  const operatorPrefix = getOperatorPrefix(parsed, caret);
  const stage = operatorPrefix != null ? "operator" : stageOf(parsed, caret);
  const base = {
    key: `${draft.from}:${stage}:${draft.text}`,
    draft,
    parsed,
    stage,
    caret,
    showsLogicHint: stage === "empty" || stage === "field",
  };
  const ask = (prompt: string) =>
    askAiGroup(prompt, () => deps.startAi(draft, prompt));

  switch (stage) {
    case "empty": {
      const prev = state.doc.textBetween(Math.max(1, caretPos - 1), caretPos);
      const pad = prev && !/[\s(]/.test(prev) ? " " : "";
      const insert = (text: string) =>
        replaceText(view, caretPos, caretPos, pad + text);
      const groups: BarOptionGroup[] = [
        ...toBarGroups(getFieldGroups(schema), (value) => {
          const segment = getSegment(schema, value);
          if (segment != null) {
            deps.insertSegment(draft, segment);
            return;
          }
          const field = schema.getField(value);
          if (field != null) {
            insert(getFieldWithOperatorText(field));
          }
        }),
      ];
      return { ...base, groups, defaultIndex: -1 };
    }

    case "ai": {
      const prompt = draft.text.slice(AI_PREFIX.length).trim();
      return {
        ...base,
        groups: prompt ? [ask(prompt)] : [],
        defaultIndex: 0,
      };
    }

    case "field": {
      const end = parsed.field != null ? parsed.fieldEnd : draft.text.length;
      const searchText = draft.text.slice(0, end);
      const pickField = (field: SchemaField) => {
        let rest = end;
        while (draft.text[rest] === " ") {
          rest++;
        }
        replaceText(
          view,
          draft.from,
          draft.from + rest,
          getFieldWithOperatorText(field),
        );
      };
      const fieldGroups = toBarGroups(
        searchGroups(getFieldGroups(schema), searchText),
        (value) => {
          const segment = getSegment(schema, value);
          if (segment != null) {
            deps.insertSegment(draft, segment);
            return;
          }
          const field = schema.getField(value);
          if (field != null) {
            pickField(field);
          }
        },
      );
      const isSentence = draft.text.split(/\s+/).length >= SENTENCE_WORD_COUNT;
      const logicGroup = getLogicGroup(draft.text, (word) =>
        replaceText(view, draft.from, Math.max(draft.to, caretPos), `${word} `),
      );
      const searchGroupsWithAi =
        fieldGroups.length === 0
          ? logicGroup != null
            ? []
            : [ask(draft.text)]
          : isSentence
            ? [ask(draft.text), ...fieldGroups]
            : fieldGroups;
      const groups =
        logicGroup != null
          ? [...searchGroupsWithAi, logicGroup]
          : searchGroupsWithAi;
      // A whole connector word, like "or", is likely a connector, so Enter
      // picks it rather than a column that matches it.
      const isConnectorWord = LOGIC_WORDS.includes(draft.text.toLowerCase());
      const defaultIndex = isConnectorWord
        ? flattenOptions(groups).findIndex(
            (option) => option.id === `logic:${draft.text.toLowerCase()}`,
          )
        : 0;
      return { ...base, groups, defaultIndex };
    }

    case "operator": {
      const field = parsed.field;
      if (field?.operators == null) {
        return { ...base, groups: [], defaultIndex: 0 };
      }
      const lower = draft.text.toLowerCase();
      const typedText = (
        operatorPrefix ??
        (parsed.op != null
          ? lower.slice(parsed.opStart, parsed.opEnd)
          : lower.slice(parsed.fieldEnd))
      ).trim();
      // A whole operator, like the one filled in with the field, shows all
      // the operators with it highlighted, so ↑ and ↓ change it.
      const currentIndex =
        operatorPrefix == null && parsed.op != null && !parsed.valueText
          ? field.operators.indexOf(parsed.op)
          : -1;
      const searchText = currentIndex >= 0 ? "" : typedText;
      // The draft is trimmed, so when nothing follows the operator, the
      // replacement also covers the spaces up to the caret.
      const end =
        operatorPrefix == null && parsed.op != null && parsed.valueText
          ? draft.from + parsed.valueStart
          : Math.max(draft.to, caretPos);
      const operatorGroups = searchGroups(
        [
          {
            options: field.operators.map((op) => ({
              value: op.key,
              label: op.label,
              aliases: op.aliases,
            })),
          },
        ],
        searchText,
      );
      const groups = toBarGroups(operatorGroups, (key) => {
        const op = schema.getOperator(field, key);
        if (op == null) {
          return;
        }
        replaceText(
          view,
          draft.from + parsed.fieldEnd,
          end,
          ` ${op.label}${op.needsValue ? " " : ""}`,
        );
        settle(view, deps);
      });
      return {
        ...base,
        groups: groups.length > 0 ? groups : [ask(draft.text)],
        defaultIndex: Math.max(currentIndex, 0),
        // The list isn't filtered then, so an index is an operator's index.
        previewOption:
          currentIndex >= 0
            ? (index) => {
                const op = field.operators?.[index];
                if (op != null) {
                  replaceText(
                    view,
                    draft.from + parsed.fieldEnd,
                    end,
                    ` ${op.label}`,
                    { addToHistory: false },
                  );
                }
                return op != null;
              }
            : undefined,
      };
    }

    default:
      return { ...base, groups: [], defaultIndex: 0 };
  }
}

/**
 * Version B: the pre-filled field of a new filter is selected, so typing
 * replaces it. The popover shows all the fields with it highlighted, and ↑
 * and ↓ change it.
 */
function getFieldPreview(deps: SuggestDeps): Suggestions | null {
  const { view, schema, knownValues } = deps;
  const { from, to } = view.state.selection;
  const draft = draftAt(view.state.doc, to, schema, knownValues);
  const parsed = parseDraft(draft.text, schema, knownValues);
  const field = parsed.field;
  const isLoneFieldSelected =
    field != null &&
    from === draft.from &&
    to === draft.from + parsed.fieldEnd &&
    parsed.text.length === parsed.fieldEnd;
  if (!isLoneFieldSelected) {
    return null;
  }
  const groups = toBarGroups(getFieldGroups(schema), (value) => {
    const segment = getSegment(schema, value);
    if (segment != null) {
      deps.insertSegment(draft, segment);
      return;
    }
    const newField = schema.getField(value);
    if (newField != null) {
      replaceText(
        view,
        draft.from,
        draft.to,
        getFieldWithOperatorText(newField),
      );
    }
  });
  const options = flattenOptions(groups);
  return {
    key: `${draft.from}:fieldPreview:${draft.text}`,
    draft,
    parsed,
    stage: "field",
    caret: parsed.fieldEnd,
    groups,
    defaultIndex: options.findIndex((option) => option.id === field.key),
    showsLogicHint: true,
    previewOption: (index) => {
      const newField = schema.getField(options[index]?.id);
      if (newField == null) {
        return false;
      }
      replaceTextSelected(view, draft.from, draft.to, newField.text, {
        addToHistory: false,
      });
      return true;
    },
  };
}
