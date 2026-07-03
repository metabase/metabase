import type { Location } from "history";
import cx from "classnames";
import {
  type ComponentProps,
  type FocusEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import type { MetabotConfig } from "metabase/metabot/components/Metabot";
import { MetabotChat } from "metabase/metabot/components/MetabotChat";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { resetConversation } from "metabase/metabot/state";
import {
  type NewQueryMode,
  newQueryUrl,
  parseNewQueryMode,
  setLastNewQueryMode,
} from "metabase/nav/containers/ProtoNavbar/newQuery";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { getIsNative, getQuestion } from "metabase/query_builder/selectors";
import { useDispatch, useSelector } from "metabase/redux";
import { resetQB, setUIControls } from "metabase/redux/query-builder";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { getSetting } from "metabase/selectors/settings";
import { SegmentedControl, Title } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NewQueryAiPrompt } from "./NewQueryAiPrompt";
import { NewQueryNotebookPrompt } from "./NewQueryNotebookPrompt";
import S from "./NewQueryPage.module.css";
import { useFlipAnimation } from "./useFlipAnimation";

type Props = ComponentProps<typeof QueryBuilder> & {
  location: Location;
};

const SUGGESTION_MODELS: SuggestionModel[] = [
  "dataset",
  "metric",
  "card",
  "table",
  "database",
  "dashboard",
];

const askConfig: MetabotConfig = {
  agentId: "ask",
  suggestionModels: SUGGESTION_MODELS,
};

function useIsEngaged(
  mode: NewQueryMode,
  notebookStarted: boolean,
  sqlStarted: boolean,
): boolean {
  const { messages, isDoingScience } = useMetabotAgent("ask");
  const question = useSelector(getQuestion);
  const isNative = useSelector(getIsNative);

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

    if (mode === "sql") {
      return (
        sqlStarted ||
        Boolean(
          question &&
            isNative &&
            Lib.rawNativeQuery(question.query()).trim().length > 0,
        )
      );
    }

    return false;
  }, [
    mode,
    messages.length,
    isDoingScience,
    question,
    isNative,
    notebookStarted,
    sqlStarted,
  ]);
}

export function NewQueryPage(props: Props) {
  const { location } = props;
  const dispatch = useDispatch();
  const mode = parseNewQueryMode(location.pathname) ?? "ai";
  const [notebookStarted, setNotebookStarted] = useState(false);
  const [sqlStarted, setSqlStarted] = useState(false);
  const isEngaged = useIsEngaged(mode, notebookStarted, sqlStarted);
  const { setVisible: setSidebarVisible } = useMetabotAgent("omnibot");
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
    setNotebookStarted(false);
    setSqlStarted(false);
    if (mode === "ai") {
      dispatch(resetConversation({ agentId: "ask" }));
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
      setSqlStarted(false);
      setLastNewQueryMode(nextMode);
      dispatch(
        push(
          newQueryUrl(nextMode, {
            databaseId: lastUsedDatabaseId ?? undefined,
          }),
        ),
      );
    }
  };

  const handleNotebookSelect = (url: string) => {
    setNotebookStarted(true);
    dispatch(push(url));
  };

  const handleSqlFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("[data-testid='native-query-editor']")) {
      setSqlStarted(true);
    }
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
          <div
            className={cx(S.aiMessages, isEngaged && S.aiMessagesVisible)}
          >
            {isEngaged && (
              <MetabotChat
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
            <NewQueryNotebookPrompt onSelect={handleNotebookSelect} />
          </div>
          <div
            className={cx(S.notebookFull, isEngaged && S.notebookFullVisible)}
          >
            {isEngaged && (
              <QueryBuilder {...props} key={queryBuilderKey} />
            )}
          </div>
        </div>
      )}

      {mode === "sql" && (
        <div
          className={cx(
            S.content,
            S.contentSql,
            isSqlIdle && S.contentSqlIdle,
          )}
        >
          <div
            className={cx(S.sqlPrompt, isEngaged && S.sqlPromptEngaged)}
            onFocusCapture={handleSqlFocusCapture}
          >
            <QueryBuilder {...props} key={queryBuilderKey} />
          </div>
        </div>
      )}
    </div>
  );
}
