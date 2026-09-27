import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { TOOL_MESSAGES } from "metabase/metabot/constants";
import { Collapse, Icon, Text, UnstyledButton } from "metabase/ui";

import { ExploreIdeasList, exploreIdeasCount } from "./ExploreIdeas";
import S from "./MetabotChainOfThought.module.css";
import { SearchResultsList } from "./SearchResults";
import { EXPLORE_TABLE_TOOL_NAME, SEARCH_TOOL_NAME } from "./constants";
import {
  type ToolChainStep,
  activeToolLabel,
  doneToolLabel,
  renderTitle,
  searchResultCount,
  titledToolLabel,
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
  if (step.name === EXPLORE_TABLE_TOOL_NAME && step.exploreIdeas?.length) {
    return (
      <>
        {done ? doneToolLabel(step.name) : activeToolLabel(step.name)}
        <span className={S.resultCount}>
          {exploreIdeasCount(step.exploreIdeas)}
        </span>
      </>
    );
  }
  const specific = titledToolLabel(step, done);
  if (specific) {
    return renderTitle(specific);
  }
  return done ? doneToolLabel(step.name) : activeToolLabel(step.name);
};

const ToolStepLabel = ({
  step,
  done,
  className,
}: {
  step: ToolChainStep;
  done: boolean;
  className?: string;
}) => (
  <Text component="span" className={className} c="inherit" lh="inherit">
    {toolLabelContent(step, done)}
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
  const ideas = step.exploreIdeas ?? [];
  const hasResults = !!step.searchResults?.results.length || ideas.length > 0;
  // The ideas are the interesting part while the step runs, so show them without a click.
  const expanded = open || (ideas.length > 0 && !done);

  return (
    <div className={S.toolStep}>
      <UnstyledButton
        className={cx(S.toolRow, !hasResults && S.toolRowStatic)}
        component={hasResults ? "button" : "div"}
        aria-expanded={hasResults ? expanded : undefined}
        onClick={hasResults ? () => setOpen((prev) => !prev) : undefined}
      >
        <ToolStepLabel step={step} done={done} />
        {hasResults && (
          <Icon
            name="chevronright"
            size={10}
            className={cx(S.chevron, expanded && S.chevronOpen)}
          />
        )}
      </UnstyledButton>
      {hasResults && (
        <Collapse in={expanded}>
          <SearchResultsList step={step} animate={animate} />
          {ideas.length > 0 && (
            <ExploreIdeasList ideas={ideas} done={done} animate={animate} />
          )}
        </Collapse>
      )}
    </div>
  );
};
