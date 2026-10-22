import { type SyntheticEvent, useState } from "react";
import { t } from "ttag";

import { useSuggestSummaryFormulaMutation } from "metabase/metabot/api";
import {
  ActionIcon,
  Icon,
  Loader,
  Popover,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import type { Database } from "metabase-types/api";

import type {
  SummaryBase,
  SummaryDefinition,
  SummaryWellId,
} from "../../../../components/view/SummarySidebar/types";
import { replaceWithExpression } from "../../../../components/view/SummarySidebar/utils";

import S from "./SummarySidebar.module.css";
import {
  compileFormula,
  getExpressionMode,
  getFormulaRequest,
  getItemFormula,
} from "./ai-formula";

type ChangeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

type ChipAiEditProps = {
  base: SummaryBase;
  database: Database | undefined;
  definition: SummaryDefinition;
  wellId: SummaryWellId;
  itemId: string;
  label: string;
  onChange: (definition: SummaryDefinition) => void;
};

// the popover is portaled, but React events still bubble to the chip's drag handle and the well's focus handler
const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();

/**
 * A chip's ✨ button: describe a change ("only paid orders", "as a % of total") and AI rewrites the
 * item as a formula in place.
 */
export function ChipAiEdit({
  base,
  database,
  definition,
  wellId,
  itemId,
  label,
  onChange,
}: ChipAiEditProps) {
  const [isOpened, setIsOpened] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [changeState, setChangeState] = useState<ChangeState>({
    status: "idle",
  });
  const [suggestFormula] = useSuggestSummaryFormulaMutation();
  const isLoading = changeState.status === "loading";

  const close = () => {
    setIsOpened(false);
    setInstruction("");
    setChangeState({ status: "idle" });
  };

  const fail = (message: string) =>
    setChangeState({ status: "error", message });

  const handleSubmit = async () => {
    const prompt = instruction.trim();
    if (prompt.length === 0 || isLoading) {
      return;
    }
    setChangeState({ status: "loading" });
    const currentFormula = await getItemFormula(base, definition, itemId);
    if (currentFormula == null) {
      fail(t`This item can't be changed with AI.`);
      return;
    }
    const expressionMode = getExpressionMode(wellId);
    const { data } = await suggestFormula(
      getFormulaRequest(base, prompt, expressionMode, {
        expression: currentFormula,
        name: label,
      }),
    );
    const source = data?.expression;
    if (source == null) {
      fail(data?.error ?? t`Couldn't change it. Try again.`);
      return;
    }
    const compiled = compileFormula(base, database, expressionMode, {
      source,
      name: data?.name || label,
    });
    if ("error" in compiled) {
      fail(t`The new formula didn't work: ${compiled.error}`);
      return;
    }
    onChange(replaceWithExpression(definition, itemId, compiled.expression));
    close();
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      width={300}
      shadow="md"
      trapFocus
      onChange={(opened) => (opened ? setIsOpened(true) : close())}
    >
      <Popover.Target>
        <Tooltip label={t`Change with AI`} disabled={isOpened}>
          <ActionIcon
            className={S.chipAiEdit}
            size="sm"
            variant="subtle"
            c="inherit"
            aria-label={t`Change ${label} with AI`}
            onClick={() => (isOpened ? close() : setIsOpened(true))}
          >
            <Icon name="sparkles" size={12} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown
        p="sm"
        onPointerDown={stopPropagation}
        onMouseDown={stopPropagation}
        data-testid="summary-chip-ai-edit"
      >
        <TextInput
          size="sm"
          value={instruction}
          readOnly={isLoading}
          placeholder={t`Describe a change to ${label}`}
          aria-label={t`Describe a change to ${label}`}
          leftSection={
            isLoading ? <Loader size="xs" /> : <Icon name="sparkles" />
          }
          onChange={(event) => {
            setInstruction(event.currentTarget.value);
            setChangeState({ status: "idle" });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSubmit();
            } else if (event.key === "Escape") {
              close();
            }
          }}
        />
        <Text
          size="sm"
          mt="xs"
          c={
            changeState.status === "error"
              ? "feedback-negative"
              : "text-secondary"
          }
        >
          {changeState.status === "error"
            ? changeState.message
            : t`e.g. only orders with a discount, or the median instead`}
        </Text>
      </Popover.Dropdown>
    </Popover>
  );
}
