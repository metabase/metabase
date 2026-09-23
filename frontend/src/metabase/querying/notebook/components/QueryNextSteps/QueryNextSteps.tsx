import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import {
  useRankQueryStepsMutation,
  useSuggestJoinEdgesMutation,
} from "metabase/api/jev";
import { selectMetadataProvider } from "metabase/metadata-store";
import { useDispatch, useStore } from "metabase/redux";
import { fetchTableMetadata } from "metabase/redux/tables";
import {
  Badge,
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { getDefaultJoinStrategy } from "../JoinStep/JoinDraft/utils";

import { type QueryStep, localCandidates } from "./candidates";

export function QueryNextSteps({
  question,
  updateQuestion,
}: {
  question: Question;
  updateQuestion: (question: Question) => Promise<void>;
}) {
  const query = question.query();
  const queryKey = JSON.stringify(Lib.toJsQuery(query));
  const latestKey = useRef(queryKey);
  latestKey.current = queryKey;
  const requestId = useRef(0);
  const dispatch = useDispatch();
  const store = useStore();
  const [findJoins] = useSuggestJoinEdgesMutation();
  const [rank] = useRankQueryStepsMutation();
  const [goal, setGoal] = useState("");
  const [steps, setSteps] = useState<QueryStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [summary, setSummary] = useState("");
  const [preview, setPreview] = useState<{
    step: QueryStep;
    query: Lib.Query;
  }>();

  useEffect(() => {
    requestId.current++;
    setSteps([]);
    setPreview(undefined);
    setSummary("");
    setBusy(false);
    setError(undefined);
  }, [queryKey, goal]);

  const discover = async () => {
    const id = ++requestId.current;
    const isCurrent = () =>
      requestId.current === id && latestKey.current === queryKey;
    setBusy(true);
    setError(undefined);
    setPreview(undefined);
    setSteps([]);
    try {
      const candidates = localCandidates(query);
      let tokens = 0;
      let joinCount = 0;
      let joinStatus = "";
      // Joins modify the source of a single-stage query, before its aggregation.
      const source = Lib.sourceTableOrCardId(query);
      if (typeof source === "number" && Lib.stageCount(query) === 1) {
        const joinedIds = Lib.joins(query, -1).map(
          (j) => Lib.pickerInfo(query, Lib.joinedThing(query, j))?.tableId,
        );
        const ids = [
          ...new Set([
            source,
            ...joinedIds.filter((id): id is number => typeof id === "number"),
          ]),
        ];
        if (ids.length <= 6) {
          const joins = await findJoins(ids).unwrap();
          joinCount = joins.tables_considered;
          if (joins.status === "unavailable") {
            joinStatus = t`Join suggestions unavailable.`;
          }
          tokens +=
            (joins.usage?.input_tokens ?? 0) +
            (joins.usage?.output_tokens ?? 0);
          for (const edge of joins.suggestions.slice(0, 4)) {
            candidates.push({
              id: `join_${edge.source_field_id}_${edge.target_field_id}`,
              kind: "join",
              title: t`Join ${edge.table_name}`,
              description: `${edge.condition}. ${edge.existing_fk ? t`Existing FK` : t`Inferred relationship`} · ${t`JEV confidence`}: ${Math.round(edge.confidence * 100)}%. ${t`A join can multiply rows; inspect the result.`}`,
              apply: async () => {
                await dispatch(fetchTableMetadata({ id: edge.table_id }));
                const provider = selectMetadataProvider(
                  store.getState(),
                  Lib.databaseID(query),
                );
                const fresh = Lib.fromJsQuery(provider, Lib.toJsQuery(query));
                const target = Lib.tableOrCardMetadata(fresh, edge.table_id);
                if (!target) {
                  throw new Error(t`Table metadata is unavailable.`);
                }
                const lhs = Lib.joinConditionLHSColumns(fresh, -1, target).find(
                  (c) =>
                    Lib.legacyRef(fresh, -1, c)[1] === edge.source_field_id,
                );
                const rhs = Lib.joinConditionRHSColumns(fresh, -1, target).find(
                  (c) =>
                    Lib.legacyRef(fresh, -1, c)[1] === edge.target_field_id,
                );
                if (!lhs || !rhs) {
                  throw new Error(
                    t`These join columns are not available in the current query.`,
                  );
                }
                const operator = Lib.joinConditionOperators(fresh, -1).find(
                  (op) => Lib.displayInfo(fresh, -1, op).shortName === "=",
                );
                if (!operator) {
                  throw new Error(t`Equality joins are unavailable.`);
                }
                return Lib.join(
                  fresh,
                  -1,
                  Lib.joinClause(
                    target,
                    [Lib.joinConditionClause(operator, lhs, rhs)],
                    getDefaultJoinStrategy(fresh, -1),
                  ),
                );
              },
            });
          }
        }
      }
      if (!isCurrent()) {
        return;
      }
      if (!candidates.length) {
        setSummary(t`No supported next steps were found for this query.`);
        return;
      }
      const current = Lib.visibleColumns(query, -1)
        .slice(0, 30)
        .map((c) => {
          const info = Lib.displayInfo(query, -1, c);
          return `${info.longDisplayName}: ${info.effectiveType}`;
        })
        .join("; ");
      const result = await rank({
        goal,
        current,
        candidates: candidates.map((s) => ({
          id: s.id,
          description: s.description,
        })),
      }).unwrap();
      if (!isCurrent()) {
        return;
      }
      const probabilities = result.answers?.next?.probabilities;
      if (!probabilities) {
        throw new Error(result.error ?? t`JEV could not rank these steps.`);
      }
      tokens +=
        (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
      setSteps(
        candidates
          .map((s) => ({ ...s, probability: probabilities[s.id] ?? 0 }))
          .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
          .slice(0, 6),
      );
      setSummary(
        `${t`${joinCount} nearby tables considered · ${tokens} reported JEV tokens`} ${t`Keep current query`}: ${Math.round((probabilities.none ?? 0) * 100)}%. ${joinStatus}`,
      );
    } catch (e) {
      if (isCurrent()) {
        setError(
          e instanceof Error ? e.message : t`Could not find next steps.`,
        );
      }
    } finally {
      if (isCurrent()) {
        setBusy(false);
      }
    }
  };

  const previewStep = async (step: QueryStep) => {
    const id = ++requestId.current;
    setBusy(true);
    setError(undefined);
    try {
      const next = await step.apply();
      if (latestKey.current === queryKey && requestId.current === id) {
        setPreview({ step, query: next });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t`Could not preview this change.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      mt="lg"
      p="md"
      bd="1px solid border"
      style={{ borderRadius: 8 }}
      data-testid="query-next-steps"
    >
      <Stack gap="sm">
        <Text fw="bold">{t`Suggested next steps · JEV experiment`}</Text>
        <Text
          size="sm"
          c="text-secondary"
        >{t`Explore joins, summaries, and calculated columns from your current query.`}</Text>
        <Group align="end">
          <TextInput
            style={{ flex: 1 }}
            label={t`What would you like to explore?`}
            placeholder={t`For example, compare reviews with approvals`}
            value={goal}
            maxLength={1000}
            onChange={(e) => setGoal(e.currentTarget.value)}
          />
          <Button
            onClick={discover}
            loading={busy}
          >{t`Find next steps`}</Button>
        </Group>
        {summary && (
          <Text size="xs" c="text-secondary">
            {summary}
          </Text>
        )}
        {error && (
          <Text role="alert" c="error">
            {error}
          </Text>
        )}
        {steps.map((step) => (
          <Group key={step.id} justify="space-between" wrap="nowrap">
            <Box style={{ flex: 1 }}>
              <Text fw="bold" size="sm">
                {step.title}
              </Text>
              <Text size="xs" c="text-secondary">
                {step.description}
              </Text>
            </Box>
            <Tooltip
              label={t`Relative JEV preference among the proposed steps; not a probability of correctness.`}
            >
              <Badge variant="outline">
                {Math.round((step.probability ?? 0) * 100)}%
              </Badge>
            </Tooltip>
            <Button
              size="xs"
              variant="subtle"
              disabled={busy}
              onClick={() => previewStep(step)}
            >{t`Preview`}</Button>
          </Group>
        ))}
        {preview && (
          <Box p="sm" bg="background-secondary">
            <Text fw="bold">
              {t`Proposed change`}: {preview.step.title}
            </Text>
            <Text size="sm">{preview.step.description}</Text>
            <Text
              size="xs"
              c="text-secondary"
            >{t`Apply updates the notebook. Run the query to inspect the results.`}</Text>
            <Group mt="sm">
              <Button
                disabled={busy}
                onClick={async () => {
                  if (latestKey.current !== queryKey) {
                    return;
                  }
                  setBusy(true);
                  try {
                    await updateQuestion(question.setQuery(preview.query));
                    setPreview(undefined);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : t`Could not apply this change.`,
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >{t`Apply change`}</Button>
              <Button
                variant="subtle"
                onClick={() => setPreview(undefined)}
              >{t`Cancel`}</Button>
            </Group>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
