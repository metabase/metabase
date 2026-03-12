import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Group, Popover, TextInput } from "metabase/ui";
import type { ProjectionClause } from "metabase-lib/metric";

import {
  type ExpressionToken,
  MATH_OPERATORS,
  type MathOperator,
  isMathOperator,
} from "../../../types/operators";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SelectedMetric,
  SourceColorMap,
} from "../../../types/viewer-state";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../../../utils/source-ids";
import { MetricPill } from "../MetricPill";
import { MetricSearchDropdown } from "../MetricSearchDropdown";
import {
  cleanupParens,
  getSelectedMeasureIds,
  getSelectedMetricIds,
} from "../utils";

import S from "./MetricSearchInput.module.css";

// Metrics in the expression input can be used multiple times, so nothing is filtered out
const EMPTY_SET = new Set<number>();

type OperatorPillProps = {
  operator: MathOperator;
  onChange: (op: MathOperator) => void;
};

function OperatorPill({ operator, onChange }: OperatorPillProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="bottom"
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <Box
          component="button"
          className={S.operatorPill}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            setIsOpen((o) => !o);
          }}
          aria-label={t`Change operator`}
        >
          {operator}
        </Box>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Group gap="xs">
          {MATH_OPERATORS.map((op) => (
            <Box
              key={op}
              component="button"
              className={`${S.operatorChoice} ${op === operator ? S.operatorChoiceActive : ""}`}
              onClick={() => {
                onChange(op);
                setIsOpen(false);
              }}
              aria-label={op}
            >
              {op}
            </Box>
          ))}
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}

type MetricSearchInputProps = {
  tokens: ExpressionToken[];
  onTokensChange: (tokens: ExpressionToken[]) => void;
  selectedMetrics: SelectedMetric[];
  metricColors: SourceColorMap;
  definitions: MetricsViewerDefinitionEntry[];
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number, sourceType: "metric" | "measure") => void;
  onSwapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onSetBreakout: (
    id: MetricSourceId,
    dimension: ProjectionClause | undefined,
  ) => void;
};

export function MetricSearchInput({
  tokens,
  onTokensChange,
  selectedMetrics,
  metricColors,
  definitions,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
  onSetBreakout,
}: MetricSearchInputProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [pendingOperator, setPendingOperator] = useState<MathOperator | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Remove unnecessary parentheses: empty parens or parens around a single metric
  useEffect(() => {
    const cleaned = cleanupParens(tokens);
    if (cleaned !== tokens) {
      onTokensChange(cleaned);
    }
  }, [tokens, onTokensChange]);

  // Safety net: drop any metric tokens whose index is out of range
  useEffect(() => {
    const maxIdx = selectedMetrics.length - 1;
    const filtered = tokens.filter(
      (t) => t.type !== "metric" || t.metricIndex <= maxIdx,
    );
    if (filtered.length !== tokens.length) {
      onTokensChange(filtered);
    }
  }, [selectedMetrics.length, tokens, onTokensChange]);

  const selectedMetricIds = useMemo(
    () => getSelectedMetricIds(selectedMetrics),
    [selectedMetrics],
  );

  const selectedMeasureIds = useMemo(
    () => getSelectedMeasureIds(selectedMetrics),
    [selectedMetrics],
  );

  const definitionsBySourceId = useMemo(
    () => new Map(definitions.map((entry) => [entry.id, entry] as const)),
    [definitions],
  );

  // Derived state from tokens
  const openParenCount = useMemo(
    () => tokens.filter((t) => t.type === "open-paren").length,
    [tokens],
  );
  const closeParenCount = useMemo(
    () => tokens.filter((t) => t.type === "close-paren").length,
    [tokens],
  );
  const hasUnclosedParen = openParenCount > closeParenCount;
  const lastToken = tokens[tokens.length - 1] ?? null;

  // Whether we can insert a close-paren
  const canCloseParen =
    hasUnclosedParen &&
    pendingOperator === null &&
    (lastToken?.type === "metric" ||
      lastToken?.type === "constant" ||
      lastToken?.type === "close-paren");

  // Whether we can insert an open-paren
  const canOpenParen =
    pendingOperator !== null ||
    tokens.length === 0 ||
    lastToken?.type === "open-paren" ||
    lastToken?.type === "operator";

  const handleRemoveMetric = useCallback(
    (id: number, sourceType: "metric" | "measure") => {
      const index = selectedMetrics.findIndex(
        (m) => m.id === id && m.sourceType === sourceType,
      );
      if (index !== -1) {
        // Only remove from selectedMetrics when this is the last token referencing it
        const isLastReference =
          tokens.filter((t) => t.type === "metric" && t.metricIndex === index)
            .length <= 1;

        const tokenIdx = tokens.findIndex(
          (t) => t.type === "metric" && t.metricIndex === index,
        );
        if (tokenIdx !== -1) {
          const next = [...tokens];
          next.splice(tokenIdx, 1); // remove metric token

          // Remove adjacent operator (prefer before, then after)
          const before = next[tokenIdx - 1];
          const after = next[tokenIdx];
          if (before?.type === "operator") {
            next.splice(tokenIdx - 1, 1);
          } else if (after?.type === "operator") {
            next.splice(tokenIdx, 1);
          }

          onTokensChange(
            isLastReference
              ? next.map((t) =>
                  t.type === "metric" && t.metricIndex > index
                    ? { ...t, metricIndex: t.metricIndex - 1 }
                    : t,
                )
              : next,
          );
        }

        if (isLastReference) {
          onRemoveMetric(id, sourceType);
        }
      }
    },
    [selectedMetrics, tokens, onRemoveMetric, onTokensChange],
  );

  const handleSelect = useCallback(
    (metric: SelectedMetric) => {
      // Reuse the existing index if this metric is already in selectedMetrics
      // (addMetric is a no-op for duplicates, so length won't grow)
      const existingIndex = selectedMetrics.findIndex(
        (m) => m.id === metric.id && m.sourceType === metric.sourceType,
      );
      const metricIndex =
        existingIndex !== -1 ? existingIndex : selectedMetrics.length;
      onAddMetric(metric);
      onTokensChange([
        ...tokens,
        ...(pendingOperator !== null
          ? [{ type: "operator" as const, op: pendingOperator }]
          : []),
        { type: "metric" as const, metricIndex },
      ]);
      setPendingOperator(null);
      setSearchText("");
      setIsOpen(false);
    },
    [onAddMetric, onTokensChange, pendingOperator, selectedMetrics, tokens],
  );

  const commitConstant = useCallback(
    (value: number) => {
      onTokensChange([
        ...tokens,
        ...(pendingOperator !== null
          ? [{ type: "operator" as const, op: pendingOperator }]
          : []),
        { type: "constant" as const, value },
      ]);
      setPendingOperator(null);
      setSearchText("");
      setIsOpen(false);
    },
    [onTokensChange, pendingOperator, tokens],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Commit numeric constant when pressing Enter or an operator key
      const numValue = searchText !== "" ? Number(searchText) : NaN;
      if (searchText !== "" && !isNaN(numValue) && isFinite(numValue)) {
        if (event.key === "Enter") {
          event.preventDefault();
          commitConstant(numValue);
          return;
        }
        if (isMathOperator(event.key)) {
          event.preventDefault();
          commitConstant(numValue);
          setPendingOperator(event.key);
          setIsOpen(true);
          return;
        }
      }

      if (searchText === "") {
        // Operator keys
        if (
          isMathOperator(event.key) &&
          (lastToken?.type === "metric" ||
            lastToken?.type === "constant" ||
            lastToken?.type === "close-paren")
        ) {
          event.preventDefault();
          setPendingOperator(event.key);
          setIsOpen(true);
          return;
        }

        // Open paren
        if (event.key === "(" && canOpenParen) {
          event.preventDefault();
          onTokensChange([
            ...tokens,
            ...(pendingOperator !== null
              ? [{ type: "operator" as const, op: pendingOperator }]
              : []),
            { type: "open-paren" as const },
          ]);
          setPendingOperator(null);
          setIsOpen(true);
          return;
        }

        // Close paren
        if (event.key === ")" && canCloseParen) {
          event.preventDefault();
          onTokensChange([...tokens, { type: "close-paren" as const }]);
          return;
        }

        // Backspace
        if (event.key === "Backspace") {
          if (pendingOperator !== null) {
            setPendingOperator(null);
            return;
          }
          if (!lastToken) {
            return;
          }
          if (
            lastToken.type === "close-paren" ||
            lastToken.type === "open-paren" ||
            lastToken.type === "operator" ||
            lastToken.type === "constant"
          ) {
            let next = tokens.slice(0, -1);
            if (
              lastToken.type === "constant" &&
              next[next.length - 1]?.type === "operator"
            ) {
              next = next.slice(0, -1);
            }
            onTokensChange(next);
            return;
          }
          if (lastToken.type === "metric") {
            const metricIdx = lastToken.metricIndex;
            const metric = selectedMetrics[metricIdx];
            const isLastReference =
              tokens.filter(
                (t) => t.type === "metric" && t.metricIndex === metricIdx,
              ).length <= 1;
            let next = tokens.slice(0, -1);
            const prevToken = next[next.length - 1];
            if (prevToken?.type === "operator") {
              next = next.slice(0, -1);
            }
            onTokensChange(
              isLastReference
                ? next.map((t) =>
                    t.type === "metric" && t.metricIndex > metricIdx
                      ? { ...t, metricIndex: t.metricIndex - 1 }
                      : t,
                  )
                : next,
            );
            if (metric && isLastReference) {
              onRemoveMetric(metric.id, metric.sourceType);
            }
            return;
          }
        }
      }
    },
    [
      searchText,
      tokens,
      selectedMetrics,
      pendingOperator,
      lastToken,
      canOpenParen,
      canCloseParen,
      commitConstant,
      onRemoveMetric,
      onTokensChange,
    ],
  );

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleInputClick = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleChangeOperator = useCallback(
    (tokenIndex: number, newOp: MathOperator) => {
      onTokensChange(
        tokens.map((t, i) =>
          i === tokenIndex && t.type === "operator" ? { ...t, op: newOp } : t,
        ),
      );
    },
    [tokens, onTokensChange],
  );

  return (
    <Flex
      className={S.inputWrapper}
      bg="background-secondary"
      align="center"
      gap="sm"
      px="sm"
      py="xs"
      onClick={handleContainerClick}
    >
      <Flex align="center" gap="sm" flex={1} wrap="wrap" mih="2.25rem">
        {tokens.map((token, i) => {
          if (token.type === "open-paren") {
            return (
              <span key={i} className={S.parenToken}>
                (
              </span>
            );
          }
          if (token.type === "close-paren") {
            return (
              <span key={i} className={S.parenToken}>
                )
              </span>
            );
          }
          if (token.type === "operator") {
            return (
              <OperatorPill
                key={i}
                operator={token.op}
                onChange={(op) => handleChangeOperator(i, op)}
              />
            );
          }
          if (token.type === "constant") {
            return (
              <Box key={i} component="span" className={S.constantPill}>
                {token.value}
              </Box>
            );
          }
          if (token.type === "metric") {
            const metric = selectedMetrics[token.metricIndex];
            if (!metric) {
              return null;
            }
            const sid =
              metric.sourceType === "metric"
                ? createMetricSourceId(metric.id)
                : createMeasureSourceId(metric.id);
            const entry = definitionsBySourceId.get(sid);
            if (!entry) {
              return null;
            }
            return (
              <MetricPill
                key={i}
                metric={metric}
                colors={metricColors[sid]}
                definitionEntry={entry}
                selectedMetricIds={selectedMetricIds}
                selectedMeasureIds={selectedMeasureIds}
                onSwap={onSwapMetric}
                onRemove={handleRemoveMetric}
                onSetBreakout={(dimension) => onSetBreakout(sid, dimension)}
                onOpen={() => setIsOpen(false)}
              />
            );
          }
          return null;
        })}
        {pendingOperator !== null && (
          <Box
            component="span"
            className={`${S.operatorPill} ${S.operatorPillPending}`}
          >
            {pendingOperator}
          </Box>
        )}
        <Popover
          opened={isOpen}
          onChange={setIsOpen}
          position="bottom-start"
          shadow="md"
          withinPortal
        >
          <Popover.Target>
            <TextInput
              ref={inputRef}
              classNames={{ input: S.inputField }}
              flex={1}
              miw="7.5rem"
              ml="xs"
              variant="unstyled"
              placeholder={
                selectedMetrics.length === 0 ? t`Search for metrics...` : ""
              }
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setIsOpen(true);
              }}
              onClick={handleInputClick}
              onKeyDown={handleKeyDown}
              data-testid="metrics-viewer-search-input"
            />
          </Popover.Target>
          <Popover.Dropdown p={0} miw="19rem" maw="25rem">
            {isOpen && (
              <MetricSearchDropdown
                selectedMetricIds={EMPTY_SET}
                selectedMeasureIds={EMPTY_SET}
                onSelect={handleSelect}
                externalSearchText={searchText}
              />
            )}
          </Popover.Dropdown>
        </Popover>
      </Flex>
    </Flex>
  );
}
