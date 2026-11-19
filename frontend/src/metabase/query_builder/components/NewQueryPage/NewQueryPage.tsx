import cx from "classnames";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { MetabotChat } from "metabase/metabot/components/MetabotChat";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { startNewConversation } from "metabase/metabot/state";
import { useQuestionFromOptsBuilder } from "metabase/metadata-store";
import {
  type NewQueryMode,
  newQueryUrl,
  parseNewQueryMode,
  setLastNewQueryMode,
  setNewQuerySqlExpandListener,
  setNewQuerySqlFullPage,
} from "metabase/nav/containers/ProtoNavbar/newQuery";
import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { useLocation, useNavigate } from "metabase/router";
import { getSetting } from "metabase/settings";
import { SegmentedControl, Title } from "metabase/ui";

import { QueryBuilder } from "../../containers/QueryBuilder";
import { resetQB } from "../../store/actions";
import { getQuestion } from "../../store/question-selectors";
import {
  getFirstQueryResult,
  getIsNative,
  getIsRunning,
} from "../../store/selectors";

import { NewQueryAiPrompt } from "./NewQueryAiPrompt";
import { NewQueryNotebookPrompt } from "./NewQueryNotebookPrompt";
import S from "./NewQueryPage.module.css";
import { useFlipAnimation } from "./useFlipAnimation";

const SUGGESTION_MODELS: SuggestionModel[] = [
  "dataset",
  "metric",
  "card",
  "table",
  "database",
  "dashboard",
];

const askConfig = {
  suggestionModels: SUGGESTION_MODELS,
};

function useIsEngaged(
  mode: NewQueryMode,
  notebookStarted: boolean,
  sqlExpanded: boolean,
): boolean {
  const { messages, isDoingScience } = useMetabotAgent("ask");
  const question = useSelector(getQuestion);
  const isNative = useSelector(getIsNative);
  const isRunning = useSelector(getIsRunning);
  const queryResult = useSelector(getFirstQueryResult);

  return useMemo(() => {
    if (mode === "ai") {
      return messages.length > 0 || isDoingScience;
    }

    if (mode === "notebook") {
      return (
        notebookStarted ||
        Boolean(question && !isNative && question.databaseId() != null)
      );
    }

    // Stay in the compact idle card until the user runs SQL or expands.
    if (mode === "sql") {
      return isNative && (sqlExpanded || isRunning || queryResult != null);
    }

    return false;
  }, [
    mode,
    messages.length,
    isDoingScience,
    question,
    isNative,
    notebookStarted,
    sqlExpanded,
    isRunning,
    queryResult,
  ]);
}

export function NewQueryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const buildQuestion = useQuestionFromOptsBuilder();
  const dispatch = useDispatch();
  const mode = parseNewQueryMode(location.pathname) ?? "ai";
  const [notebookStarted, setNotebookStarted] = useState(false);
  const [sqlExpanded, setSqlExpanded] = useState(false);
  const isEngaged = useIsEngaged(mode, notebookStarted, sqlExpanded);
  const { setVisible: setSidebarVisible } = useMetabotAgent("omnibot");
  const { conversationId: askConversationId } = useMetabotAgent("ask");
  const lastUsedDatabaseId = useSelector((state) =>
    getSetting(state, "last-used-native-database-id"),
  );
  const fresh = new URLSearchParams(location.search).get("fresh") ?? "";
  const queryBuilderKey = `${mode}-${fresh}`;
  const isSqlMode = mode === "sql";
  const isSqlIdle = isSqlMode && !isEngaged;
  const showChrome = !isEngaged;

  const aiPromptRef = useRef<HTMLDivElement>(null);
  useFlipAnimation(aiPromptRef, isEngaged, { enabled: mode === "ai" });

  useEffect(() => {
    setLastNewQueryMode(mode);
  }, [mode]);

  useEffect(() => {
    setSidebarVisible(false);
  }, [setSidebarVisible]);

  useEffect(() => {
    setNewQuerySqlExpandListener(() => setSqlExpanded(true));
    return () => setNewQuerySqlExpandListener(null);
  }, []);

  useEffect(() => {
    setNewQuerySqlFullPage(mode === "sql" && isEngaged);
    return () => setNewQuerySqlFullPage(false);
  }, [mode, isEngaged]);

  useEffect(() => {
    setNotebookStarted(false);
    setSqlExpanded(false);
    if (mode === "ai") {
      dispatch(startNewConversation({ agentId: "ask" }));
    }
    if (mode === "notebook") {
      dispatch(resetQB());
    }
    if (mode === "sql") {
      dispatch(
        setUIControls({
          isShowingDataReference: false,
          isShowingSnippetSidebar: false,
          isShowingTemplateTagsEditor: false,
          isNativeEditorOpen: true,
        }),
      );
    }
  }, [dispatch, mode, fresh]);

  useEffect(() => {
    if (mode === "sql" && isEngaged) {
      dispatch(setUIControls({ isNativeEditorOpen: true }));
    }
  }, [dispatch, mode, isEngaged]);

  const handleModeChange = (nextMode: string) => {
    if (nextMode === "ai" || nextMode === "notebook" || nextMode === "sql") {
      setNotebookStarted(false);
      setSqlExpanded(false);
      setLastNewQueryMode(nextMode);
      navigate(
        newQueryUrl(nextMode, {
          buildQuestion,
          databaseId: lastUsedDatabaseId ?? undefined,
        }),
      );
    }
  };

  const handleNotebookSelect = (url: string) => {
    setNotebookStarted(true);
    navigate(url);
  };

  return (
    <div className={cx(S.root, showChrome && S.rootIdle)}>
      <div className={cx(S.header, !showChrome && S.headerCollapsed)}>
        <Title order={2} className={S.title}>
          {t`New query`}
        </Title>
        <div className={S.promptColumn}>
          <SegmentedControl
            className={S.segmentedControl}
            fullWidth
            value={mode}
            onChange={handleModeChange}
            data={[
              { label: t`AI`, value: "ai" },
              { label: t`Query builder`, value: "notebook" },
              { label: t`SQL`, value: "sql" },
            ]}
          />
        </div>
      </div>

      {mode === "ai" && (
        <div className={S.aiStage}>
          <div className={cx(S.aiMessages, isEngaged && S.aiMessagesVisible)}>
            {isEngaged && (
              <MetabotChat
                conversationId={askConversationId}
                agentId="ask"
                config={askConfig}
                hideInput
                hideEmptyState
              />
            )}
          </div>
          <div
            ref={aiPromptRef}
            className={cx(S.aiPromptSlot, isEngaged && S.aiPromptSlotEngaged)}
          >
            <NewQueryAiPrompt engaged={isEngaged} />
          </div>
        </div>
      )}

      {mode === "notebook" && (
        <div className={S.notebookStage}>
          <div
            className={cx(
              S.notebookPromptSlot,
              isEngaged && S.notebookPromptSlotHidden,
            )}
          >
            <NewQueryNotebookPrompt
              key={queryBuilderKey}
              onSelect={handleNotebookSelect}
            />
          </div>
          <div
            className={cx(S.notebookFull, isEngaged && S.notebookFullVisible)}
          >
            {isEngaged && <QueryBuilder key={queryBuilderKey} />}
          </div>
        </div>
      )}

      {mode === "sql" && (
        <div
          className={cx(S.content, S.contentSql, isSqlIdle && S.contentSqlIdle)}
        >
          <div className={cx(S.sqlPrompt, isEngaged && S.sqlPromptEngaged)}>
            <QueryBuilder key={queryBuilderKey} />
          </div>
        </div>
      )}
    </div>
  );
}
