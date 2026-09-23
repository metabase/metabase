import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { TOOL_MESSAGES } from "metabase/metabot/constants";
import { Collapse, Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";
import { SearchResultsList } from "./SearchResults";
import { StackedFavicons } from "./StackedFavicons";
import { WebResultsList } from "./WebResults";
import { SEARCH_TOOL_NAME } from "./constants";
import { useNow } from "./hooks";
import {
  type ToolChainStep,
  activeToolLabel,
  doneToolLabel,
  formatElapsed,
  isTimedTool,
  isWebTool,
  renderTitle,
  searchResultCount,
  titledToolLabel,
  toolElapsedMs,
} from "./utils";

const toolLabelContent = (step: ToolChainStep, done: boolean) => {
  if (step.name === SEARCH_TOOL_NAME) {
    const label =
      titledToolLabel(step, done) ?? (done ? t`Searched` : t`Searching`);
    return (
      <>
        {renderTitle(label)}
        {step.searchResults && (
          <span className={S.resultCount}>
            {searchResultCount(step.searchResults)}
          </span>
        )}
      </>
    );
  }
  if (isWebTool(step.name)) {
    const label =
      titledToolLabel(step, done) ??
      (done ? doneToolLabel(step.name) : activeToolLabel(step.name));
    return (
      <>
        {renderTitle(label)}
        {step.webResults && (
          <>
            <StackedFavicons results={step.webResults.results} />
            <span className={S.resultCount}>
              {searchResultCount(step.webResults)}
            </span>
          </>
        )}
      </>
    );
  }
  const specific = titledToolLabel(step, done);
  if (specific) {
    return renderTitle(specific);
  }
  return done ? doneToolLabel(step.name) : activeToolLabel(step.name);
};

const ToolElapsed = ({
  step,
  live,
}: {
  step: ToolChainStep;
  live: boolean;
}) => {
  const now = useNow(live && step.endedAtMs == null);
  const elapsedMs = toolElapsedMs(step, now, live);
  if (elapsedMs == null) {
    return null;
  }
  return (
    <span className={S.resultCount} data-testid="metabot-tool-elapsed">
      {formatElapsed(elapsedMs)}
    </span>
  );
};

const ToolStepLabel = ({
  step,
  done,
  live,
  className,
}: {
  step: ToolChainStep;
  done: boolean;
  live: boolean;
  className?: string;
}) => (
  <Text component="span" className={className} c="inherit" lh="inherit">
    {toolLabelContent(step, done)}
    {isTimedTool(step.name) && <ToolElapsed step={step} live={live} />}
  </Text>
);

export const ResourceGroupStep = ({
  count,
  done,
}: {
  count: number;
  done: boolean;
}) => (
  <div className={S.toolStep}>
    <div className={cx(S.toolRow, S.toolRowStatic)}>
      <Text component="span" c="inherit">
        {done
          ? TOOL_MESSAGES.read_resource.done(count)
          : TOOL_MESSAGES.read_resource.active(count)}
      </Text>
    </div>
  </div>
);

export const ToolStep = ({
  step,
  done,
  animate,
}: {
  step: ToolChainStep;
  done: boolean;
  animate: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const hasResults =
    !!step.searchResults?.results.length || !!step.webResults?.results.length;

  return (
    <div className={S.toolStep}>
      <UnstyledButton
        className={cx(S.toolRow, !hasResults && S.toolRowStatic)}
        component={hasResults ? "button" : "div"}
        aria-expanded={hasResults ? open : undefined}
        onClick={hasResults ? () => setOpen((prev) => !prev) : undefined}
      >
        <ToolStepLabel
          step={step}
          done={done}
          live={animate && step.status === "started"}
        />
        {hasResults && (
          <Icon
            name="chevronright"
            size={10}
            className={cx(S.chevron, open && S.chevronOpen)}
          />
        )}
      </UnstyledButton>
      {hasResults && (
        <Collapse in={open}>
          <SearchResultsList step={step} animate={animate} />
          <WebResultsList step={step} animate={animate} />
        </Collapse>
      )}
    </div>
  );
};
